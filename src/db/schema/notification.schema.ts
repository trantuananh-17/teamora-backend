import { check, sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations, sql } from "drizzle-orm"
import { event } from "./event.schema"
import { registration } from "./registration.schema"

/**
 * Notification - Outbox table cho email và thông báo
 * §11 - Phase 1 chỉ email; enum khai báo sẵn cho Phase 2
 */
export const notification = sqliteTable(
	"notification",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		registrationId: text("registration_id").references(() => registration.id, {
			onDelete: "cascade",
		}),

		// §11 - Phase 1: email. Phase 2: teams, in_app
		channel: text("channel").$type<"email" | "teams" | "in_app">().notNull(),

		// Template key: registration_confirmed, information_published, assignment_changed
		template: text("template").notNull(),

		// Payload JSON chứa dữ liệu để render template
		payload: text("payload", { mode: "json" }).notNull().$type<Record<string, unknown>>(),

		status: text("status").$type<"pending" | "sent" | "failed">().notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),

		scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
		sentAt: integer("sent_at", { mode: "timestamp_ms" }),
	},
	(t) => [
		// Vòng lặp outbox cần index này
		index("notification_status_scheduled_idx").on(t.status, t.scheduledAt),
		index("notification_event_id_idx").on(t.eventId),
		index("notification_reg_id_idx").on(t.registrationId),
		check("notification_channel_check", sql`${t.channel} in ('email', 'teams', 'in_app')`),
		check(
			"notification_template_check",
			sql`${t.template} in ('registration_confirmed', 'information_published', 'assignment_changed')`,
		),
		check("notification_status_check", sql`${t.status} in ('pending', 'sent', 'failed')`),
		check("notification_attempts_check", sql`${t.attempts} >= 0`),
	],
)

export const notificationRelations = relations(notification, ({ one }) => ({
	event: one(event, {
		fields: [notification.eventId],
		references: [event.id],
	}),
	registration: one(registration, {
		fields: [notification.registrationId],
		references: [registration.id],
	}),
}))
