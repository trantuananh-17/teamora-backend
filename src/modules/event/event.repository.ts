import { count, desc, eq } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { event } from "../../db/schema"
import type { EventSettings, EventStatus } from "../../db/schema/event.schema"

export type EventRow = typeof event.$inferSelect

export interface CreateEventInput {
	name: string
	code: string
	registrationOpenAt: Date | null
	registrationCloseAt: Date | null
	settings: EventSettings
}

export interface UpdateEventInput {
	name?: string
	registrationOpenAt?: Date | null
	registrationCloseAt?: Date | null
	settings?: EventSettings
}

/**
 * The one table that is not scoped by `eventId` — it *is* the event. Every other
 * repository in the codebase takes `eventId` first and puts it in the `where`.
 */
export const eventRepository = {
	async findById(id: string, executor: DbExecutor = db): Promise<EventRow | undefined> {
		const rows = await executor.select().from(event).where(eq(event.id, id)).limit(1)
		return rows[0]
	},

	async findByCode(code: string, executor: DbExecutor = db): Promise<EventRow | undefined> {
		const rows = await executor.select().from(event).where(eq(event.code, code)).limit(1)
		return rows[0]
	},

	async list(
		params: { limit: number; offset: number },
		executor: DbExecutor = db,
	): Promise<{ items: EventRow[]; total: number }> {
		const [items, totals] = await Promise.all([
			executor
				.select()
				.from(event)
				.orderBy(desc(event.createdAt))
				.limit(params.limit)
				.offset(params.offset),
			executor.select({ value: count() }).from(event),
		])
		return { items, total: totals[0]?.value ?? 0 }
	},

	async insert(
		row: CreateEventInput & { id: string },
		executor: DbExecutor = db,
	): Promise<EventRow> {
		const rows = await executor.insert(event).values(row).returning()
		// `returning()` on an insert of one row always yields one row; anything
		// else means the driver changed under us.
		return rows[0]!
	},

	async update(
		id: string,
		input: UpdateEventInput,
		executor: DbExecutor = db,
	): Promise<EventRow | undefined> {
		const rows = await executor.update(event).set(input).where(eq(event.id, id)).returning()
		return rows[0]
	},

	async updateStatus(
		id: string,
		status: EventStatus,
		publishedAt: Date | null,
		executor: DbExecutor = db,
	): Promise<EventRow | undefined> {
		const rows = await executor
			.update(event)
			// `publishedAt` is only ever written here, and only forwards: once an
			// edition has been published, reverting the status does not unset the
			// moment it happened, because emails went out at that moment.
			.set(publishedAt ? { status, publishedAt } : { status })
			.where(eq(event.id, id))
			.returning()
		return rows[0]
	},
}
