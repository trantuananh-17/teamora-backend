import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/** REQUIREMENTS §12. The order here is the order the machine walks. */
export const EVENT_STATUSES = [
	"registration_open",
	"registration_closed",
	"allocation_processing",
	"information_published",
	"event_started",
	"event_completed",
] as const

export type EventStatus = (typeof EVENT_STATUSES)[number]

/**
 * Everything the organisers may configure per edition. §13 forbids hard-coding
 * any of it, and a JSON column is what keeps "add a knob" from meaning "write a
 * migration".
 *
 * Every key is optional: an event created before a knob existed still has to
 * load. Readers supply their own default rather than assuming presence.
 */
export interface EventSettings {
	/** §4.3 — the text employees must accept, and the version they accepted. */
	terms?: { version: string; body: string }
	/** §4.4 — how many shifts this edition runs and what to call them. */
	shifts?: { key: string; label: string }[]
	/** §5.3 — allocation weights, read by the allocator in S3. */
	allocationWeights?: Record<string, number>
}

/**
 * One edition of the Team Building programme. Every business table hangs off
 * this (ADR-004), so the next edition is a row rather than a migration.
 */
export const event = sqliteTable(
	"event",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		code: text("code").notNull(),
		status: text("status").$type<EventStatus>().notNull().default("registration_open"),
		/** §16 câu 9 — the window in which an employee may still edit their answers. */
		registrationOpenAt: integer("registration_open_at", { mode: "timestamp_ms" }),
		registrationCloseAt: integer("registration_close_at", { mode: "timestamp_ms" }),
		/** Set when status first reaches `information_published`. */
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
		settings: text("settings", { mode: "json" }).$type<EventSettings>().notNull().default({}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("event_code_uidx").on(table.code),
		// `$type` is a TypeScript claim and nothing more. This is what actually
		// stops a bad value arriving from a seed script or a hand-run UPDATE.
		check(
			"event_status_check",
			sql`${table.status} in ('registration_open','registration_closed','allocation_processing','information_published','event_started','event_completed')`,
		),
	],
)
