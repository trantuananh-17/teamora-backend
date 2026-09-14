import type { AllocationFlag, AllocationStats } from "../../db/schema/flight.schema"
import type { TransportLeg } from "../../db/schema/registration.schema"

export interface AllocationVehicle {
	id: string
	leg: TransportLeg
	capacity: number
	pickupPointId: string | null
}

export interface VehicleAllocationRegistration {
	id: string
	teamId: string | null
	pickupPointId: string | null
	flightId: string | null
}

export interface LockedVehicleAssignment {
	registrationId: string
	vehicleId: string
}

export interface VehicleAllocationInput {
	leg: TransportLeg
	vehicles: AllocationVehicle[]
	registrations: VehicleAllocationRegistration[]
	lockedAssignments: LockedVehicleAssignment[]
}

export interface VehicleAllocationPlan {
	assignments: { registrationId: string; targetId: string; flags: AllocationFlag[] }[]
	unassigned: {
		registrationId: string
		reason: "missing_flight" | "unassigned"
	}[]
	stats: AllocationStats
}

/** Pure, deterministic vehicle allocator for REQUIREMENTS §7.2 and ALLOCATION.md. */
export function allocateVehicles(input: VehicleAllocationInput): VehicleAllocationPlan {
	const vehicles = input.vehicles
		.filter((row) => row.leg === input.leg)
		.map((row) => ({ ...row, capacity: Math.max(0, row.capacity) }))
		.sort((left, right) => left.id.localeCompare(right.id))
	const vehicleById = new Map(vehicles.map((row) => [row.id, row]))
	const remaining = new Map(vehicles.map((row) => [row.id, row.capacity]))
	const vehicleGroups = new Map<string, Set<string>>()
	const lockedIds = new Set<string>()
	const assignments: VehicleAllocationPlan["assignments"] = []
	const unassigned: VehicleAllocationPlan["unassigned"] = []

	for (const row of [...input.lockedAssignments].sort((a, b) =>
		a.registrationId.localeCompare(b.registrationId),
	)) {
		if (lockedIds.has(row.registrationId) || !vehicleById.has(row.vehicleId)) continue
		lockedIds.add(row.registrationId)
		remaining.set(row.vehicleId, Math.max(0, (remaining.get(row.vehicleId) ?? 0) - 1))
	}

	const eligible: VehicleAllocationRegistration[] = []
	for (const person of input.registrations) {
		if (lockedIds.has(person.id)) continue
		if (!person.flightId) {
			unassigned.push({ registrationId: person.id, reason: "missing_flight" })
			continue
		}
		eligible.push(person)
	}

	const groups = groupCandidates(input.leg, eligible)
	for (const group of groups) {
		for (const team of group.teams) {
			let waiting = [...team.members].sort((a, b) => a.id.localeCompare(b.id))
			while (waiting.length > 0) {
				const target = rankVehicles(
					vehicles,
					remaining,
					vehicleGroups,
					group.key,
					input.leg,
					waiting[0]!.pickupPointId,
				)[0]
				if (!target) break
				const count = Math.min(waiting.length, remaining.get(target.id) ?? 0)
				const seated = waiting.slice(0, count)
				waiting = waiting.slice(count)
				for (const person of seated) {
					assignments.push({ registrationId: person.id, targetId: target.id, flags: [] })
				}
				remaining.set(target.id, (remaining.get(target.id) ?? 0) - seated.length)
				const keys = vehicleGroups.get(target.id) ?? new Set<string>()
				keys.add(group.key)
				vehicleGroups.set(target.id, keys)
			}
			for (const person of waiting)
				unassigned.push({ registrationId: person.id, reason: "unassigned" })
		}
	}

	const registrationById = new Map(input.registrations.map((row) => [row.id, row]))
	const placements = new Map(assignments.map((row) => [row.registrationId, row.targetId]))
	for (const row of input.lockedAssignments) placements.set(row.registrationId, row.vehicleId)
	const splitTeams = new Set<string>()
	for (const person of input.registrations) {
		if (!person.teamId) continue
		const teamTargets = new Set(
			input.registrations
				.filter((member) => member.teamId === person.teamId)
				.map((member) => placements.get(member.id) ?? "__unassigned"),
		)
		if (teamTargets.size > 1) splitTeams.add(person.teamId)
	}
	for (const row of assignments) {
		const teamId = registrationById.get(row.registrationId)?.teamId
		if (teamId && splitTeams.has(teamId)) row.flags.push("team_split")
	}

	assignments.sort((a, b) => a.registrationId.localeCompare(b.registrationId))
	unassigned.sort((a, b) => a.registrationId.localeCompare(b.registrationId))
	return {
		assignments,
		unassigned,
		stats: {
			assigned: assignments.length,
			unassigned: unassigned.length,
			remainingSlots: [...remaining.values()].reduce((sum, value) => sum + value, 0),
			teamsSplit: splitTeams.size,
			shiftUnmet: 0,
		},
	}
}

function groupCandidates(leg: TransportLeg, registrations: VehicleAllocationRegistration[]) {
	const groups = new Map<string, VehicleAllocationRegistration[]>()
	for (const person of registrations) {
		const pickup =
			leg === "origin_to_airport" || leg === "airport_to_origin"
				? (person.pickupPointId ?? "__no_pickup")
				: "__shared"
		const key = `${person.flightId}:${pickup}`
		const rows = groups.get(key) ?? []
		rows.push(person)
		groups.set(key, rows)
	}
	return [...groups]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, members]) => {
			const teams = new Map<string, VehicleAllocationRegistration[]>()
			for (const person of members) {
				const teamKey = person.teamId ?? `__person_${person.id}`
				const rows = teams.get(teamKey) ?? []
				rows.push(person)
				teams.set(teamKey, rows)
			}
			return {
				key,
				teams: [...teams]
					.map(([teamKey, rows]) => ({ key: teamKey, members: rows }))
					.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key)),
			}
		})
}

function rankVehicles(
	vehicles: AllocationVehicle[],
	remaining: ReadonlyMap<string, number>,
	vehicleGroups: ReadonlyMap<string, Set<string>>,
	groupKey: string,
	leg: TransportLeg,
	pickupPointId: string | null,
) {
	return vehicles
		.filter((vehicle) => {
			if ((remaining.get(vehicle.id) ?? 0) <= 0) return false
			if (leg !== "origin_to_airport" && leg !== "airport_to_origin") return true
			return vehicle.pickupPointId === null || vehicle.pickupPointId === pickupPointId
		})
		.sort((left, right) => {
			const leftGroups = vehicleGroups.get(left.id) ?? new Set<string>()
			const rightGroups = vehicleGroups.get(right.id) ?? new Set<string>()
			const affinity = (groups: Set<string>) =>
				groups.has(groupKey) ? 2 : groups.size === 0 ? 1 : 0
			const affinityDelta = affinity(rightGroups) - affinity(leftGroups)
			if (affinityDelta !== 0) return affinityDelta
			const spaceDelta = (remaining.get(left.id) ?? 0) - (remaining.get(right.id) ?? 0)
			return spaceDelta || left.id.localeCompare(right.id)
		})
}
