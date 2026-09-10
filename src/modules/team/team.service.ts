import { db } from "../../db/client"
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import type { CreateTeamInput, UpdateTeamInput } from "./team.dto"
import { teamRepository, type TeamRow } from "./team.repository"

const ENTITY = "team"

export const teamService = {
	/** Shared teams plus this edition's, which is what a registration form shows. */
	async listForEvent(eventId: string): Promise<TeamRow[]> {
		return teamRepository.listForEvent(eventId)
	},

	async create(eventId: string, input: CreateTeamInput, actor: AuditActor): Promise<TeamRow> {
		// `shared` decides which of the two unique scopes the name must be free in.
		const scopeId = input.shared ? null : eventId

		if (await teamRepository.findByName(scopeId, input.name)) {
			throw new ConflictError(
				input.shared
					? `Đã có Team dùng chung tên "${input.name}".`
					: `Kỳ này đã có Team tên "${input.name}".`,
			)
		}

		return db.transaction(async (tx) => {
			const created = await teamRepository.insert(
				{ id: newId(), eventId: scopeId, name: input.name, sortOrder: input.sortOrder },
				tx,
			)
			await auditService.record(
				{
					// A shared team belongs to no edition, so its trail entry does not
					// either. An edition-scoped one files under that edition.
					eventId: scopeId,
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
		eventId: string,
		teamId: string,
		input: UpdateTeamInput,
		actor: AuditActor,
	): Promise<TeamRow> {
		const before = await teamRepository.findById(teamId)
		if (!before) throw new NotFoundError("Team")

		// The route resolved `:eventId`, but the team id came from the client. A
		// team belonging to another edition must read as absent rather than as
		// forbidden — 403 would confirm it exists.
		if (before.eventId !== null && before.eventId !== eventId) throw new NotFoundError("Team")

		// A shared team is reachable from every edition's URL, so editing one here
		// would let an organiser rename a team every other edition is using while
		// believing they were changing only their own.
		if (before.eventId === null) {
			throw new ForbiddenError(
				"Team dùng chung không sửa được từ trong một kỳ. Nó thuộc mọi kỳ.",
			)
		}

		if (input.name && input.name !== before.name) {
			const clash = await teamRepository.findByName(eventId, input.name)
			if (clash) throw new ConflictError(`Kỳ này đã có Team tên "${input.name}".`)
		}

		return db.transaction(async (tx) => {
			const after = await teamRepository.update(teamId, input, tx)
			if (!after) throw new NotFoundError("Team")
			await auditService.record(
				{ eventId, actor, entity: ENTITY, entityId: teamId, action: "update", before, after },
				tx,
			)
			return after
		})
	},
}
