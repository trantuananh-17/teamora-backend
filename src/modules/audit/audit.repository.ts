import { and, desc, eq } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { auditLog } from "../../db/schema"

export interface AuditRow {
	eventId: string | null
	actorId: string | null
	actorName: string | null
	actorEmail: string | null
	entity: string
	entityId: string
	action: string
	before: unknown
	after: unknown
	reason: string | null
}

/**
 * Append-only. There is deliberately no update and no delete here — not even a
 * private one — because the only way this trail stays worth reading is if the
 * codebase offers no way to edit it (ADR-010).
 */
export const auditRepository = {
	async insert(row: AuditRow & { id: string }, executor: DbExecutor = db) {
		await executor.insert(auditLog).values(row)
	},

	async listForEvent(
		eventId: string,
		params: { limit: number; offset: number },
		executor: DbExecutor = db,
	) {
		return executor
			.select()
			.from(auditLog)
			.where(eq(auditLog.eventId, eventId))
			.orderBy(desc(auditLog.createdAt))
			.limit(params.limit)
			.offset(params.offset)
	},

	async listForEntity(
		eventId: string,
		entity: string,
		entityId: string,
		executor: DbExecutor = db,
	) {
		return executor
			.select()
			.from(auditLog)
			.where(
				and(
					eq(auditLog.eventId, eventId),
					eq(auditLog.entity, entity),
					eq(auditLog.entityId, entityId),
				),
			)
			.orderBy(desc(auditLog.createdAt))
	},
}
