import { describe, expect, it } from "vitest"

import { presentChatbotJourney } from "./chatbot.presenter"

describe("chatbot journey response", () => {
	it("does not expose account contact details or allocation internals", () => {
		const result = presentChatbotJourney({
			event: { id: "event-id", code: "TB26", name: "Team Building", status: "information_published", registrationOpenAt: null, registrationCloseAt: null, publishedAt: new Date("2026-09-01"), settings: { allocationWeights: { secret: 1 } }, createdAt: new Date(), updatedAt: new Date() },
			participant: { id: "user-id", name: "An", email: "an@example.com", employeeCode: "NV001", phone: "0900000000", team: { id: "team-id", name: "Core" }, participating: true },
			flights: [], vehicles: [], accommodation: null, schedule: [], announcements: [],
		})

		const serialized = JSON.stringify(result)
		expect(result.participant).toEqual({ name: "An", employeeCode: "NV001", team: "Core", participating: true })
		expect(serialized).not.toContain("an@example.com")
		expect(serialized).not.toContain("0900000000")
		expect(serialized).not.toContain("user-id")
		expect(serialized).not.toContain("allocationWeights")
	})
})
