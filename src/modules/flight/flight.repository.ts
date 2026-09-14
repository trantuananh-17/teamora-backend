import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { flight, flightAssignment, registration, team, user } from "../../db/schema"
import type { AllocationFlag, FlightDirection, FlightShift } from "../../db/schema/flight.schema"
import { newId } from "../../shared/id"
import type { ListFlightsQuery } from "./flight.dto"

export type FlightRow = typeof flight.$inferSelect
export type FlightAssignmentRow = typeof flightAssignment.$inferSelect

export interface FlightWithOccupancy extends FlightRow {
	assignedCount: number
}

export interface AllocationRegistrationRow {
	id: string
	teamId: string
	shiftPreference: FlightShift | null
	shiftLocked: boolean
	user: { name: string; email: string }
	team: { id: string; name: string }
}

export interface AssignmentDetailRow {
	assignment: FlightAssignmentRow
	flight: FlightRow
}

export interface InsertFlightInput {
	id: string
	eventId: string
	code: string
	direction: FlightDirection
	departAt: Date
	arriveAt: Date
	fromAirport: string
	toAirport: string
	capacity: number
	shift: FlightShift | null
	note: string | null
}

export const flightRepository = {
	async list(
		eventId: string,
		query: ListFlightsQuery,
		params: { limit: number; offset: number },
		executor: DbExecutor = db,
	): Promise<{ items: FlightWithOccupancy[]; total: number }> {
		const conditions = [eq(flight.eventId, eventId)]
		if (query.direction) conditions.push(eq(flight.direction, query.direction))
		if (query.shift) conditions.push(eq(flight.shift, query.shift))
		if (query.search) {
			const pattern = `%${query.search}%`
			conditions.push(
				or(
					ilike(flight.code, pattern),
					ilike(flight.fromAirport, pattern),
					ilike(flight.toAirport, pattern),
				)!,
			)
		}
		const where = and(...conditions)
		const [rows, totals] = await Promise.all([
			executor
				.select({ flight, assignedCount: count(flightAssignment.id) })
				.from(flight)
				.leftJoin(flightAssignment, eq(flight.id, flightAssignment.flightId))
				.where(where)
				.groupBy(flight.id)
				.orderBy(asc(flight.direction), asc(flight.departAt), asc(flight.code))
				.limit(params.limit)
				.offset(params.offset),
			executor.select({ value: count() }).from(flight).where(where),
		])
		return {
			items: rows.map((row) => ({ ...row.flight, assignedCount: row.assignedCount })),
			total: totals[0]?.value ?? 0,
		}
	},

	async listAll(eventId: string, executor: DbExecutor = db): Promise<FlightWithOccupancy[]> {
		const rows = await executor
			.select({ flight, assignedCount: count(flightAssignment.id) })
			.from(flight)
			.leftJoin(flightAssignment, eq(flight.id, flightAssignment.flightId))
			.where(eq(flight.eventId, eventId))
			.groupBy(flight.id)
			.orderBy(asc(flight.direction), asc(flight.departAt), asc(flight.code))
		return rows.map((row) => ({ ...row.flight, assignedCount: row.assignedCount }))
	},

	async findById(
		eventId: string,
		flightId: string,
		executor: DbExecutor = db,
	): Promise<FlightWithOccupancy | undefined> {
		const rows = await executor
			.select({ flight, assignedCount: count(flightAssignment.id) })
			.from(flight)
			.leftJoin(flightAssignment, eq(flight.id, flightAssignment.flightId))
			.where(and(eq(flight.eventId, eventId), eq(flight.id, flightId)))
			.groupBy(flight.id)
			.limit(1)
		const row = rows[0]
		return row ? { ...row.flight, assignedCount: row.assignedCount } : undefined
	},

	async findByCodeDirection(
		eventId: string,
		code: string,
		direction: FlightDirection,
		executor: DbExecutor = db,
	): Promise<FlightRow | undefined> {
		const rows = await executor
			.select()
			.from(flight)
			.where(
				and(eq(flight.eventId, eventId), eq(flight.code, code), eq(flight.direction, direction)),
			)
			.limit(1)
		return rows[0]
	},

	async insert(input: InsertFlightInput, executor: DbExecutor = db): Promise<FlightRow> {
		const rows = await executor.insert(flight).values(input).returning()
		return rows[0]!
	},

	async update(
		eventId: string,
		flightId: string,
		input: Partial<Omit<InsertFlightInput, "id" | "eventId">>,
		executor: DbExecutor = db,
	): Promise<FlightRow | undefined> {
		const rows = await executor
			.update(flight)
			.set({ ...input, updatedAt: new Date() })
			.where(and(eq(flight.eventId, eventId), eq(flight.id, flightId)))
			.returning()
		return rows[0]
	},

	async delete(eventId: string, flightId: string, executor: DbExecutor = db): Promise<boolean> {
		const result = await executor
			.delete(flight)
			.where(and(eq(flight.eventId, eventId), eq(flight.id, flightId)))
		return result.rowsAffected > 0
	},

	async listParticipatingRegistrations(
		eventId: string,
		executor: DbExecutor = db,
	): Promise<AllocationRegistrationRow[]> {
		return executor
			.select({
				id: registration.id,
				teamId: registration.teamId,
				shiftPreference: registration.shiftPreference,
				shiftLocked: registration.shiftLocked,
				user: { name: user.name, email: user.email },
				team: { id: team.id, name: team.name },
			})
			.from(registration)
			.innerJoin(user, eq(registration.userId, user.id))
			.innerJoin(team, eq(registration.teamId, team.id))
			.where(and(eq(registration.eventId, eventId), eq(registration.participating, true)))
			.orderBy(asc(team.name), asc(user.name))
	},

	async findParticipatingRegistrationsByIds(
		eventId: string,
		registrationIds: string[],
		executor: DbExecutor = db,
	): Promise<AllocationRegistrationRow[]> {
		if (registrationIds.length === 0) return []
		return executor
			.select({
				id: registration.id,
				teamId: registration.teamId,
				shiftPreference: registration.shiftPreference,
				shiftLocked: registration.shiftLocked,
				user: { name: user.name, email: user.email },
				team: { id: team.id, name: team.name },
			})
			.from(registration)
			.innerJoin(user, eq(registration.userId, user.id))
			.innerJoin(team, eq(registration.teamId, team.id))
			.where(
				and(
					eq(registration.eventId, eventId),
					eq(registration.participating, true),
					inArray(registration.id, registrationIds),
				),
			)
	},

	async listAssignments(
		eventId: string,
		executor: DbExecutor = db,
	): Promise<AssignmentDetailRow[]> {
		return executor
			.select({ assignment: flightAssignment, flight })
			.from(flightAssignment)
			.innerJoin(flight, eq(flightAssignment.flightId, flight.id))
			.where(eq(flightAssignment.eventId, eventId))
			.orderBy(asc(flightAssignment.direction), asc(flight.departAt))
	},

	async findAssignmentById(
		eventId: string,
		assignmentId: string,
		executor: DbExecutor = db,
	): Promise<AssignmentDetailRow | undefined> {
		const rows = await executor
			.select({ assignment: flightAssignment, flight })
			.from(flightAssignment)
			.innerJoin(flight, eq(flightAssignment.flightId, flight.id))
			.where(and(eq(flightAssignment.eventId, eventId), eq(flightAssignment.id, assignmentId)))
			.limit(1)
		return rows[0]
	},

	async findAssignmentsForRegistrations(
		eventId: string,
		registrationIds: string[],
		direction: FlightDirection,
		executor: DbExecutor = db,
	): Promise<AssignmentDetailRow[]> {
		if (registrationIds.length === 0) return []
		return executor
			.select({ assignment: flightAssignment, flight })
			.from(flightAssignment)
			.innerJoin(flight, eq(flightAssignment.flightId, flight.id))
			.where(
				and(
					eq(flightAssignment.eventId, eventId),
					eq(flightAssignment.direction, direction),
					inArray(flightAssignment.registrationId, registrationIds),
				),
			)
	},

	async deleteUnlockedAssignments(eventId: string, executor: DbExecutor = db): Promise<void> {
		await executor
			.delete(flightAssignment)
			.where(and(eq(flightAssignment.eventId, eventId), eq(flightAssignment.locked, false)))
	},

	async insertAutoAssignments(
		eventId: string,
		runId: string,
		actorId: string,
		assignments: {
			registrationId: string
			flightId: string
			direction: FlightDirection
			flags: AllocationFlag[]
		}[],
		executor: DbExecutor = db,
	): Promise<void> {
		if (assignments.length === 0) return
		const assignedAt = new Date()
		await executor.insert(flightAssignment).values(
			assignments.map((row) => ({
				id: newId(),
				eventId,
				flightId: row.flightId,
				registrationId: row.registrationId,
				direction: row.direction,
				source: "auto" as const,
				locked: false,
				flags: row.flags,
				allocationRunId: runId,
				assignedBy: actorId,
				assignedAt,
			})),
		)
	},

	async upsertManualAssignments(
		eventId: string,
		flightId: string,
		direction: FlightDirection,
		actorId: string,
		rows: { registrationId: string; flags: AllocationFlag[] }[],
		executor: DbExecutor = db,
	): Promise<void> {
		const assignedAt = new Date()
		for (const row of rows) {
			await executor
				.insert(flightAssignment)
				.values({
					id: newId(),
					eventId,
					flightId,
					registrationId: row.registrationId,
					direction,
					source: "manual",
					locked: true,
					flags: row.flags,
					allocationRunId: null,
					assignedBy: actorId,
					assignedAt,
				})
				.onConflictDoUpdate({
					target: [flightAssignment.registrationId, flightAssignment.direction],
					set: {
						flightId,
						source: "manual",
						locked: true,
						flags: row.flags,
						allocationRunId: null,
						assignedBy: actorId,
						assignedAt,
					},
				})
		}
	},

	async setAssignmentLock(
		eventId: string,
		assignmentId: string,
		locked: boolean,
		executor: DbExecutor = db,
	): Promise<FlightAssignmentRow | undefined> {
		const rows = await executor
			.update(flightAssignment)
			.set({ locked })
			.where(and(eq(flightAssignment.eventId, eventId), eq(flightAssignment.id, assignmentId)))
			.returning()
		return rows[0]
	},

	async countAssignmentsForFlight(
		eventId: string,
		flightId: string,
		executor: DbExecutor = db,
	): Promise<number> {
		const rows = await executor
			.select({ value: count() })
			.from(flightAssignment)
			.where(and(eq(flightAssignment.eventId, eventId), eq(flightAssignment.flightId, flightId)))
		return rows[0]?.value ?? 0
	},

	async listRecentAssignments(
		eventId: string,
		executor: DbExecutor = db,
	): Promise<FlightAssignmentRow[]> {
		return executor
			.select()
			.from(flightAssignment)
			.where(eq(flightAssignment.eventId, eventId))
			.orderBy(desc(flightAssignment.assignedAt))
	},
}
