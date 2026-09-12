import { and, desc, eq } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { allocationRun } from "../../db/schema"
import type {
	AllocationRunStatus,
	AllocationRunType,
	AllocationStats,
	StoredAllocationPlan,
} from "../../db/schema/flight.schema"

export type AllocationRunRow = typeof allocationRun.$inferSelect

export const allocationRepository = {
	async insert(
		row: {
			id: string
			eventId: string
			type: AllocationRunType
			params: Record<string, number>
			stats: AllocationStats
			plan: StoredAllocationPlan
			createdBy: string
		},
		executor: DbExecutor = db,
	): Promise<AllocationRunRow> {
		const rows = await executor.insert(allocationRun).values(row).returning()
		return rows[0]!
	},

	async findById(
		eventId: string,
		runId: string,
		executor: DbExecutor = db,
	): Promise<AllocationRunRow | undefined> {
		const rows = await executor
			.select()
			.from(allocationRun)
			.where(and(eq(allocationRun.eventId, eventId), eq(allocationRun.id, runId)))
			.limit(1)
		return rows[0]
	},

	async list(
		eventId: string,
		type: AllocationRunType,
		executor: DbExecutor = db,
	): Promise<AllocationRunRow[]> {
		return executor
			.select()
			.from(allocationRun)
			.where(and(eq(allocationRun.eventId, eventId), eq(allocationRun.type, type)))
			.orderBy(desc(allocationRun.createdAt))
			.limit(25)
	},

	async setStatus(
		eventId: string,
		runId: string,
		status: AllocationRunStatus,
		executor: DbExecutor = db,
	): Promise<AllocationRunRow | undefined> {
		const rows = await executor
			.update(allocationRun)
			.set(status === "committed" ? { status, committedAt: new Date() } : { status })
			.where(and(eq(allocationRun.eventId, eventId), eq(allocationRun.id, runId)))
			.returning()
		return rows[0]
	},
}
