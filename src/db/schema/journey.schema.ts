import { relations, sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { event } from "./event.schema"

export const ANNOUNCEMENT_AUDIENCES = ["all", "participants", "organizers"] as const
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number]

export const scheduleItem = sqliteTable(
	"schedule_item",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
		day: integer("day").notNull(),
		startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
		endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
		title: text("title").notNull(),
		description: text("description"),
		location: text("location"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
	},
	(table) => [
		index("schedule_item_event_id_day_start_at_idx").on(table.eventId, table.day, table.startAt),
		check("schedule_item_day_check", sql`${table.day} > 0`),
		check("schedule_item_time_check", sql`${table.endAt} > ${table.startAt}`),
	],
)

export const announcement = sqliteTable(
	"announcement",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		body: text("body").notNull(),
		audience: text("audience").$type<AnnouncementAudience>().notNull().default("participants"),
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
	},
	(table) => [
		index("announcement_event_id_published_at_idx").on(table.eventId, table.publishedAt),
		check("announcement_audience_check", sql`${table.audience} in ('all','participants','organizers')`),
	],
)

export const scheduleItemRelations = relations(scheduleItem, ({ one }) => ({
	event: one(event, { fields: [scheduleItem.eventId], references: [event.id] }),
}))

export const announcementRelations = relations(announcement, ({ one }) => ({
	event: one(event, { fields: [announcement.eventId], references: [event.id] }),
}))
