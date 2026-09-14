import type {
	AllocationFlag,
	AllocationStats,
	FlightDirection,
	FlightShift,
} from "../../db/schema/flight.schema"

export interface FlightAllocationParams {
	teamTogetherWeight: number
	shiftPreferenceWeight: number
}

export interface AllocationFlight {
	id: string
	direction: FlightDirection
	capacity: number
	shift: FlightShift | null
}

export interface AllocationRegistration {
	id: string
	teamId: string | null
	shiftPreference: FlightShift | null
	shiftLocked: boolean
}

export interface LockedFlightAssignment {
	registrationId: string
	flightId: string
}

export interface FlightAllocationInput {
	direction: FlightDirection
	flights: AllocationFlight[]
	registrations: AllocationRegistration[]
	lockedAssignments: LockedFlightAssignment[]
	params: FlightAllocationParams
}

export interface FlightAllocationPlan {
	assignments: {
		registrationId: string
		targetId: string
		flags: AllocationFlag[]
	}[]
	unassigned: {
		registrationId: string
		reason: "shift_locked_unmet" | "unassigned"
	}[]
	stats: AllocationStats
}

const FLAG_ORDER: AllocationFlag[] = [
	"shift_locked_unmet",
	"unassigned",
	"over_capacity",
	"team_split",
	"shift_unmet",
]

/** Pure, deterministic implementation of REQUIREMENTS §5.2–5.4. */
export function allocateFlights(input: FlightAllocationInput): FlightAllocationPlan {
	const flights = input.flights
		.filter((flight) => flight.direction === input.direction)
		.map((flight) => ({ ...flight, capacity: Math.max(0, flight.capacity) }))
		.sort((left, right) => left.id.localeCompare(right.id))
	const flightById = new Map(flights.map((flight) => [flight.id, flight]))
	const registrationById = new Map(input.registrations.map((row) => [row.id, row]))
	const remaining = new Map(flights.map((flight) => [flight.id, flight.capacity]))
	const placements = new Map<string, string>()
	const lockedIds = new Set<string>()

	for (const locked of input.lockedAssignments) {
		const target = flightById.get(locked.flightId)
		if (!target || lockedIds.has(locked.registrationId)) continue
		lockedIds.add(locked.registrationId)
		placements.set(locked.registrationId, target.id)
		remaining.set(target.id, Math.max(0, (remaining.get(target.id) ?? 0) - 1))
	}

	const assignments: FlightAllocationPlan["assignments"] = []
	const unassigned: FlightAllocationPlan["unassigned"] = []
	const candidates = input.registrations.filter((row) => !lockedIds.has(row.id))

	// Hard shift constraints use the same pre-placement mechanism as locked rows.
	for (const person of candidates.filter((row) => row.shiftLocked).sort(compareRegistration)) {
		const eligible = flights
			.filter(
				(flight) => flight.shift === person.shiftPreference && (remaining.get(flight.id) ?? 0) > 0,
			)
			.sort((left, right) => {
				const teamDelta =
					countTeamPlacements(person.teamId, right.id, placements, registrationById) -
					countTeamPlacements(person.teamId, left.id, placements, registrationById)
				if (teamDelta !== 0) return teamDelta
				const remainingDelta = (remaining.get(left.id) ?? 0) - (remaining.get(right.id) ?? 0)
				return remainingDelta || left.id.localeCompare(right.id)
			})

		const target = eligible[0]
		if (!target || !person.shiftPreference) {
			unassigned.push({ registrationId: person.id, reason: "shift_locked_unmet" })
			continue
		}

		place(person, target, [], assignments, placements, remaining)
	}

	const groups = groupByTeam(candidates.filter((row) => !row.shiftLocked))
	groups.sort(
		(left, right) =>
			right.members.length - left.members.length || left.key.localeCompare(right.key),
	)

	for (const group of groups) {
		const members = [...group.members].sort(compareRegistration)
		const wholeTargets = flights
			.filter((flight) => (remaining.get(flight.id) ?? 0) >= members.length)
			.sort((left, right) => {
				const scoreDelta =
					flightPreferenceScore(right, members, input.params) -
					flightPreferenceScore(left, members, input.params)
				if (scoreDelta !== 0) return scoreDelta
				const leftAfter = (remaining.get(left.id) ?? 0) - members.length
				const rightAfter = (remaining.get(right.id) ?? 0) - members.length
				return leftAfter - rightAfter || left.id.localeCompare(right.id)
			})

		const wholeTarget = wholeTargets[0]
		if (wholeTarget) {
			for (const person of members) {
				place(
					person,
					wholeTarget,
					shiftFlags(person, wholeTarget),
					assignments,
					placements,
					remaining,
				)
			}
			continue
		}

		let waiting = members
		const splitTargets = [...flights].sort((left, right) => {
			const remainingDelta = (remaining.get(right.id) ?? 0) - (remaining.get(left.id) ?? 0)
			if (remainingDelta !== 0) return remainingDelta
			const scoreDelta =
				flightPreferenceScore(right, members, input.params) -
				flightPreferenceScore(left, members, input.params)
			return scoreDelta || left.id.localeCompare(right.id)
		})

		for (const target of splitTargets) {
			const available = remaining.get(target.id) ?? 0
			if (available <= 0 || waiting.length === 0) continue
			waiting = [...waiting].sort((left, right) => {
				const leftMatches = left.shiftPreference !== null && left.shiftPreference === target.shift
				const rightMatches =
					right.shiftPreference !== null && right.shiftPreference === target.shift
				return Number(rightMatches) - Number(leftMatches) || compareRegistration(left, right)
			})
			const seated = waiting.slice(0, available)
			waiting = waiting.slice(available)
			for (const person of seated) {
				place(person, target, shiftFlags(person, target), assignments, placements, remaining)
			}
		}

		for (const person of waiting) {
			unassigned.push({ registrationId: person.id, reason: "unassigned" })
		}
	}

	const unassignedIds = new Set(unassigned.map((row) => row.registrationId))
	const splitTeams = new Set<string>()
	for (const [teamId, members] of collectRealTeams(input.registrations)) {
		const destinations = new Set<string>()
		for (const member of members) {
			const target = placements.get(member.id)
			if (target) destinations.add(target)
			else if (unassignedIds.has(member.id)) destinations.add("__unassigned")
		}
		if (destinations.size > 1) splitTeams.add(teamId)
	}

	for (const assignment of assignments) {
		const person = registrationById.get(assignment.registrationId)
		if (person?.teamId && splitTeams.has(person.teamId)) assignment.flags.push("team_split")
		assignment.flags = uniqueFlags(assignment.flags)
	}

	assignments.sort((left, right) => left.registrationId.localeCompare(right.registrationId))
	unassigned.sort((left, right) => left.registrationId.localeCompare(right.registrationId))

	return {
		assignments,
		unassigned,
		stats: {
			assigned: assignments.length,
			unassigned: unassigned.length,
			remainingSlots: [...remaining.values()].reduce((sum, value) => sum + value, 0),
			teamsSplit: splitTeams.size,
			shiftUnmet: assignments.filter((row) => row.flags.includes("shift_unmet")).length,
		},
	}
}

function compareRegistration(left: AllocationRegistration, right: AllocationRegistration): number {
	return (
		(left.teamId ?? left.id).localeCompare(right.teamId ?? right.id) ||
		left.id.localeCompare(right.id)
	)
}

function groupByTeam(registrations: AllocationRegistration[]) {
	const grouped = new Map<string, AllocationRegistration[]>()
	for (const person of registrations) {
		const key = person.teamId ?? `__person_${person.id}`
		const members = grouped.get(key) ?? []
		members.push(person)
		grouped.set(key, members)
	}
	return [...grouped].map(([key, members]) => ({ key, members }))
}

function collectRealTeams(registrations: AllocationRegistration[]) {
	const grouped = new Map<string, AllocationRegistration[]>()
	for (const person of registrations) {
		if (!person.teamId) continue
		const members = grouped.get(person.teamId) ?? []
		members.push(person)
		grouped.set(person.teamId, members)
	}
	return grouped
}

function countTeamPlacements(
	teamId: string | null,
	flightId: string,
	placements: ReadonlyMap<string, string>,
	registrationById: ReadonlyMap<string, AllocationRegistration>,
): number {
	if (!teamId) return 0
	let count = 0
	for (const [registrationId, targetId] of placements) {
		if (targetId === flightId && registrationById.get(registrationId)?.teamId === teamId) count++
	}
	return count
}

function flightPreferenceScore(
	flight: AllocationFlight,
	members: AllocationRegistration[],
	params: FlightAllocationParams,
): number {
	if (!flight.shift) return 0
	const matches = members.filter((person) => person.shiftPreference === flight.shift).length
	// Team cohesion is enforced structurally by considering whole-team targets first;
	// the configurable preference weight resolves ties among those valid targets.
	return matches * params.shiftPreferenceWeight + members.length * params.teamTogetherWeight
}

function shiftFlags(person: AllocationRegistration, flight: AllocationFlight): AllocationFlag[] {
	return person.shiftPreference && flight.shift && person.shiftPreference !== flight.shift
		? ["shift_unmet"]
		: []
}

function place(
	person: AllocationRegistration,
	flight: AllocationFlight,
	flags: AllocationFlag[],
	assignments: FlightAllocationPlan["assignments"],
	placements: Map<string, string>,
	remaining: Map<string, number>,
) {
	assignments.push({ registrationId: person.id, targetId: flight.id, flags })
	placements.set(person.id, flight.id)
	remaining.set(flight.id, Math.max(0, (remaining.get(flight.id) ?? 0) - 1))
}

function uniqueFlags(flags: AllocationFlag[]): AllocationFlag[] {
	return [...new Set(flags)].sort(
		(left, right) => FLAG_ORDER.indexOf(left) - FLAG_ORDER.indexOf(right),
	)
}
