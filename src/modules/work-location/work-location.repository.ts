import { asc, eq } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { workLocation } from "../../db/schema"

export type WorkLocationRow = typeof workLocation.$inferSelect

export interface UpsertWorkLocationInput {
	name?: string
	active?: boolean
	sortOrder?: number
}

/**
 * No `eventId` here and none in the signatures. `work_location` is company
 * master data, not edition data — see DATA-MODEL.md.
 */
export const workLocationRepository = {
	async list(executor: DbExecutor = db): Promise<WorkLocationRow[]> {
		return executor
			.select()
			.from(workLocation)
			.orderBy(asc(workLocation.sortOrder), asc(workLocation.name))
	},

	async findById(id: string, executor: DbExecutor = db): Promise<WorkLocationRow | undefined> {
		const rows = await executor.select().from(workLocation).where(eq(workLocation.id, id)).limit(1)
		return rows[0]
	},

	async findByName(name: string, executor: DbExecutor = db): Promise<WorkLocationRow | undefined> {
		const rows = await executor
			.select()
			.from(workLocation)
			.where(eq(workLocation.name, name))
			.limit(1)
		return rows[0]
	},

	async insert(
		row: { id: string; name: string; sortOrder: number },
		executor: DbExecutor = db,
	): Promise<WorkLocationRow> {
		const rows = await executor.insert(workLocation).values(row).returning()
		return rows[0]!
	},

	async update(
		id: string,
		input: UpsertWorkLocationInput,
		executor: DbExecutor = db,
	): Promise<WorkLocationRow | undefined> {
		const rows = await executor
			.update(workLocation)
			.set(input)
			.where(eq(workLocation.id, id))
			.returning()
		return rows[0]
	},
}
