import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { createAllocationSchema, listAllocationRunsQuerySchema } from "./allocation.dto"
import { allocationService } from "./allocation.service"

export const allocationController = {
	async preview(c: AppContext) {
		const event = requireEventScope(c)
		const input = createAllocationSchema.parse(await c.req.json())
		return c.json(await allocationService.preview(event.id, input, auditActor(c)), 201)
	},

	async list(c: AppContext) {
		const event = requireEventScope(c)
		listAllocationRunsQuerySchema.parse(c.req.query())
		return c.json({ items: await allocationService.list(event.id) })
	},

	async get(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await allocationService.get(event.id, requireParam(c, "runId")))
	},

	async commit(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(
			await allocationService.commit(event.id, requireParam(c, "runId"), auditActor(c)),
		)
	},

	async discard(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(
			await allocationService.discard(event.id, requireParam(c, "runId"), auditActor(c)),
		)
	},
}
