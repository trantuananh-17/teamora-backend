import { describe, expect, it } from "vitest"

import { chatbotJourneyRequestSchema, chatbotTripQuerySchema } from "./chatbot.dto"

describe("chatbot integration input", () => {
	it("accepts a current trip request without an event code", () => {
		expect(chatbotTripQuerySchema.parse({})).toEqual({})
	})

	it("accepts exactly one server-asserted employee identity", () => {
		expect(chatbotJourneyRequestSchema.parse({ employeeCode: " NV001 " })).toMatchObject({
			employeeCode: "NV001",
		})
		expect(chatbotJourneyRequestSchema.parse({ email: "User@Company.VN" })).toMatchObject({
			email: "user@company.vn",
		})
	})

	it("rejects missing or ambiguous employee identity", () => {
		expect(chatbotJourneyRequestSchema.safeParse({}).success).toBe(false)
		expect(
			chatbotJourneyRequestSchema.safeParse({ employeeCode: "NV001", email: "a@company.vn" })
				.success,
		).toBe(false)
	})
})
