import { db } from "../../db/client"
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { page, type PaginationQuery } from "../../shared/pagination"
import { auditService, type AuditActor } from "../audit/audit.service"
import { pickupPointRepository } from "../pickup-point/pickup-point.repository"
import type { CreateVehicleInput, ListVehicleAssignmentsQuery, ListVehiclesQuery, ManualAssignVehicleInput, SetVehicleAssignmentLockInput, UpdateVehicleInput } from "./vehicle.dto"
import { vehicleRepository } from "./vehicle.repository"

const ENTITY = "vehicle"

export const vehicleService = {
	async list(eventId: string, query: ListVehiclesQuery, pagination: PaginationQuery) {
		const result = await vehicleRepository.list(eventId, query, pagination)
		return page(result.items, result.total, pagination)
	},
	async create(eventId: string, input: CreateVehicleInput, actor: AuditActor) {
		await validatePickupPoint(eventId, input.pickupPointId)
		const code = input.code.toUpperCase()
		if (await vehicleRepository.findByCodeLeg(eventId, code, input.leg)) throw new ConflictError(`Đã có xe ${code} cho chặng này.`)
		return db.transaction(async (tx) => {
			const created = await vehicleRepository.insert({ id: newId(), eventId, ...input, code }, tx)
			await auditService.record({ eventId, actor, entity: ENTITY, entityId: created.id, action: "create", after: created }, tx)
			return { ...created, assignedCount: 0 }
		})
	},
	async update(eventId: string, id: string, input: UpdateVehicleInput, actor: AuditActor) {
		const before = await vehicleRepository.findById(eventId, id)
		if (!before) throw new NotFoundError("Vehicle")
		const next = { ...before, ...input, code: input.code?.toUpperCase() ?? before.code }
		if (next.departAt < next.gatherAt) throw new ValidationError("Giờ khởi hành không được trước giờ tập trung.")
		if (next.capacity < before.assignedCount) throw new ConflictError(`Xe đang có ${before.assignedCount} người, không thể giảm còn ${next.capacity} chỗ.`)
		if (input.pickupPointId !== undefined) await validatePickupPoint(eventId, input.pickupPointId)
		const collision = await vehicleRepository.findByCodeLeg(eventId, next.code, next.leg)
		if (collision && collision.id !== id) throw new ConflictError(`Đã có xe ${next.code} cho chặng này.`)
		return db.transaction(async (tx) => {
			const updated = await vehicleRepository.update(eventId, id, { ...input, code: next.code }, tx)
			if (!updated) throw new NotFoundError("Vehicle")
			const after = { ...updated, assignedCount: before.assignedCount }
			await auditService.record({ eventId, actor, entity: ENTITY, entityId: id, action: "update", before, after }, tx)
			return after
		})
	},
	async delete(eventId: string, id: string, actor: AuditActor) {
		const before = await vehicleRepository.findById(eventId, id)
		if (!before) throw new NotFoundError("Vehicle")
		if (before.assignedCount > 0) throw new ConflictError("Không thể xóa xe đang có người được phân bổ.")
		await db.transaction(async (tx) => {
			if (!(await vehicleRepository.delete(eventId, id, tx))) throw new NotFoundError("Vehicle")
			await auditService.record({ eventId, actor, entity: ENTITY, entityId: id, action: "delete", before }, tx)
		})
	},
	async listAssignments(eventId: string, query: ListVehicleAssignmentsQuery, pagination: PaginationQuery) {
		const legs = query.leg ? [query.leg] : ["origin_to_airport", "airport_to_hotel", "hotel_to_airport", "airport_to_origin"] as const
		const [assignments, ...candidateLists] = await Promise.all([
			vehicleRepository.listAssignments(eventId), ...legs.map((leg) => vehicleRepository.listCandidates(eventId, leg)),
		])
		const byKey = new Map(assignments.map((row) => [`${row.assignment.registrationId}:${row.assignment.leg}`, row]))
		let items = candidateLists.flatMap((rows, index) => rows.map((candidate) => {
			const leg = legs[index]!
			const row = byKey.get(`${candidate.id}:${leg}`)
			return { registrationId: candidate.id, leg, user: candidate.user, team: candidate.team, pickupPointId: candidate.pickupPointId, flightId: candidate.flightId,
				assignment: row ? { ...row.assignment, vehicle: row.vehicle } : null }
		}))
		if (query.search) {
			const needle = query.search.toLocaleLowerCase("vi")
			items = items.filter((row) => row.user.name.toLocaleLowerCase("vi").includes(needle) || row.user.email.toLocaleLowerCase("vi").includes(needle))
		}
		return page(items.slice(pagination.offset, pagination.offset + pagination.limit), items.length, pagination)
	},
	async manualAssign(eventId: string, input: ManualAssignVehicleInput, actor: AuditActor) {
		return db.transaction(async (tx) => {
			const target = await vehicleRepository.findById(eventId, input.vehicleId, tx)
			if (!target) throw new NotFoundError("Vehicle")
			const candidates = await vehicleRepository.findCandidatesByIds(eventId, target.leg, input.registrationIds, tx)
			if (candidates.length !== new Set(input.registrationIds).size) throw new ValidationError("Có CBNV không cần xe ở chặng này hoặc không thuộc kỳ.")
			const before = await vehicleRepository.findAssignmentsForRegistrations(eventId, target.leg, input.registrationIds, tx)
			const already = before.filter((row) => row.assignment.vehicleId === target.id).length
			const finalOccupancy = target.assignedCount - already + candidates.length
			if (finalOccupancy > target.capacity) throw new ConflictError(`Xe ${target.code} không đủ chỗ; cần thêm ${finalOccupancy - target.capacity} chỗ.`)
			await vehicleRepository.upsertManualAssignments(eventId, target.id, target.leg, actor.id, input.registrationIds, tx)
			const after = await vehicleRepository.findAssignmentsForRegistrations(eventId, target.leg, input.registrationIds, tx)
			await auditService.record({ eventId, actor, entity: "vehicle_assignment", entityId: target.id, action: "manual_assign", before, after, reason: input.reason }, tx)
			return { updated: candidates.length }
		})
	},
	async setAssignmentLock(eventId: string, id: string, input: SetVehicleAssignmentLockInput, actor: AuditActor) {
		return db.transaction(async (tx) => {
			const before = await vehicleRepository.findAssignmentById(eventId, id, tx)
			if (!before) throw new NotFoundError("Vehicle assignment")
			const after = await vehicleRepository.setAssignmentLock(eventId, id, input.locked, tx)
			if (!after) throw new NotFoundError("Vehicle assignment")
			await auditService.record({ eventId, actor, entity: "vehicle_assignment", entityId: id, action: input.locked ? "lock" : "unlock", before: before.assignment, after, reason: input.reason }, tx)
			return after
		})
	},
}

async function validatePickupPoint(eventId: string, pickupPointId: string | null) {
	if (pickupPointId && !(await pickupPointRepository.findById(eventId, pickupPointId))) {
		throw new ValidationError("Điểm đón không thuộc kỳ này.")
	}
}
