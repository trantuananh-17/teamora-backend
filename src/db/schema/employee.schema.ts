import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { user } from "./auth.schema"
import { workLocation } from "./master.schema"

export const GENDERS = ["male", "female", "other", "undisclosed"] as const
export type Gender = (typeof GENDERS)[number]

/**
 * HR facts about a person. No `eventId` — a person is the same person across
 * editions, which is one of the two exceptions to ADR-004.
 *
 * There is no `fullName` here. Better Auth's `user.name` is not nullable and the
 * employee import writes it, so a second column holding the same thing would be
 * a second source of truth for the name on every screen and in every email —
 * exactly what §13 rules out. DATA-MODEL.md listed one; it was removed rather
 * than kept in sync.
 */
export const employeeProfile = sqliteTable(
	"employee_profile",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** §4.2 — present only when HR has one for this person. */
		employeeCode: text("employee_code"),
		phone: text("phone"),
		workLocationId: text("work_location_id").references(() => workLocation.id, {
			onDelete: "restrict",
		}),
		gender: text("gender").$type<Gender>().notNull().default("undisclosed"),
		specialRequest: text("special_request"),
		/**
		 * Someone who has left. Turned off, never deleted: audit rows and past
		 * registrations still point at them, and §5.6 requires the trail to stay
		 * readable.
		 */
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("employee_profile_userId_uidx").on(table.userId),
		// Partial, because SQLite counts every NULL as distinct: a plain unique
		// index would still be correct, but declaring the predicate says out loud
		// that "no code" is a real state and not a duplicate.
		uniqueIndex("employee_profile_employeeCode_uidx")
			.on(table.employeeCode)
			.where(sql`${table.employeeCode} is not null`),
		index("employee_profile_workLocationId_idx").on(table.workLocationId),
		check(
			"employee_profile_gender_check",
			sql`${table.gender} in ('male','female','other','undisclosed')`,
		),
	],
)
