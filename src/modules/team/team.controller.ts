import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { createTeamSchema, updateTeamSchema } from "./team.dto"
import { teamService } from "./team.service"

export const teamController = {
	async list(c: AppContext) {
		const event = requireEventScope(c)
		return c.json({ items: await teamService.listForEvent(event.id) })
	},

	async create(c: AppContext) {
		const event = requireEventScope(c)
		const input = createTeamSchema.parse(await c.req.json())
		return c.json(await teamService.create(event.id, input, auditActor(c)), 201)
	},

	async update(c: AppContext) {
		const event = requireEventScope(c)
		const teamId = requireParam(c, "teamId")
		const input = updateTeamSchema.parse(await c.req.json())
		return c.json(await teamService.update(event.id, teamId, input, auditActor(c)))
	},
}
