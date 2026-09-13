import { and, asc, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { auditLog } from "../../db/schema"
import type { ListAuditLogsQuery } from "./audit.dto"

export type AuditLogRow = typeof auditLog.$inferSelect

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
		query: ListAuditLogsQuery,
		params: { limit: number; offset: number },
		executor: DbExecutor = db,
	): Promise<{ items: AuditLogRow[]; total: number }> {
		const where = auditWhere(eventId, query)
		const [items, totals] = await Promise.all([
			executor
				.select()
				.from(auditLog)
				.where(where)
				.orderBy(desc(auditLog.createdAt), desc(auditLog.id))
				.limit(params.limit)
				.offset(params.offset),
			executor.select({ value: count() }).from(auditLog).where(where),
		])
		return { items, total: totals[0]?.value ?? 0 }
	},

	async listAllForEvent(
		eventId: string,
		query: ListAuditLogsQuery,
		executor: DbExecutor = db,
	): Promise<AuditLogRow[]> {
		return executor
			.select()
			.from(auditLog)
			.where(auditWhere(eventId, query))
			.orderBy(desc(auditLog.createdAt), desc(auditLog.id))
	},

	async facets(eventId: string, executor: DbExecutor = db) {
		const [entities, actions] = await Promise.all([
			executor
				.selectDistinct({ value: auditLog.entity })
				.from(auditLog)
				.where(eq(auditLog.eventId, eventId))
				.orderBy(asc(auditLog.entity)),
			executor
				.selectDistinct({ value: auditLog.action })
				.from(auditLog)
				.where(eq(auditLog.eventId, eventId))
				.orderBy(asc(auditLog.action)),
		])
		return {
			entities: entities.map((row) => row.value),
			actions: actions.map((row) => row.value),
		}
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

function auditWhere(eventId: string, query: ListAuditLogsQuery) {
	const conditions = [eq(auditLog.eventId, eventId)]
	if (query.entity) conditions.push(eq(auditLog.entity, query.entity))
	if (query.action) conditions.push(eq(auditLog.action, query.action))
	if (query.from) conditions.push(gte(auditLog.createdAt, query.from))
	if (query.to) conditions.push(lte(auditLog.createdAt, query.to))
	if (query.search) {
		const pattern = `%${query.search}%`
		conditions.push(
			or(
				ilike(auditLog.actorName, pattern),
				ilike(auditLog.actorEmail, pattern),
				ilike(auditLog.entityId, pattern),
				ilike(auditLog.reason, pattern),
			)!,
		)
	}
	return and(...conditions)
}
