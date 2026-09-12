import { db } from "../../db/client"
import { roomAssignmentColumns } from "../../excel/room-assignment.map"
import { readSheet } from "../../excel/reader"
import { writeSheet } from "../../excel/writer"
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors"
import { auditService, type AuditActor } from "../audit/audit.service"
import type { CreateHotelInput, CreateRoomInput, CreateRoomTypeInput, ListRoomsQuery, UpdateHotelInput, UpdateRoomInput, UpdateRoomTypeInput } from "./accommodation.dto"
import { accommodationRepository } from "./accommodation.repository"
import { validateRoomAssignments } from "./room-assignment.validate"

export const accommodationService = {
	listHotels: (eventId: string) => accommodationRepository.listHotels(eventId),
	listRoomTypes: (eventId: string, hotelId?: string) => accommodationRepository.listRoomTypes(eventId, hotelId),
	listRooms: (eventId: string, query: ListRoomsQuery) => accommodationRepository.listRooms(eventId, query),
	listAssignments: (eventId: string) => accommodationRepository.listAssignments(eventId),
	async createHotel(eventId: string, input: CreateHotelInput, actor: AuditActor) {
		if (await accommodationRepository.findHotelByName(eventId, input.name)) throw new ConflictError("Kỳ này đã có khách sạn cùng tên.")
		return db.transaction(async (tx) => {
			const created = await accommodationRepository.insertHotel(eventId, input, tx)
			await auditService.record({ eventId, actor, entity: "hotel", entityId: created.id, action: "create", after: created }, tx)
			return created
		})
	},
	async updateHotel(eventId: string, id: string, input: UpdateHotelInput, actor: AuditActor) {
		const before = await accommodationRepository.findHotel(eventId, id)
		if (!before) throw new NotFoundError("Hotel")
		if (input.name) {
			const collision = await accommodationRepository.findHotelByName(eventId, input.name)
			if (collision && collision.id !== id) throw new ConflictError("Kỳ này đã có khách sạn cùng tên.")
		}
		return db.transaction(async (tx) => {
			const after = await accommodationRepository.updateHotel(eventId, id, input, tx)
			if (!after) throw new NotFoundError("Hotel")
			await auditService.record({ eventId, actor, entity: "hotel", entityId: id, action: "update", before, after }, tx)
			return after
		})
	},
	async deleteHotel(eventId: string, id: string, actor: AuditActor) {
		const before = await accommodationRepository.findHotel(eventId, id)
		if (!before) throw new NotFoundError("Hotel")
		if ((await accommodationRepository.listRooms(eventId, { hotelId: id })).length) throw new ConflictError("Hãy xóa các phòng trước khi xóa khách sạn.")
		await db.transaction(async (tx) => {
			await accommodationRepository.deleteHotel(eventId, id, tx)
			await auditService.record({ eventId, actor, entity: "hotel", entityId: id, action: "delete", before }, tx)
		})
	},
	async createRoomType(eventId: string, hotelId: string, input: CreateRoomTypeInput, actor: AuditActor) {
		if (!(await accommodationRepository.findHotel(eventId, hotelId))) throw new NotFoundError("Hotel")
		return db.transaction(async (tx) => {
			const created = await accommodationRepository.insertRoomType(eventId, hotelId, input, tx)
			await auditService.record({ eventId, actor, entity: "room_type", entityId: created.id, action: "create", after: created }, tx)
			return created
		})
	},
	async updateRoomType(eventId: string, id: string, input: UpdateRoomTypeInput, actor: AuditActor) {
		const before = await accommodationRepository.findRoomType(eventId, id)
		if (!before) throw new NotFoundError("Room type")
		return db.transaction(async (tx) => {
			const after = await accommodationRepository.updateRoomType(eventId, id, input, tx)
			if (!after) throw new NotFoundError("Room type")
			await auditService.record({ eventId, actor, entity: "room_type", entityId: id, action: "update", before, after }, tx)
			return after
		})
	},
	async deleteRoomType(eventId: string, id: string, actor: AuditActor) {
		const before = await accommodationRepository.findRoomType(eventId, id)
		if (!before) throw new NotFoundError("Room type")
		if ((await accommodationRepository.listRooms(eventId, { hotelId: before.hotelId })).some((row) => row.room.roomTypeId === id)) throw new ConflictError("Loại phòng đang được sử dụng.")
		await db.transaction(async (tx) => {
			await accommodationRepository.deleteRoomType(eventId, id, tx)
			await auditService.record({ eventId, actor, entity: "room_type", entityId: id, action: "delete", before }, tx)
		})
	},
	async createRoom(eventId: string, hotelId: string, input: CreateRoomInput, actor: AuditActor) {
		const type = await accommodationRepository.findRoomType(eventId, input.roomTypeId)
		if (!type || type.hotelId !== hotelId) throw new ValidationError("Loại phòng không thuộc khách sạn này.")
		return db.transaction(async (tx) => {
			const created = await accommodationRepository.insertRoom(eventId, hotelId, input, tx)
			await auditService.record({ eventId, actor, entity: "room", entityId: created.id, action: "create", after: created }, tx)
			return created
		})
	},
	async updateRoom(eventId: string, id: string, input: UpdateRoomInput, actor: AuditActor) {
		const before = await accommodationRepository.findRoom(eventId, id)
		if (!before) throw new NotFoundError("Room")
		if (input.capacity !== undefined && input.capacity < before.assignedCount) throw new ConflictError(`Phòng đang có ${before.assignedCount} người.`)
		if (input.roomTypeId) {
			const type = await accommodationRepository.findRoomType(eventId, input.roomTypeId)
			if (!type || type.hotelId !== before.room.hotelId) throw new ValidationError("Loại phòng không thuộc khách sạn này.")
		}
		return db.transaction(async (tx) => {
			const after = await accommodationRepository.updateRoom(eventId, id, input, tx)
			if (!after) throw new NotFoundError("Room")
			await auditService.record({ eventId, actor, entity: "room", entityId: id, action: "update", before, after }, tx)
			return after
		})
	},
	async deleteRoom(eventId: string, id: string, actor: AuditActor) {
		const before = await accommodationRepository.findRoom(eventId, id)
		if (!before) throw new NotFoundError("Room")
		if (before.assignedCount) throw new ConflictError("Không thể xóa phòng đã có người.")
		await db.transaction(async (tx) => {
			await accommodationRepository.deleteRoom(eventId, id, tx)
			await auditService.record({ eventId, actor, entity: "room", entityId: id, action: "delete", before }, tx)
		})
	},
	async importAssignments(eventId: string, fileName: string, buffer: Buffer, actor: AuditActor) {
		const sheet = await readSheet(buffer, roomAssignmentColumns)
		if (!sheet.rows.length) throw new ValidationError("File không có dòng dữ liệu nào.")
		const [participants, rooms, current] = await Promise.all([
			accommodationRepository.listParticipants(eventId), accommodationRepository.listRooms(eventId), accommodationRepository.listAssignments(eventId),
		])
		const outcome = validateRoomAssignments(
			sheet.rows.map((row) => ({ excelRow: row.excelRow, employeeCode: row.values.employeeCode ?? "", hotelName: row.values.hotelName ?? "", roomCode: row.values.roomCode ?? "" })),
			participants,
			rooms.map((row) => ({ roomId: row.room.id, hotelName: row.hotel.name, roomCode: row.room.code, capacity: row.room.capacity })),
			current.filter((row) => row.assignment.source === "manual").map((row) => ({ registrationId: row.assignment.registrationId, roomId: row.room.id })),
		)
		if (!outcome.ok) throw new ValidationError(`File có ${outcome.errors.length} lỗi. Chưa ghi dòng nào.`, { totalErrors: outcome.errors.length, errors: outcome.errors })
		await db.transaction(async (tx) => {
			await accommodationRepository.replaceImportedAssignments(eventId, actor.id, outcome.records, tx)
			await auditService.record({ eventId, actor, entity: "room_assignment", entityId: eventId, action: "import", after: { fileName, total: outcome.records.length } }, tx)
		})
		return { fileName, total: outcome.records.length }
	},
	async exportAssignments(eventId: string) {
		const rows = await accommodationRepository.listAssignments(eventId)
		return writeSheet("Phân phòng", roomAssignmentColumns, rows.map((row) => ({ employeeCode: row.employeeCode ?? "", hotelName: row.hotel.name, roomCode: row.room.code })))
	},
}
