import type { AppContext } from "../../api/types"
import { requireEventScope, requireUser } from "../../api/types"
import { paginationQuerySchema } from "../../shared/pagination"
import type { AuditActor } from "../audit/audit.service"
import { changeStatusSchema, createEventSchema, updateEventSchema } from "./event.dto"
import { eventService } from "./event.service"

/**
 * Parse the DTO, call exactly one service method, shape the response. No
 * queries, no permission checks, no branching on business rules — those live in
 * the route's middleware and in the service.
 */

/**
 * The actor, taken from the session and never from the body. Name and email
 * travel with it because `audit_log` stores them as a snapshot: the trail has to
 * name a person after their account is gone (ADR-010).
 */
function actorFrom(c: AppContext): AuditActor {
	const user = requireUser(c)
	return { id: user.id, name: user.name ?? null, email: user.email ?? null }
}

export const eventController = {
	async list(c: AppContext) {
		const query = paginationQuerySchema.parse(c.req.query())
		return c.json(await eventService.list(query))
	},

	async get(c: AppContext) {
		// Already resolved and proven to exist by `eventScope`; re-fetching would
		// be a second query for the same row.
		return c.json(requireEventScope(c))
	},

	async create(c: AppContext) {
		const input = createEventSchema.parse(await c.req.json())
		return c.json(await eventService.create(input, actorFrom(c)), 201)
	},

	async update(c: AppContext) {
		const event = requireEventScope(c)
		const input = updateEventSchema.parse(await c.req.json())
		return c.json(await eventService.update(event.id, input, actorFrom(c)))
	},

	/** Mounted behind `requireOrganizer`. Forward only. */
	async advanceStatus(c: AppContext) {
		const event = requireEventScope(c)
		const input = changeStatusSchema.parse(await c.req.json())
		return c.json(
			await eventService.changeStatus(event.id, input, actorFrom(c), { allowRevert: false }),
		)
	},

	/** Mounted behind `requireSuperAdmin`. The service still demands a reason. */
	async revertStatus(c: AppContext) {
		const event = requireEventScope(c)
		const input = changeStatusSchema.parse(await c.req.json())
		return c.json(
			await eventService.changeStatus(event.id, input, actorFrom(c), { allowRevert: true }),
		)
	},
}
