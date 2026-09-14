import { describe, expect, it } from "vitest"

import type { TransportLeg } from "../../db/schema/registration.schema"
import { allocateVehicles, type VehicleAllocationInput } from "./allocator"

const leg: TransportLeg = "origin_to_airport"

function run(overrides: Partial<VehicleAllocationInput>) {
	return allocateVehicles({
		leg,
		vehicles: [],
		registrations: [],
		lockedAssignments: [],
		...overrides,
	})
}

describe("allocateVehicles", () => {
	it("keeps the same flight and team together when capacity allows", () => {
		const plan = run({
			vehicles: [{ id: "bus-1", leg, capacity: 3, pickupPointId: "hn" }],
			registrations: ["a", "b", "c"].map((id) => ({
				id,
				teamId: "team",
				pickupPointId: "hn",
				flightId: "flight-1",
			})),
		})
		expect(plan.assignments.map((row) => row.targetId)).toEqual(["bus-1", "bus-1", "bus-1"])
		expect(plan.stats.teamsSplit).toBe(0)
	})

	it("never exceeds capacity and reports overflow", () => {
		const plan = run({
			vehicles: [{ id: "bus-1", leg, capacity: 1, pickupPointId: null }],
			registrations: ["a", "b"].map((id) => ({
				id,
				teamId: "team",
				pickupPointId: "hn",
				flightId: "flight-1",
			})),
		})
		expect(plan.assignments).toHaveLength(1)
		expect(plan.unassigned).toEqual([{ registrationId: "b", reason: "unassigned" }])
	})

	it("does not guess when the committed flight is missing", () => {
		const plan = run({
			vehicles: [{ id: "bus-1", leg, capacity: 2, pickupPointId: null }],
			registrations: [{ id: "a", teamId: "team", pickupPointId: "hn", flightId: null }],
		})
		expect(plan.assignments).toEqual([])
		expect(plan.unassigned).toEqual([{ registrationId: "a", reason: "missing_flight" }])
	})

	it("respects pickup point for origin legs", () => {
		const plan = run({
			vehicles: [
				{ id: "hcm-bus", leg, capacity: 2, pickupPointId: "hcm" },
				{ id: "hn-bus", leg, capacity: 2, pickupPointId: "hn" },
			],
			registrations: [{ id: "a", teamId: null, pickupPointId: "hn", flightId: "flight-1" }],
		})
		expect(plan.assignments[0]?.targetId).toBe("hn-bus")
	})

	it("subtracts locked seats and is deterministic", () => {
		const input: Partial<VehicleAllocationInput> = {
			vehicles: [
				{ id: "bus-1", leg, capacity: 1, pickupPointId: null },
				{ id: "bus-2", leg, capacity: 2, pickupPointId: null },
			],
			registrations: [
				{ id: "locked", teamId: "team", pickupPointId: "hn", flightId: "flight-1" },
				{ id: "a", teamId: "team", pickupPointId: "hn", flightId: "flight-1" },
			],
			lockedAssignments: [{ registrationId: "locked", vehicleId: "bus-1" }],
		}
		expect(run(input)).toEqual(run(input))
		expect(run(input).assignments).toEqual([
			{ registrationId: "a", targetId: "bus-2", flags: ["team_split"] },
		])
	})
})
