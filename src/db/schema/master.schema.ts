import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { event } from "./event.schema"

/**
 * Where the company has offices — §4.2's "HN/HCM hoặc danh sách BTC cấu hình".
 *
 * No `eventId`, which is a deliberate exception to ADR-004 alongside
 * `employee_profile`. The reason is a foreign key, not a preference:
 * `employee_profile.workLocationId` points here, and `employee_profile` is
 * cross-edition by design. An FK from a cross-edition table into a per-edition
 * one is stale the moment the next edition is created, and points at a deleted
 * row as soon as an old edition is removed.
 *
 * DATA-MODEL.md groups this with `team` and `pickup_point`; it is the only one
 * of the three that anything cross-edition references.
 */
export const workLocation = sqliteTable(
	"work_location",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		/** Turned off rather than deleted — profiles and audit rows still point here. */
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [uniqueIndex("work_location_name_uidx").on(table.name)],
)

/**
 * A department or team. §4.2 requires employees to pick from this list rather
 * than typing, so the names stay consistent enough to group a flight by.
 *
 * `eventId` is nullable: null means the team exists across every edition, a
 * value means it was created for that one edition only.
 */
export const team = sqliteTable(
	"team",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id").references(() => event.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		// Two indexes, not one, because SQLite treats every NULL as distinct: a
		// single unique(event_id, name) would let "Sales" be created twice as a
		// shared team without complaint.
		uniqueIndex("team_eventId_name_uidx")
			.on(table.eventId, table.name)
			.where(sql`${table.eventId} is not null`),
		uniqueIndex("team_shared_name_uidx")
			.on(table.name)
			.where(sql`${table.eventId} is null`),
		index("team_eventId_idx").on(table.eventId),
	],
)

/**
 * A place a coach picks people up from — §4.5's "điểm tập trung".
 *
 * Per edition, unlike `workLocation`: the meeting points genuinely change when
 * the hotel and the schedule change, and nothing cross-edition references one.
 *
 * `workLocationId` is what keeps the Hanoi list off a Ho Chi Minh City
 * employee's form. Nullable for a point that serves everyone — the airport, say.
 */
export const pickupPoint = sqliteTable(
	"pickup_point",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		workLocationId: text("work_location_id").references(() => workLocation.id, {
			onDelete: "restrict",
		}),
		name: text("name").notNull(),
		address: text("address"),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		uniqueIndex("pickup_point_eventId_name_uidx").on(table.eventId, table.name),
		index("pickup_point_eventId_workLocationId_idx").on(table.eventId, table.workLocationId),
	],
)
