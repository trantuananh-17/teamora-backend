import type { AppContext } from "../../api/types"
import { auditActor, requireParam } from "../../api/types"
import { createWorkLocationSchema, updateWorkLocationSchema } from "./work-location.dto"
import { workLocationService } from "./work-location.service"

export const workLocationController = {
	async list(c: AppContext) {
		return c.json({ items: await workLocationService.list() })
	},

	async create(c: AppContext) {
		const input = createWorkLocationSchema.parse(await c.req.json())
		return c.json(await workLocationService.create(input, auditActor(c)), 201)
	},

	async update(c: AppContext) {
		const id = requireParam(c, "workLocationId")
		const input = updateWorkLocationSchema.parse(await c.req.json())
		return c.json(await workLocationService.update(id, input, auditActor(c)))
	},
}
