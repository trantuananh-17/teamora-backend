import type { AppContext } from "../../api/types"
import { chatbotJourneyRequestSchema, chatbotTripQuerySchema } from "./chatbot.dto"
import { chatbotService } from "./chatbot.service"

export const chatbotController = {
	async trip(c: AppContext) {
		const input = chatbotTripQuerySchema.parse(c.req.query())
		c.header("Cache-Control", "private, no-store")
		return c.json(await chatbotService.trip(input))
	},

	async journey(c: AppContext) {
		const input = chatbotJourneyRequestSchema.parse({
			eventCode: c.req.query("eventCode"),
			employeeCode: c.req.header("x-teamora-employee-code"),
			email: c.req.header("x-teamora-user-email"),
		})
		c.header("Cache-Control", "private, no-store")
		return c.json(await chatbotService.journey(input))
	},
}
