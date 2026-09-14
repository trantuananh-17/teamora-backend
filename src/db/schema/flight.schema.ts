import { relations, sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.schema"
import { event } from "./event.schema"
import { registration, type TransportLeg } from "./registration.schema"

export const FLIGHT_DIRECTIONS = ["outbound", "return"] as const
export const FLIGHT_SHIFTS = ["shift_1", "shift_2"] as const
export const ALLOCATION_FLAGS = [
	"team_split",
	"shift_unmet",
	"shift_locked_unmet",
	"unassigned",
	"over_capacity",
] as const
export const ALLOCATION_RUN_TYPES = ["flight", "vehicle", "room", "gala"] as const
export const ALLOCATION_RUN_STATUSES = ["preview", "committed", "discarded"] as const

export type FlightDirection = (typeof FLIGHT_DIRECTIONS)[number]
export type FlightShift = (typeof FLIGHT_SHIFTS)[number]
export type AllocationFlag = (typeof ALLOCATION_FLAGS)[number]
export type AllocationRunType = (typeof ALLOCATION_RUN_TYPES)[number]
export type AllocationRunStatus = (typeof ALLOCATION_RUN_STATUSES)[number]

export interface AllocationStats {
	assigned: number
	unassigned: number
	remainingSlots: number
	teamsSplit: number
	shiftUnmet: number
}

export interface StoredFlightAllocationPlan {
	assignments: {
		registrationId: string
		flightId: string
		direction: FlightDirection
		flags: AllocationFlag[]
	}[]
	unassigned: {
		registrationId: string
		direction: FlightDirection
		reason: "shift_locked_unmet" | "unassigned"
	}[]
}

export interface StoredVehicleAllocationPlan {
	assignments: {
		registrationId: string
		vehicleId: string
		leg: TransportLeg
		flags: AllocationFlag[]
	}[]
	unassigned: {
		registrationId: string
		leg: TransportLeg
		reason: "missing_flight" | "unassigned"
	}[]
}

export type StoredAllocationPlan = StoredFlightAllocationPlan | StoredVehicleAllocationPlan

/** One explainable preview/commit lifecycle, shared by all allocator types. */
export const allocationRun = sqliteTable(
	"allocation_run",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		type: text("type").$type<AllocationRunType>().notNull(),
		status: text("status").$type<AllocationRunStatus>().notNull().default("preview"),
		params: text("params", { mode: "json" }).$type<Record<string, number>>().notNull(),
		stats: text("stats", { mode: "json" }).$type<AllocationStats>().notNull(),
		// Preview must survive a page reload without touching the live assignment table.
		plan: text("plan", { mode: "json" }).$type<StoredAllocationPlan>().notNull(),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		committedAt: integer("committed_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("allocation_run_event_id_type_created_at_idx").on(
			table.eventId,
			table.type,
			table.createdAt,
		),
		check("allocation_run_type_check", sql`${table.type} in ('flight', 'vehicle', 'room', 'gala')`),
		check(
			"allocation_run_status_check",
			sql`${table.status} in ('preview', 'committed', 'discarded')`,
		),
	],
)

/** §5.1 — configured capacity; occupancy is always counted from assignments. */
export const flight = sqliteTable(
	"flight",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		code: text("code").notNull(),
		direction: text("direction").$type<FlightDirection>().notNull(),
		departAt: integer("depart_at", { mode: "timestamp_ms" }).notNull(),
		arriveAt: integer("arrive_at", { mode: "timestamp_ms" }).notNull(),
		fromAirport: text("from_airport").notNull(),
		toAirport: text("to_airport").notNull(),
		capacity: integer("capacity").notNull(),
		shift: text("shift").$type<FlightShift>(),
		note: text("note"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("flight_event_id_code_direction_uidx").on(
			table.eventId,
			table.code,
			table.direction,
		),
		index("flight_event_id_direction_depart_at_idx").on(
			table.eventId,
			table.direction,
			table.departAt,
		),
		check("flight_direction_check", sql`${table.direction} in ('outbound', 'return')`),
		check(
			"flight_shift_check",
			sql`${table.shift} is null or ${table.shift} in ('shift_1', 'shift_2')`,
		),
		check("flight_capacity_check", sql`${table.capacity} >= 0`),
		check("flight_time_check", sql`${table.arriveAt} > ${table.departAt}`),
	],
)

/** §5.5 — manual rows are locked and therefore survive every later auto run. */
export const flightAssignment = sqliteTable(
	"flight_assignment",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		flightId: text("flight_id")
			.notNull()
			.references(() => flight.id, { onDelete: "restrict" }),
		registrationId: text("registration_id")
			.notNull()
			.references(() => registration.id, { onDelete: "cascade" }),
		direction: text("direction").$type<FlightDirection>().notNull(),
		source: text("source").$type<"auto" | "manual">().notNull(),
		locked: integer("locked", { mode: "boolean" }).notNull().default(false),
		flags: text("flags", { mode: "json" }).$type<AllocationFlag[]>().notNull().default([]),
		allocationRunId: text("allocation_run_id").references(() => allocationRun.id, {
			onDelete: "restrict",
		}),
		assignedBy: text("assigned_by").references(() => user.id, { onDelete: "restrict" }),
		assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("flight_assignment_registration_id_direction_uidx").on(
			table.registrationId,
			table.direction,
		),
		index("flight_assignment_event_id_flight_id_idx").on(table.eventId, table.flightId),
		index("flight_assignment_event_id_direction_idx").on(table.eventId, table.direction),
		check("flight_assignment_direction_check", sql`${table.direction} in ('outbound', 'return')`),
		check("flight_assignment_source_check", sql`${table.source} in ('auto', 'manual')`),
		check("flight_assignment_locked_check", sql`${table.locked} in (0, 1)`),
	],
)

export const allocationRunRelations = relations(allocationRun, ({ one, many }) => ({
	event: one(event, { fields: [allocationRun.eventId], references: [event.id] }),
	creator: one(user, { fields: [allocationRun.createdBy], references: [user.id] }),
	flightAssignments: many(flightAssignment),
}))

export const flightRelations = relations(flight, ({ one, many }) => ({
	event: one(event, { fields: [flight.eventId], references: [event.id] }),
	assignments: many(flightAssignment),
}))

export const flightAssignmentRelations = relations(flightAssignment, ({ one }) => ({
	event: one(event, { fields: [flightAssignment.eventId], references: [event.id] }),
	flight: one(flight, { fields: [flightAssignment.flightId], references: [flight.id] }),
	registration: one(registration, {
		fields: [flightAssignment.registrationId],
		references: [registration.id],
	}),
	run: one(allocationRun, {
		fields: [flightAssignment.allocationRunId],
		references: [allocationRun.id],
	}),
}))
