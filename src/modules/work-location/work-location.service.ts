import { db } from "../../db/client"
import { ConflictError, NotFoundError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import type { CreateWorkLocationInput, UpdateWorkLocationInput } from "./work-location.dto"
import { workLocationRepository, type WorkLocationRow } from "./work-location.repository"

const ENTITY = "work_location"

export const workLocationService = {
	async list(): Promise<WorkLocationRow[]> {
		return workLocationRepository.list()
	},

	async create(input: CreateWorkLocationInput, actor: AuditActor): Promise<WorkLocationRow> {
		if (await workLocationRepository.findByName(input.name)) {
			throw new ConflictError(`Đã có địa điểm làm việc tên "${input.name}".`)
		}

		return db.transaction(async (tx) => {
			const created = await workLocationRepository.insert(
				{ id: newId(), name: input.name, sortOrder: input.sortOrder },
				tx,
			)
			await auditService.record(
				// Null: this is company master data, not an edition's.
				{
					eventId: null,
					actor,
					entity: ENTITY,
					entityId: created.id,
					action: "create",
					after: created,
				},
				tx,
			)
			return created
		})
	},

	async update(
		id: string,
		input: UpdateWorkLocationInput,
		actor: AuditActor,
	): Promise<WorkLocationRow> {
		const before = await workLocationRepository.findById(id)
		if (!before) throw new NotFoundError("Work location")

		if (input.name && input.name !== before.name) {
			const clash = await workLocationRepository.findByName(input.name)
			if (clash) throw new ConflictError(`Đã có địa điểm làm việc tên "${input.name}".`)
		}

		return db.transaction(async (tx) => {
			const after = await workLocationRepository.update(id, input, tx)
			if (!after) throw new NotFoundError("Work location")
			await auditService.record(
				{ eventId: null, actor, entity: ENTITY, entityId: id, action: "update", before, after },
				tx,
			)
			return after
		})
	},
}
