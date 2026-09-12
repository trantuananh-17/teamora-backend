import type { AppContext } from "../../api/types"
import { requireEventScope, requireUser } from "../../api/types"
import { journeyQuerySchema } from "./journey.dto"
import { journeyService } from "./journey.service"

export const journeyController = {
	async mine(c: AppContext) { const query = journeyQuerySchema.parse(c.req.query()); return c.json(await journeyService.mine(requireUser(c).id, query.eventId)) },
	async dashboard(c: AppContext) { return c.json(await journeyService.dashboard(requireEventScope(c).id)) },
}
