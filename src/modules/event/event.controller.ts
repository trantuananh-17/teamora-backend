import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope } from "../../api/types"
import { paginationQuerySchema } from "../../shared/pagination"
import { changeStatusSchema, createEventSchema, updateEventSchema } from "./event.dto"
import { eventService } from "./event.service"
import { eventExportService } from "./event-export.service"

/**
 * Parse the DTO, call exactly one service method, shape the response. No
 * queries, no permission checks, no branching on business rules — those live in
 * the route's middleware and in the service.
 */

export const eventController = {
	async current(c: AppContext) {
		return c.json(await eventService.getCurrent())
	},

	async list(c: AppContext) {
		const query = paginationQuerySchema.parse(c.req.query())
		return c.json(await eventService.list(query))
	},

	async get(c: AppContext) {
		// Already resolved and proven to exist by `eventScope`; re-fetching would
		// be a second query for the same row.
		return c.json(requireEventScope(c))
	},

	async exportWorkbook(c: AppContext) {
		const event = requireEventScope(c)
		const output = await eventExportService.exportWorkbook(event.id, auditActor(c))
		return new Response(new Uint8Array(output), {
			status: 200,
			headers: {
				"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"content-disposition": `attachment; filename="teamora-${event.code}.xlsx"`,
			},
		})
	},

	async create(c: AppContext) {
		const input = createEventSchema.parse(await c.req.json())
		return c.json(await eventService.create(input, auditActor(c)), 201)
	},

	async update(c: AppContext) {
		const event = requireEventScope(c)
		const input = updateEventSchema.parse(await c.req.json())
		return c.json(await eventService.update(event.id, input, auditActor(c)))
	},

	/** Mounted behind `requireOrganizer`. Forward only. */
	async advanceStatus(c: AppContext) {
		const event = requireEventScope(c)
		const input = changeStatusSchema.parse(await c.req.json())
		return c.json(
			await eventService.changeStatus(event.id, input, auditActor(c), { allowRevert: false }),
		)
	},

	/** Mounted behind `requireSuperAdmin`. The service still demands a reason. */
	async revertStatus(c: AppContext) {
		const event = requireEventScope(c)
		const input = changeStatusSchema.parse(await c.req.json())
		return c.json(
			await eventService.changeStatus(event.id, input, auditActor(c), { allowRevert: true }),
		)
	},
}
