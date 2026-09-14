import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import {
	flight,
	flightAssignment,
	registration,
	registrationTransportNeed,
	team,
	user,
	vehicle,
	vehicleAssignment,
} from "../../db/schema"
import type { AllocationFlag, FlightDirection } from "../../db/schema/flight.schema"
import type { TransportLeg } from "../../db/schema/registration.schema"
import { newId } from "../../shared/id"
import type { ListVehiclesQuery } from "./vehicle.dto"

export type VehicleRow = typeof vehicle.$inferSelect
export interface VehicleWithOccupancy extends VehicleRow {
	assignedCount: number
}
export interface InsertVehicleInput {
	id: string
	eventId: string
	code: string
	name: string
	capacity: number
	leg: TransportLeg
	gatherAt: Date
	departAt: Date
	pickupPointId: string | null
	destination: string
	leaderName: string | null
	leaderPhone: string | null
	note: string | null
}
export type VehicleAssignmentRow = typeof vehicleAssignment.$inferSelect
export interface VehicleAssignmentDetail {
	assignment: VehicleAssignmentRow
	vehicle: VehicleRow
}
export interface VehicleCandidateRow {
	id: string
	teamId: string
	pickupPointId: string | null
	flightId: string | null
	user: { name: string; email: string }
	team: { id: string; name: string }
}

export const vehicleRepository = {
	async list(
		eventId: string,
		query: ListVehiclesQuery,
		params: { limit: number; offset: number },
		executor: DbExecutor = db,
	) {
		const conditions = [eq(vehicle.eventId, eventId)]
		if (query.leg) conditions.push(eq(vehicle.leg, query.leg))
		if (query.search) {
			const pattern = `%${query.search}%`
			conditions.push(
				or(
					ilike(vehicle.code, pattern),
					ilike(vehicle.name, pattern),
					ilike(vehicle.destination, pattern),
				)!,
			)
		}
		const where = and(...conditions)
		const [rows, totals] = await Promise.all([
			executor
				.select({ vehicle, assignedCount: count(vehicleAssignment.id) })
				.from(vehicle)
				.leftJoin(vehicleAssignment, eq(vehicle.id, vehicleAssignment.vehicleId))
				.where(where)
				.groupBy(vehicle.id)
				.orderBy(asc(vehicle.leg), asc(vehicle.departAt), asc(vehicle.code))
				.limit(params.limit)
				.offset(params.offset),
			executor.select({ value: count() }).from(vehicle).where(where),
		])
		return {
			items: rows.map((row) => ({ ...row.vehicle, assignedCount: row.assignedCount })),
			total: totals[0]?.value ?? 0,
		}
	},
	async listAll(eventId: string, executor: DbExecutor = db): Promise<VehicleWithOccupancy[]> {
		const rows = await executor
			.select({ vehicle, assignedCount: count(vehicleAssignment.id) })
			.from(vehicle)
			.leftJoin(vehicleAssignment, eq(vehicle.id, vehicleAssignment.vehicleId))
			.where(eq(vehicle.eventId, eventId))
			.groupBy(vehicle.id)
			.orderBy(asc(vehicle.leg), asc(vehicle.departAt), asc(vehicle.code))
		return rows.map((row) => ({ ...row.vehicle, assignedCount: row.assignedCount }))
	},
	async findById(
		eventId: string,
		id: string,
		executor: DbExecutor = db,
	): Promise<VehicleWithOccupancy | undefined> {
		const rows = await executor
			.select({ vehicle, assignedCount: count(vehicleAssignment.id) })
			.from(vehicle)
			.leftJoin(vehicleAssignment, eq(vehicle.id, vehicleAssignment.vehicleId))
			.where(and(eq(vehicle.eventId, eventId), eq(vehicle.id, id)))
			.groupBy(vehicle.id)
			.limit(1)
		return rows[0] ? { ...rows[0].vehicle, assignedCount: rows[0].assignedCount } : undefined
	},
	async findByCodeLeg(eventId: string, code: string, leg: TransportLeg, executor: DbExecutor = db) {
		return (
			await executor
				.select()
				.from(vehicle)
				.where(and(eq(vehicle.eventId, eventId), eq(vehicle.code, code), eq(vehicle.leg, leg)))
				.limit(1)
		)[0]
	},
	async insert(input: InsertVehicleInput, executor: DbExecutor = db): Promise<VehicleRow> {
		return (await executor.insert(vehicle).values(input).returning())[0]!
	},
	async update(
		eventId: string,
		id: string,
		input: Partial<Omit<InsertVehicleInput, "id" | "eventId">>,
		executor: DbExecutor = db,
	) {
		return (
			await executor
				.update(vehicle)
				.set({ ...input, updatedAt: new Date() })
				.where(and(eq(vehicle.eventId, eventId), eq(vehicle.id, id)))
				.returning()
		)[0]
	},
	async delete(eventId: string, id: string, executor: DbExecutor = db) {
		return (
			(await executor.delete(vehicle).where(and(eq(vehicle.eventId, eventId), eq(vehicle.id, id))))
				.rowsAffected > 0
		)
	},
	async listCandidates(
		eventId: string,
		leg: TransportLeg,
		executor: DbExecutor = db,
	): Promise<VehicleCandidateRow[]> {
		const direction: FlightDirection =
			leg === "origin_to_airport" || leg === "airport_to_hotel" ? "outbound" : "return"
		return executor
			.select({
				id: registration.id,
				teamId: registration.teamId,
				pickupPointId: registrationTransportNeed.pickupPointId,
				flightId: flightAssignment.flightId,
				user: { name: user.name, email: user.email },
				team: { id: team.id, name: team.name },
			})
			.from(registrationTransportNeed)
			.innerJoin(registration, eq(registrationTransportNeed.registrationId, registration.id))
			.innerJoin(user, eq(registration.userId, user.id))
			.innerJoin(team, eq(registration.teamId, team.id))
			.leftJoin(
				flightAssignment,
				and(
					eq(flightAssignment.registrationId, registration.id),
					eq(flightAssignment.direction, direction),
				),
			)
			.where(
				and(
					eq(registration.eventId, eventId),
					eq(registration.participating, true),
					eq(registrationTransportNeed.leg, leg),
					eq(registrationTransportNeed.needed, true),
				),
			)
			.orderBy(asc(team.name), asc(user.name))
	},
	async listAssignments(
		eventId: string,
		executor: DbExecutor = db,
	): Promise<VehicleAssignmentDetail[]> {
		return executor
			.select({ assignment: vehicleAssignment, vehicle })
			.from(vehicleAssignment)
			.innerJoin(vehicle, eq(vehicleAssignment.vehicleId, vehicle.id))
			.where(eq(vehicleAssignment.eventId, eventId))
			.orderBy(asc(vehicleAssignment.leg), asc(vehicle.code))
	},
	async findAssignmentById(
		eventId: string,
		id: string,
		executor: DbExecutor = db,
	): Promise<VehicleAssignmentDetail | undefined> {
		return (
			await executor
				.select({ assignment: vehicleAssignment, vehicle })
				.from(vehicleAssignment)
				.innerJoin(vehicle, eq(vehicleAssignment.vehicleId, vehicle.id))
				.where(and(eq(vehicleAssignment.eventId, eventId), eq(vehicleAssignment.id, id)))
				.limit(1)
		)[0]
	},
	async deleteUnlockedAssignments(eventId: string, executor: DbExecutor = db) {
		await executor
			.delete(vehicleAssignment)
			.where(and(eq(vehicleAssignment.eventId, eventId), eq(vehicleAssignment.locked, false)))
	},
	async insertAutoAssignments(
		eventId: string,
		runId: string,
		actorId: string,
		rows: {
			registrationId: string
			vehicleId: string
			leg: TransportLeg
			flags: AllocationFlag[]
		}[],
		executor: DbExecutor = db,
	) {
		if (rows.length === 0) return
		const assignedAt = new Date()
		await executor
			.insert(vehicleAssignment)
			.values(
				rows.map((row) => ({
					id: newId(),
					eventId,
					...row,
					source: "auto" as const,
					locked: false,
					allocationRunId: runId,
					assignedBy: actorId,
					assignedAt,
				})),
			)
	},
	async upsertManualAssignments(
		eventId: string,
		vehicleId: string,
		leg: TransportLeg,
		actorId: string,
		registrationIds: string[],
		executor: DbExecutor = db,
	) {
		const assignedAt = new Date()
		for (const registrationId of registrationIds)
			await executor
				.insert(vehicleAssignment)
				.values({
					id: newId(),
					eventId,
					vehicleId,
					registrationId,
					leg,
					source: "manual",
					locked: true,
					flags: [],
					allocationRunId: null,
					assignedBy: actorId,
					assignedAt,
				})
				.onConflictDoUpdate({
					target: [vehicleAssignment.registrationId, vehicleAssignment.leg],
					set: {
						vehicleId,
						source: "manual",
						locked: true,
						flags: [],
						allocationRunId: null,
						assignedBy: actorId,
						assignedAt,
					},
				})
	},
	async setAssignmentLock(eventId: string, id: string, locked: boolean, executor: DbExecutor = db) {
		return (
			await executor
				.update(vehicleAssignment)
				.set({ locked })
				.where(and(eq(vehicleAssignment.eventId, eventId), eq(vehicleAssignment.id, id)))
				.returning()
		)[0]
	},
	async findCandidatesByIds(
		eventId: string,
		leg: TransportLeg,
		ids: string[],
		executor: DbExecutor = db,
	) {
		if (ids.length === 0) return []
		return (await this.listCandidates(eventId, leg, executor)).filter((row) => ids.includes(row.id))
	},
	async findAssignmentsForRegistrations(
		eventId: string,
		leg: TransportLeg,
		ids: string[],
		executor: DbExecutor = db,
	) {
		if (ids.length === 0) return []
		return executor
			.select({ assignment: vehicleAssignment, vehicle })
			.from(vehicleAssignment)
			.innerJoin(vehicle, eq(vehicleAssignment.vehicleId, vehicle.id))
			.where(
				and(
					eq(vehicleAssignment.eventId, eventId),
					eq(vehicleAssignment.leg, leg),
					inArray(vehicleAssignment.registrationId, ids),
				),
			)
	},
}
