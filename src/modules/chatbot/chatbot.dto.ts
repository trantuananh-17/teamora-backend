import { z } from "zod"

const eventCodeSchema = z
	.string()
	.trim()
	.min(2)
	.max(32)
	.regex(/^[A-Za-z0-9_-]+$/, "Mã kỳ không hợp lệ.")

const employeeCodeSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9._-]+$/, "Mã nhân viên không hợp lệ.")

export const chatbotTripQuerySchema = z.object({ eventCode: eventCodeSchema.optional() })

export const chatbotJourneyRequestSchema = z
	.object({
		eventCode: eventCodeSchema.optional(),
		employeeCode: employeeCodeSchema.optional(),
		email: z
			.email()
			.max(320)
			.transform((value) => value.toLowerCase())
			.optional(),
	})
	.refine((value) => Number(Boolean(value.employeeCode)) + Number(Boolean(value.email)) === 1, {
		message: "Provide exactly one employee identity header.",
		path: ["employeeCode"],
	})

export type ChatbotTripQuery = z.infer<typeof chatbotTripQuerySchema>
export type ChatbotJourneyRequest = z.infer<typeof chatbotJourneyRequestSchema>
