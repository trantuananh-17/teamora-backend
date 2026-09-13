import { db, type DbExecutor } from "../../db/client"
import { writeSheet } from "../../excel/writer"
import { newId } from "../../shared/id"
import type { Page, PaginationQuery } from "../../shared/pagination"
import { page } from "../../shared/pagination"
import type { ListAuditLogsQuery } from "./audit.dto"
import { auditRepository } from "./audit.repository"
import type { AuditLogRow } from "./audit.repository"

/**
 * Who did it. Captured as values rather than an id, because the trail has to
 * still name a person after their account is deleted (ADR-010).
 *
 * `null` is for a change with no person behind it — the outbox worker, a
 * scheduled sweep. It is not a fallback for "we could not be bothered to pass
 * the actor": every organiser action has one, from the session.
 */
export interface AuditActor {
	id: string
	name: string | null
	email: string | null
}

export interface AuditEntry {
	/**
	 * Null for cross-edition master data — employee profiles, work locations.
	 * Those belong to the company rather than to an edition, so there is no
	 * edition to file the entry under.
	 */
	eventId: string | null
	actor: AuditActor | null
	entity: string
	entityId: string
	action: string
	before?: unknown
	after?: unknown
	reason?: string
}

export const auditService = {
	/**
	 * Takes the executor so it can join the caller's transaction. It nearly always
	 * should: a change that commits while its audit row rolls back is a change
	 * nobody can account for, which is the one outcome §5.6 exists to prevent.
	 */
	async record(entry: AuditEntry, executor: DbExecutor = db) {
		await auditRepository.insert(
			{
				id: newId(),
				eventId: entry.eventId,
				actorId: entry.actor?.id ?? null,
				actorName: entry.actor?.name ?? null,
				actorEmail: entry.actor?.email ?? null,
				entity: entry.entity,
				entityId: entry.entityId,
				action: entry.action,
				before: entry.before ?? null,
				after: entry.after ?? null,
				reason: entry.reason ?? null,
			},
			executor,
		)
	},

	async list(
		eventId: string,
		query: ListAuditLogsQuery,
		pagination: PaginationQuery,
	): Promise<Page<AuditLogRow> & { filters: { entities: string[]; actions: string[] } }> {
		const [result, filters] = await Promise.all([
			auditRepository.listForEvent(eventId, query, pagination),
			auditRepository.facets(eventId),
		])
		return { ...page(result.items, result.total, pagination), filters }
	},

	async exportExcel(
		eventId: string,
		query: ListAuditLogsQuery,
		actor: AuditActor,
	): Promise<Buffer> {
		const rows = await auditRepository.listAllForEvent(eventId, query)
		const output = await writeSheet(
			"Nhật ký thay đổi",
			[
				{ key: "createdAt", header: "Thời điểm", required: true },
				{ key: "actorName", header: "Người thao tác", required: true },
				{ key: "actorEmail", header: "Email", required: true },
				{ key: "entity", header: "Đối tượng", required: true },
				{ key: "entityId", header: "ID đối tượng", required: true },
				{ key: "action", header: "Hành động", required: true },
				{ key: "reason", header: "Lý do", required: true },
				{ key: "before", header: "Trước thay đổi", required: true },
				{ key: "after", header: "Sau thay đổi", required: true },
			],
			rows.map((row) => ({
				createdAt: row.createdAt.toISOString(),
				actorName: row.actorName ?? "Hệ thống",
				actorEmail: row.actorEmail ?? "",
				entity: row.entity,
				entityId: row.entityId,
				action: row.action,
				reason: row.reason ?? "",
				before: jsonCell(row.before),
				after: jsonCell(row.after),
			})),
		)

		await this.record({
			eventId,
			actor,
			entity: "audit_log",
			entityId: eventId,
			action: "export",
			after: { rows: rows.length, filters: query },
		})
		return output
	},
}

function jsonCell(value: unknown): string {
	return value === null || value === undefined ? "" : JSON.stringify(value)
}
