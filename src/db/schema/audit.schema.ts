import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { event } from "./event.schema"

/**
 * Append-only trail of every consequential change (§5.6, ADR-010). Nothing in
 * this codebase updates or deletes a row here.
 *
 * `actorName` and `actorEmail` are snapshots taken at write time, not joins.
 * The trail has to stay readable after the account is deleted, and a foreign key
 * to a row that no longer exists reads as an empty column — which is the same as
 * having no trail on the day someone asks who moved a person's flight.
 *
 * The event reference is `restrict`, not `cascade`: deleting an edition must not
 * take its history with it.
 */
export const auditLog = sqliteTable(
	"audit_log",
	{
		id: text("id").primaryKey(),
		/**
		 * Null means the change was to cross-edition master data — an employee
		 * profile, a work location — which belongs to the company rather than to
		 * any one edition and therefore has no edition to file the entry under.
		 *
		 * Importing four hundred people is exactly the kind of change §5.6 wants a
		 * record of, and it happens before an edition is even chosen.
		 */
		eventId: text("event_id").references(() => event.id, { onDelete: "restrict" }),
		/** Nullable: a change made by a scheduled job has no person behind it. */
		actorId: text("actor_id"),
		actorName: text("actor_name"),
		actorEmail: text("actor_email"),
		/** The table the change landed in, e.g. `registration`. */
		entity: text("entity").notNull(),
		entityId: text("entity_id").notNull(),
		/** What happened, e.g. `create`, `update`, `status_change`, `import`. */
		action: text("action").notNull(),
		before: text("before", { mode: "json" }).$type<unknown>(),
		after: text("after", { mode: "json" }).$type<unknown>(),
		/** Why, when the organiser was asked for a reason — status changes are. */
		reason: text("reason"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		index("audit_log_eventId_entity_entityId_idx").on(table.eventId, table.entity, table.entityId),
		// The audit screen in S6 reads newest-first for one edition.
		index("audit_log_eventId_createdAt_idx").on(table.eventId, table.createdAt),
	],
)
