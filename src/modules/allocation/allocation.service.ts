import { db } from "../../db/client"
import type {
	AllocationStats,
	FlightDirection,
	StoredFlightAllocationPlan,
} from "../../db/schema/flight.schema"
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import { eventRepository } from "../event/event.repository"
import { allocateFlights } from "../flight/allocator"
import { flightRepository } from "../flight/flight.repository"
import type { CreateAllocationInput } from "./allocation.dto"
import { flightAllocationParamsSchema } from "./allocation.dto"
import { allocationRepository, type AllocationRunRow } from "./allocation.repository"

const ENTITY = "allocation_run"
const ALLOCATION_STATUSES = new Set(["registration_closed", "allocation_processing"])

export const allocationService = {
	async preview(
		eventId: string,
		input: CreateAllocationInput,
		actor: AuditActor,
	): Promise<AllocationRunRow> {
		const event = await eventRepository.findById(eventId)
		if (!event) throw new NotFoundError("Event")
		if (!ALLOCATION_STATUSES.has(event.status)) {
			throw new ConflictError("Chỉ phân bổ sau khi đóng đăng ký và trước khi công bố thông tin.")
		}

		const settingsWeights = event.settings.allocationWeights ?? {}
		const params = flightAllocationParamsSchema.parse({
			teamTogetherWeight: settingsWeights.teamTogetherWeight,
			shiftPreferenceWeight: settingsWeights.shiftPreferenceWeight,
			...input.params,
		})
		const [flights, registrations, currentAssignments] = await Promise.all([
			flightRepository.listAll(eventId),
			flightRepository.listParticipatingRegistrations(eventId),
			flightRepository.listAssignments(eventId),
		])
		if (flights.length === 0) throw new ValidationError("Kỳ này chưa có chuyến bay để phân bổ.")
		if (registrations.length === 0) {
			throw new ValidationError("Kỳ này chưa có CBNV đăng ký tham gia để phân bổ.")
		}

		const plan: StoredFlightAllocationPlan = { assignments: [], unassigned: [] }
		const stats: AllocationStats = {
			assigned: 0,
			unassigned: 0,
			remainingSlots: 0,
			teamsSplit: 0,
			shiftUnmet: 0,
		}

		for (const direction of ["outbound", "return"] satisfies FlightDirection[]) {
			const directionPlan = allocateFlights({
				direction,
				flights,
				registrations,
				lockedAssignments: currentAssignments
					.filter((row) => row.assignment.locked && row.assignment.direction === direction)
					.map((row) => ({
						registrationId: row.assignment.registrationId,
						flightId: row.assignment.flightId,
					})),
				params,
			})
			plan.assignments.push(
				...directionPlan.assignments.map((row) => ({
					registrationId: row.registrationId,
					flightId: row.targetId,
					direction,
					flags: row.flags,
				})),
			)
			plan.unassigned.push(
				...directionPlan.unassigned.map((row) => ({ ...row, direction })),
			)
			stats.assigned += directionPlan.stats.assigned
			stats.unassigned += directionPlan.stats.unassigned
			stats.remainingSlots += directionPlan.stats.remainingSlots
			stats.teamsSplit += directionPlan.stats.teamsSplit
			stats.shiftUnmet += directionPlan.stats.shiftUnmet
		}

		const id = newId()
		return db.transaction(async (tx) => {
			const run = await allocationRepository.insert(
				{ id, eventId, type: input.type, params, stats, plan, createdBy: actor.id },
				tx,
			)
			await auditService.record(
				{
					eventId,
					actor,
					entity: ENTITY,
					entityId: id,
					action: "preview",
					after: { type: input.type, params, stats },
				},
				tx,
			)
			return run
		})
	},

	async list(eventId: string): Promise<AllocationRunRow[]> {
		return allocationRepository.list(eventId, "flight")
	},

	async get(eventId: string, runId: string): Promise<AllocationRunRow> {
		const run = await allocationRepository.findById(eventId, runId)
		if (!run) throw new NotFoundError("Allocation run")
		return run
	},

	async commit(eventId: string, runId: string, actor: AuditActor): Promise<AllocationRunRow> {
		return db.transaction(async (tx) => {
			const run = await allocationRepository.findById(eventId, runId, tx)
			if (!run) throw new NotFoundError("Allocation run")
			if (run.type !== "flight") throw new ValidationError("Loại phân bổ này chưa được hỗ trợ.")
			if (run.status !== "preview") {
				throw new ConflictError("Chỉ phương án preview mới có thể commit.")
			}

			// Keep statements sequential inside a single SQLite transaction. Running
			// queries concurrently on the same executor can interleave driver state.
			const flights = await flightRepository.listAll(eventId, tx)
			const registrations = await flightRepository.listParticipatingRegistrations(eventId, tx)
			const currentAssignments = await flightRepository.listAssignments(eventId, tx)
			const flightById = new Map(flights.map((row) => [row.id, row]))
			const eligibleIds = new Set(registrations.map((row) => row.id))
			const lockedKeys = new Set(
				currentAssignments
					.filter((row) => row.assignment.locked)
					.map((row) => `${row.assignment.registrationId}:${row.assignment.direction}`),
			)
			const occupancy = new Map<string, number>()
			for (const row of currentAssignments.filter((item) => item.assignment.locked)) {
				occupancy.set(row.assignment.flightId, (occupancy.get(row.assignment.flightId) ?? 0) + 1)
			}

			const assignments = run.plan.assignments.filter(
				(row) => !lockedKeys.has(`${row.registrationId}:${row.direction}`),
			)
			for (const row of assignments) {
				if (!eligibleIds.has(row.registrationId)) {
					throw new ConflictError("Dữ liệu đăng ký đã thay đổi. Hãy chạy preview lại.")
				}
				const target = flightById.get(row.flightId)
				if (!target || target.direction !== row.direction) {
					throw new ConflictError("Dữ liệu chuyến bay đã thay đổi. Hãy chạy preview lại.")
				}
				const next = (occupancy.get(target.id) ?? 0) + 1
				if (next > target.capacity) {
					throw new ConflictError(
						`Chuyến ${target.code} không còn đủ chỗ. Hãy chạy preview lại.`,
					)
				}
				occupancy.set(target.id, next)
			}

			await flightRepository.deleteUnlockedAssignments(eventId, tx)
			await flightRepository.insertAutoAssignments(eventId, run.id, actor.id, assignments, tx)
			const committed = await allocationRepository.setStatus(eventId, run.id, "committed", tx)
			if (!committed) throw new NotFoundError("Allocation run")
			await auditService.record(
				{
					eventId,
					actor,
					entity: ENTITY,
					entityId: run.id,
					action: "commit",
					before: { status: run.status },
					after: { status: committed.status, stats: run.stats },
				},
				tx,
			)
			return committed
		})
	},

	async discard(eventId: string, runId: string, actor: AuditActor): Promise<AllocationRunRow> {
		return db.transaction(async (tx) => {
			const run = await allocationRepository.findById(eventId, runId, tx)
			if (!run) throw new NotFoundError("Allocation run")
			if (run.status !== "preview") {
				throw new ConflictError("Chỉ phương án preview mới có thể bỏ.")
			}
			const discarded = await allocationRepository.setStatus(eventId, runId, "discarded", tx)
			if (!discarded) throw new NotFoundError("Allocation run")
			await auditService.record(
				{
					eventId,
					actor,
					entity: ENTITY,
					entityId: runId,
					action: "discard",
					before: { status: run.status },
					after: { status: discarded.status },
				},
				tx,
			)
			return discarded
		})
	},
}
