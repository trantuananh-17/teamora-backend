import { and, asc, eq } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { pickupPoint } from "../../db/schema"

export type PickupPointRow = typeof pickupPoint.$inferSelect

export interface UpdatePickupPointInput {
	name?: string
	address?: string | null
	workLocationId?: string | null
	active?: boolean
	sortOrder?: number
}

export const pickupPointRepository = {
	async listForEvent(eventId: string, executor: DbExecutor = db): Promise<PickupPointRow[]> {
		return executor
			.select()
			.from(pickupPoint)
			.where(eq(pickupPoint.eventId, eventId))
			.orderBy(asc(pickupPoint.sortOrder), asc(pickupPoint.name))
	},

	/**
	 * Scoped by `eventId` as well as by id. Looking a row up by id alone would
	 * happily return another edition's — the bug DATA-MODEL.md warns about, and
	 * one nothing reports until someone sees last year's data.
	 */
	async findById(
		eventId: string,
		id: string,
		executor: DbExecutor = db,
	): Promise<PickupPointRow | undefined> {
		const rows = await executor
			.select()
			.from(pickupPoint)
			.where(and(eq(pickupPoint.eventId, eventId), eq(pickupPoint.id, id)))
			.limit(1)
		return rows[0]
	},

	async findByName(
		eventId: string,
		name: string,
		executor: DbExecutor = db,
	): Promise<PickupPointRow | undefined> {
		const rows = await executor
			.select()
			.from(pickupPoint)
			.where(and(eq(pickupPoint.eventId, eventId), eq(pickupPoint.name, name)))
			.limit(1)
		return rows[0]
	},

	async insert(
		row: {
			id: string
			eventId: string
			name: string
			address: string | null
			workLocationId: string | null
			sortOrder: number
		},
		executor: DbExecutor = db,
	): Promise<PickupPointRow> {
		const rows = await executor.insert(pickupPoint).values(row).returning()
		return rows[0]!
	},

	async update(
		eventId: string,
		id: string,
		input: UpdatePickupPointInput,
		executor: DbExecutor = db,
	): Promise<PickupPointRow | undefined> {
		const rows = await executor
			.update(pickupPoint)
			.set(input)
			.where(and(eq(pickupPoint.eventId, eventId), eq(pickupPoint.id, id)))
			.returning()
		return rows[0]
	},
}
