import { describe, expect, it } from "vitest"

import type { FlightDirection, FlightShift } from "../../db/schema/flight.schema"
import {
	allocateFlights,
	type AllocationFlight,
	type AllocationRegistration,
	type FlightAllocationInput,
} from "./allocator"

const direction: FlightDirection = "outbound"
const params = { teamTogetherWeight: 100, shiftPreferenceWeight: 10 }

function flight(
	id: string,
	capacity: number,
	shift: FlightShift | null = "shift_1",
): AllocationFlight {
	return { id, direction, capacity, shift }
}

function person(
	id: string,
	teamId: string | null,
	shiftPreference: FlightShift | null = "shift_1",
	shiftLocked = false,
): AllocationRegistration {
	return { id, teamId, shiftPreference, shiftLocked }
}

function run(overrides: Partial<FlightAllocationInput>) {
	const input: FlightAllocationInput = {
		direction,
		flights: [],
		registrations: [],
		lockedAssignments: [],
		params,
		...overrides,
	}
	const plan = allocateFlights(input)
	assertWithinCapacity(input, plan.assignments)
	return plan
}

function assertWithinCapacity(
	input: FlightAllocationInput,
	assignments: ReturnType<typeof allocateFlights>["assignments"],
) {
	for (const target of input.flights) {
		const locked = input.lockedAssignments.filter((row) => row.flightId === target.id).length
		const planned = assignments.filter((row) => row.targetId === target.id).length
		expect(locked + planned).toBeLessThanOrEqual(target.capacity)
	}
}

describe("allocateFlights", () => {
	it("keeps a team together when one flight fits exactly", () => {
		const plan = run({
			flights: [flight("f1", 3), flight("f2", 5)],
			registrations: [person("a", "team"), person("b", "team"), person("c", "team")],
		})
		expect(plan.assignments.map((row) => row.targetId)).toEqual(["f1", "f1", "f1"])
		expect(plan.stats.teamsSplit).toBe(0)
	})

	it("splits a team into the minimum greedy number of pieces", () => {
		const plan = run({
			flights: [flight("f1", 3), flight("f2", 2), flight("f3", 1)],
			registrations: ["a", "b", "c", "d", "e"].map((id) => person(id, "team")),
		})
		expect(new Set(plan.assignments.map((row) => row.targetId)).size).toBe(2)
		expect(plan.assignments.every((row) => row.flags.includes("team_split"))).toBe(true)
		expect(plan.stats.teamsSplit).toBe(1)
	})

	it("leaves overflow unassigned instead of exceeding capacity", () => {
		const plan = run({
			flights: [flight("f1", 2)],
			registrations: [person("a", "team"), person("b", "team"), person("c", "team")],
		})
		expect(plan.assignments).toHaveLength(2)
		expect(plan.unassigned).toEqual([{ registrationId: "c", reason: "unassigned" }])
	})

	it("keeps a team together before satisfying individual shift preferences", () => {
		const plan = run({
			flights: [flight("f1", 3, "shift_1"), flight("f2", 2, "shift_2")],
			registrations: [
				person("a", "team", "shift_1"),
				person("b", "team", "shift_2"),
				person("c", "team", "shift_2"),
			],
		})
		expect(new Set(plan.assignments.map((row) => row.targetId)).size).toBe(1)
		expect(plan.assignments.find((row) => row.registrationId === "b")?.flags).toContain(
			"shift_unmet",
		)
	})

	it("subtracts locked seats and never returns a replacement for them", () => {
		const plan = run({
			flights: [flight("f1", 2), flight("f2", 2)],
			registrations: [person("locked", "team"), person("a", "team"), person("b", "team")],
			lockedAssignments: [{ registrationId: "locked", flightId: "f1" }],
		})
		expect(plan.assignments.some((row) => row.registrationId === "locked")).toBe(false)
		expect(plan.stats.remainingSlots).toBe(1)
	})

	it("pre-places shift-locked people on the required shift even when their team splits", () => {
		const plan = run({
			flights: [flight("f1", 1, "shift_1"), flight("f2", 3, "shift_2")],
			registrations: [
				person("a", "team", "shift_1", true),
				person("b", "team", "shift_2"),
				person("c", "team", "shift_2"),
			],
		})
		expect(plan.assignments.find((row) => row.registrationId === "a")?.targetId).toBe("f1")
		expect(plan.assignments.every((row) => row.flags.includes("team_split"))).toBe(true)
	})

	it("does not move a shift-locked person to another shift when required flights are full", () => {
		const plan = run({
			flights: [flight("f1", 1, "shift_1"), flight("f2", 2, "shift_2")],
			registrations: [person("occupied", "other"), person("a", "team", "shift_1", true)],
			lockedAssignments: [{ registrationId: "occupied", flightId: "f1" }],
		})
		expect(plan.unassigned).toContainEqual({
			registrationId: "a",
			reason: "shift_locked_unmet",
		})
	})

	it("is deterministic for the same input", () => {
		const input: FlightAllocationInput = {
			direction,
			flights: [flight("f1", 2), flight("f2", 2, "shift_2")],
			registrations: [person("a", null), person("b", "team", "shift_2")],
			lockedAssignments: [],
			params,
		}
		const first = run(input)
		const second = run(input)
		expect(second).toEqual(first)
	})

	it("handles empty input, zero capacity, and a person without a team", () => {
		expect(run({}).stats).toEqual({
			assigned: 0,
			unassigned: 0,
			remainingSlots: 0,
			teamsSplit: 0,
			shiftUnmet: 0,
		})
		const plan = run({
			flights: [flight("zero", 0), flight("usable", 1)],
			registrations: [person("solo", null)],
		})
		expect(plan.assignments).toEqual([{ registrationId: "solo", targetId: "usable", flags: [] }])
	})
})
