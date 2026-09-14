import { relations, sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.schema"
import { event } from "./event.schema"
import { allocationRun, type AllocationFlag } from "./flight.schema"
import { pickupPoint } from "./master.schema"
import { registration, type TransportLeg } from "./registration.schema"

export const vehicle = sqliteTable(
	"vehicle",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		code: text("code").notNull(),
		name: text("name").notNull(),
		capacity: integer("capacity").notNull(),
		leg: text("leg").$type<TransportLeg>().notNull(),
		gatherAt: integer("gather_at", { mode: "timestamp_ms" }).notNull(),
		departAt: integer("depart_at", { mode: "timestamp_ms" }).notNull(),
		pickupPointId: text("pickup_point_id").references(() => pickupPoint.id, {
			onDelete: "restrict",
		}),
		destination: text("destination").notNull(),
		leaderName: text("leader_name"),
		leaderPhone: text("leader_phone"),
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
		uniqueIndex("vehicle_event_id_code_leg_uidx").on(table.eventId, table.code, table.leg),
		index("vehicle_event_id_leg_depart_at_idx").on(table.eventId, table.leg, table.departAt),
		index("vehicle_event_id_pickup_point_id_idx").on(table.eventId, table.pickupPointId),
		check("vehicle_capacity_check", sql`${table.capacity} >= 0`),
		check("vehicle_time_check", sql`${table.departAt} >= ${table.gatherAt}`),
		check(
			"vehicle_leg_check",
			sql`${table.leg} in ('origin_to_airport', 'airport_to_hotel', 'hotel_to_airport', 'airport_to_origin')`,
		),
	],
)

export const vehicleAssignment = sqliteTable(
	"vehicle_assignment",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		vehicleId: text("vehicle_id")
			.notNull()
			.references(() => vehicle.id, { onDelete: "restrict" }),
		registrationId: text("registration_id")
			.notNull()
			.references(() => registration.id, { onDelete: "cascade" }),
		leg: text("leg").$type<TransportLeg>().notNull(),
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
		uniqueIndex("vehicle_assignment_registration_id_leg_uidx").on(table.registrationId, table.leg),
		index("vehicle_assignment_event_id_vehicle_id_idx").on(table.eventId, table.vehicleId),
		index("vehicle_assignment_event_id_leg_idx").on(table.eventId, table.leg),
		check("vehicle_assignment_source_check", sql`${table.source} in ('auto', 'manual')`),
		check("vehicle_assignment_locked_check", sql`${table.locked} in (0, 1)`),
		check(
			"vehicle_assignment_leg_check",
			sql`${table.leg} in ('origin_to_airport', 'airport_to_hotel', 'hotel_to_airport', 'airport_to_origin')`,
		),
	],
)

export const vehicleRelations = relations(vehicle, ({ one, many }) => ({
	event: one(event, { fields: [vehicle.eventId], references: [event.id] }),
	pickupPoint: one(pickupPoint, {
		fields: [vehicle.pickupPointId],
		references: [pickupPoint.id],
	}),
	assignments: many(vehicleAssignment),
}))

export const vehicleAssignmentRelations = relations(vehicleAssignment, ({ one }) => ({
	event: one(event, { fields: [vehicleAssignment.eventId], references: [event.id] }),
	vehicle: one(vehicle, { fields: [vehicleAssignment.vehicleId], references: [vehicle.id] }),
	registration: one(registration, {
		fields: [vehicleAssignment.registrationId],
		references: [registration.id],
	}),
	run: one(allocationRun, {
		fields: [vehicleAssignment.allocationRunId],
		references: [allocationRun.id],
	}),
	assignee: one(user, { fields: [vehicleAssignment.assignedBy], references: [user.id] }),
}))
