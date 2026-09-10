import { db, type DbExecutor } from "../../db/client"
import { newId } from "../../shared/id"
import { auditRepository } from "./audit.repository"

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

/**
 * No routes, no controller, no DTO — this module has no endpoint of its own.
 * Reading the trail is a screen in S6 and will hang off the event module.
 */
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
}
