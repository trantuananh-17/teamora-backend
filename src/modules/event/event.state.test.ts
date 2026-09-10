import { describe, expect, it } from "vitest"

import { EVENT_STATUSES } from "../../db/schema/event.schema"
import {
	allowsAllocationVisibility,
	allowsRegistrationEdit,
	canAdvance,
	canRevert,
	nextStatus,
} from "./event.state"

describe("canAdvance", () => {
	it("allows exactly one step forward", () => {
		expect(canAdvance("registration_open", "registration_closed")).toBe(true)
		expect(canAdvance("allocation_processing", "information_published")).toBe(true)
	})

	it("refuses skipping a step", () => {
		// The one that matters: publishing without anyone having allocated.
		expect(canAdvance("registration_closed", "information_published")).toBe(false)
		expect(canAdvance("registration_open", "event_completed")).toBe(false)
	})

	it("refuses standing still and going backwards", () => {
		expect(canAdvance("registration_open", "registration_open")).toBe(false)
		expect(canAdvance("information_published", "allocation_processing")).toBe(false)
	})

	it("has no step past the last status", () => {
		expect(nextStatus("event_completed")).toBeUndefined()
		for (const status of EVENT_STATUSES) {
			expect(canAdvance("event_completed", status)).toBe(false)
		}
	})

	it("walks the whole §12 sequence one step at a time", () => {
		for (let i = 0; i < EVENT_STATUSES.length - 1; i++) {
			expect(canAdvance(EVENT_STATUSES[i]!, EVENT_STATUSES[i + 1]!)).toBe(true)
		}
	})
})

describe("canRevert", () => {
	it("is true only for a step back", () => {
		expect(canRevert("information_published", "allocation_processing")).toBe(true)
		expect(canRevert("event_completed", "registration_open")).toBe(true)
		expect(canRevert("registration_open", "registration_closed")).toBe(false)
		expect(canRevert("registration_open", "registration_open")).toBe(false)
	})
})

describe("allowsRegistrationEdit", () => {
	it("is open only while registration is open", () => {
		expect(allowsRegistrationEdit("registration_open")).toBe(true)
		for (const status of EVENT_STATUSES.filter((s) => s !== "registration_open")) {
			expect(allowsRegistrationEdit(status)).toBe(false)
		}
	})
})

describe("allowsAllocationVisibility", () => {
	it("hides allocations until the organisers publish", () => {
		expect(allowsAllocationVisibility("registration_open")).toBe(false)
		expect(allowsAllocationVisibility("registration_closed")).toBe(false)
		// The one that leaks: organisers are still moving people around here.
		expect(allowsAllocationVisibility("allocation_processing")).toBe(false)
	})

	it("shows them from publication onwards, including after the trip", () => {
		expect(allowsAllocationVisibility("information_published")).toBe(true)
		expect(allowsAllocationVisibility("event_started")).toBe(true)
		expect(allowsAllocationVisibility("event_completed")).toBe(true)
	})
})
