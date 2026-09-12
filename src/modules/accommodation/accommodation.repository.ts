import { and, asc, count, eq, ilike, or } from "drizzle-orm"
import { db, type DbExecutor } from "../../db/client"
import { employeeProfile, hotel, registration, room, roomAssignment, roomType, user } from "../../db/schema"
import { newId } from "../../shared/id"
import type { CreateHotelInput, CreateRoomInput, CreateRoomTypeInput, ListRoomsQuery, UpdateHotelInput, UpdateRoomInput, UpdateRoomTypeInput } from "./accommodation.dto"

export type HotelRow = typeof hotel.$inferSelect
export type RoomTypeRow = typeof roomType.$inferSelect
export type RoomRow = typeof room.$inferSelect

export const accommodationRepository = {
	async listHotels(eventId: string, executor: DbExecutor = db) {
		return executor.select({ hotel, roomCount: count(room.id) }).from(hotel).leftJoin(room, eq(hotel.id, room.hotelId))
			.where(eq(hotel.eventId, eventId)).groupBy(hotel.id).orderBy(asc(hotel.name))
	},
	async findHotel(eventId: string, id: string, executor: DbExecutor = db) {
		return (await executor.select().from(hotel).where(and(eq(hotel.eventId, eventId), eq(hotel.id, id))).limit(1))[0]
	},
	async findHotelByName(eventId: string, name: string, executor: DbExecutor = db) {
		return (await executor.select().from(hotel).where(and(eq(hotel.eventId, eventId), eq(hotel.name, name))).limit(1))[0]
	},
	async insertHotel(eventId: string, input: CreateHotelInput, executor: DbExecutor = db) {
		return (await executor.insert(hotel).values({ id: newId(), eventId, ...input }).returning())[0]!
	},
	async updateHotel(eventId: string, id: string, input: UpdateHotelInput, executor: DbExecutor = db) {
		return (await executor.update(hotel).set({ ...input, updatedAt: new Date() }).where(and(eq(hotel.eventId, eventId), eq(hotel.id, id))).returning())[0]
	},
	async deleteHotel(eventId: string, id: string, executor: DbExecutor = db) {
		return (await executor.delete(hotel).where(and(eq(hotel.eventId, eventId), eq(hotel.id, id)))).rowsAffected > 0
	},
	async listRoomTypes(eventId: string, hotelId?: string, executor: DbExecutor = db) {
		return executor.select().from(roomType).where(and(eq(roomType.eventId, eventId), hotelId ? eq(roomType.hotelId, hotelId) : undefined)).orderBy(asc(roomType.name))
	},
	async findRoomType(eventId: string, id: string, executor: DbExecutor = db) {
		return (await executor.select().from(roomType).where(and(eq(roomType.eventId, eventId), eq(roomType.id, id))).limit(1))[0]
	},
	async insertRoomType(eventId: string, hotelId: string, input: CreateRoomTypeInput, executor: DbExecutor = db) {
		return (await executor.insert(roomType).values({ id: newId(), eventId, hotelId, ...input }).returning())[0]!
	},
	async updateRoomType(eventId: string, id: string, input: UpdateRoomTypeInput, executor: DbExecutor = db) {
		return (await executor.update(roomType).set({ ...input, updatedAt: new Date() }).where(and(eq(roomType.eventId, eventId), eq(roomType.id, id))).returning())[0]
	},
	async deleteRoomType(eventId: string, id: string, executor: DbExecutor = db) {
		return (await executor.delete(roomType).where(and(eq(roomType.eventId, eventId), eq(roomType.id, id)))).rowsAffected > 0
	},
	async listRooms(eventId: string, query: ListRoomsQuery = {}, executor: DbExecutor = db) {
		const conditions = [eq(room.eventId, eventId)]
		if (query.hotelId) conditions.push(eq(room.hotelId, query.hotelId))
		if (query.search) conditions.push(or(ilike(room.code, `%${query.search}%`), ilike(hotel.name, `%${query.search}%`))!)
		return executor.select({ room, hotel, roomType, assignedCount: count(roomAssignment.id) }).from(room)
			.innerJoin(hotel, eq(room.hotelId, hotel.id)).innerJoin(roomType, eq(room.roomTypeId, roomType.id))
			.leftJoin(roomAssignment, eq(room.id, roomAssignment.roomId)).where(and(...conditions)).groupBy(room.id).orderBy(asc(hotel.name), asc(room.code))
	},
	async findRoom(eventId: string, id: string, executor: DbExecutor = db) {
		return (await executor.select({ room, assignedCount: count(roomAssignment.id) }).from(room).leftJoin(roomAssignment, eq(room.id, roomAssignment.roomId))
			.where(and(eq(room.eventId, eventId), eq(room.id, id))).groupBy(room.id).limit(1))[0]
	},
	async insertRoom(eventId: string, hotelId: string, input: CreateRoomInput, executor: DbExecutor = db) {
		return (await executor.insert(room).values({ id: newId(), eventId, hotelId, ...input, code: input.code.toUpperCase() }).returning())[0]!
	},
	async updateRoom(eventId: string, id: string, input: UpdateRoomInput, executor: DbExecutor = db) {
		return (await executor.update(room).set({ ...input, code: input.code?.toUpperCase(), updatedAt: new Date() }).where(and(eq(room.eventId, eventId), eq(room.id, id))).returning())[0]
	},
	async deleteRoom(eventId: string, id: string, executor: DbExecutor = db) {
		return (await executor.delete(room).where(and(eq(room.eventId, eventId), eq(room.id, id)))).rowsAffected > 0
	},
	async listParticipants(eventId: string, executor: DbExecutor = db) {
		return executor.select({ registrationId: registration.id, employeeCode: employeeProfile.employeeCode, name: user.name, email: user.email })
			.from(registration).innerJoin(user, eq(registration.userId, user.id)).leftJoin(employeeProfile, eq(user.id, employeeProfile.userId))
			.where(and(eq(registration.eventId, eventId), eq(registration.participating, true))).orderBy(asc(user.name))
	},
	async listAssignments(eventId: string, executor: DbExecutor = db) {
		return executor.select({ assignment: roomAssignment, room, hotel, employeeCode: employeeProfile.employeeCode, name: user.name, email: user.email })
			.from(roomAssignment).innerJoin(room, eq(roomAssignment.roomId, room.id)).innerJoin(hotel, eq(room.hotelId, hotel.id))
			.innerJoin(registration, eq(roomAssignment.registrationId, registration.id)).innerJoin(user, eq(registration.userId, user.id))
			.leftJoin(employeeProfile, eq(user.id, employeeProfile.userId)).where(eq(roomAssignment.eventId, eventId)).orderBy(asc(hotel.name), asc(room.code), asc(user.name))
	},
	async replaceImportedAssignments(eventId: string, actorId: string, rows: { roomId: string; registrationId: string }[], executor: DbExecutor = db) {
		await executor.delete(roomAssignment).where(and(eq(roomAssignment.eventId, eventId), eq(roomAssignment.source, "import")))
		const assignedAt = new Date()
		for (const row of rows) await executor.insert(roomAssignment).values({ id: newId(), eventId, ...row, source: "import", locked: true, assignedBy: actorId, assignedAt })
	},
}
