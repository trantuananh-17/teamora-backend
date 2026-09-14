import { describe, expect, it } from "vitest"
import { canViewJourney, shouldNotifyPublishedChange } from "./journey.policy"

describe("journey publication policy", () => {
	it.each(["registration_open", "registration_closed", "allocation_processing"] as const)(
		"hides allocations at %s",
		(status) => {
			expect(canViewJourney(status)).toBe(false)
		},
	)
	it.each(["information_published", "event_started", "event_completed"] as const)(
		"shows allocations at %s",
		(status) => {
			expect(canViewJourney(status)).toBe(true)
		},
	)
	it("does not send change mail after the edition is completed", () => {
		expect(shouldNotifyPublishedChange("information_published")).toBe(true)
		expect(shouldNotifyPublishedChange("event_started")).toBe(true)
		expect(shouldNotifyPublishedChange("event_completed")).toBe(false)
	})
})
