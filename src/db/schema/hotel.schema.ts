import { relations, sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.schema"
import { event } from "./event.schema"
import { registration } from "./registration.schema"

export const hotel = sqliteTable(
	"hotel",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		address: text("address").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("hotel_event_id_name_uidx").on(table.eventId, table.name),
		index("hotel_event_id_idx").on(table.eventId),
	],
)

export const roomType = sqliteTable(
	"room_type",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		hotelId: text("hotel_id")
			.notNull()
			.references(() => hotel.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		capacity: integer("capacity").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("room_type_hotel_id_name_uidx").on(table.hotelId, table.name),
		index("room_type_event_id_hotel_id_idx").on(table.eventId, table.hotelId),
		check("room_type_capacity_check", sql`${table.capacity} > 0`),
	],
)

export const room = sqliteTable(
	"room",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		hotelId: text("hotel_id")
			.notNull()
			.references(() => hotel.id, { onDelete: "cascade" }),
		roomTypeId: text("room_type_id")
			.notNull()
			.references(() => roomType.id, { onDelete: "restrict" }),
		code: text("code").notNull(),
		capacity: integer("capacity").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("room_hotel_id_code_uidx").on(table.hotelId, table.code),
		index("room_event_id_hotel_id_idx").on(table.eventId, table.hotelId),
		index("room_event_id_room_type_id_idx").on(table.eventId, table.roomTypeId),
		check("room_capacity_check", sql`${table.capacity} > 0`),
	],
)

export const roomAssignment = sqliteTable(
	"room_assignment",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		roomId: text("room_id")
			.notNull()
			.references(() => room.id, { onDelete: "restrict" }),
		registrationId: text("registration_id")
			.notNull()
			.references(() => registration.id, { onDelete: "cascade" }),
		source: text("source").$type<"import" | "manual" | "auto">().notNull(),
		locked: integer("locked", { mode: "boolean" }).notNull().default(false),
		assignedBy: text("assigned_by").references(() => user.id, { onDelete: "restrict" }),
		assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("room_assignment_registration_id_uidx").on(table.registrationId),
		index("room_assignment_event_id_room_id_idx").on(table.eventId, table.roomId),
		check("room_assignment_source_check", sql`${table.source} in ('import', 'manual', 'auto')`),
		check("room_assignment_locked_check", sql`${table.locked} in (0, 1)`),
	],
)

export const hotelRelations = relations(hotel, ({ one, many }) => ({
	event: one(event, { fields: [hotel.eventId], references: [event.id] }),
	roomTypes: many(roomType),
	rooms: many(room),
}))

export const roomTypeRelations = relations(roomType, ({ one, many }) => ({
	event: one(event, { fields: [roomType.eventId], references: [event.id] }),
	hotel: one(hotel, { fields: [roomType.hotelId], references: [hotel.id] }),
	rooms: many(room),
}))

export const roomRelations = relations(room, ({ one, many }) => ({
	event: one(event, { fields: [room.eventId], references: [event.id] }),
	hotel: one(hotel, { fields: [room.hotelId], references: [hotel.id] }),
	roomType: one(roomType, { fields: [room.roomTypeId], references: [roomType.id] }),
	assignments: many(roomAssignment),
}))

export const roomAssignmentRelations = relations(roomAssignment, ({ one }) => ({
	event: one(event, { fields: [roomAssignment.eventId], references: [event.id] }),
	room: one(room, { fields: [roomAssignment.roomId], references: [room.id] }),
	registration: one(registration, {
		fields: [roomAssignment.registrationId],
		references: [registration.id],
	}),
	assignee: one(user, { fields: [roomAssignment.assignedBy], references: [user.id] }),
}))
