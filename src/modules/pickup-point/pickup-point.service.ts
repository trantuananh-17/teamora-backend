import { db } from "../../db/client"
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import { workLocationRepository } from "../work-location/work-location.repository"
import type { CreatePickupPointInput, UpdatePickupPointInput } from "./pickup-point.dto"
import { pickupPointRepository, type PickupPointRow } from "./pickup-point.repository"

const ENTITY = "pickup_point"

export const pickupPointService = {
	async listForEvent(eventId: string): Promise<PickupPointRow[]> {
		return pickupPointRepository.listForEvent(eventId)
	},

	async create(
		eventId: string,
		input: CreatePickupPointInput,
		actor: AuditActor,
	): Promise<PickupPointRow> {
		await assertWorkLocationExists(input.workLocationId)

		if (await pickupPointRepository.findByName(eventId, input.name)) {
			throw new ConflictError(`Kỳ này đã có điểm đón tên "${input.name}".`)
		}

		return db.transaction(async (tx) => {
			const created = await pickupPointRepository.insert(
				{
					id: newId(),
					eventId,
					name: input.name,
					address: input.address ?? null,
					workLocationId: input.workLocationId ?? null,
					sortOrder: input.sortOrder,
				},
				tx,
			)
			await auditService.record(
				{ eventId, actor, entity: ENTITY, entityId: created.id, action: "create", after: created },
				tx,
			)
			return created
		})
	},

	async update(
		eventId: string,
		pickupPointId: string,
		input: UpdatePickupPointInput,
		actor: AuditActor,
	): Promise<PickupPointRow> {
		const before = await pickupPointRepository.findById(eventId, pickupPointId)
		if (!before) throw new NotFoundError("Pickup point")

		if (input.workLocationId !== undefined) await assertWorkLocationExists(input.workLocationId)

		if (input.name && input.name !== before.name) {
			const clash = await pickupPointRepository.findByName(eventId, input.name)
			if (clash) throw new ConflictError(`Kỳ này đã có điểm đón tên "${input.name}".`)
		}

		return db.transaction(async (tx) => {
			const after = await pickupPointRepository.update(eventId, pickupPointId, input, tx)
			if (!after) throw new NotFoundError("Pickup point")
			await auditService.record(
				{
					eventId,
					actor,
					entity: ENTITY,
					entityId: pickupPointId,
					action: "update",
					before,
					after,
				},
				tx,
			)
			return after
		})
	},
}

/**
 * Checked here rather than left to the foreign key. The FK would refuse it too,
 * but as a raw SQLITE_CONSTRAINT that the error handler can only turn into a
 * 500 — an unhelpful answer to what is an ordinary typo in a request.
 */
async function assertWorkLocationExists(workLocationId: string | null | undefined) {
	if (!workLocationId) return
	const found = await workLocationRepository.findById(workLocationId)
	if (!found) {
		throw new ValidationError("Địa điểm làm việc không tồn tại.", { workLocationId })
	}
}
