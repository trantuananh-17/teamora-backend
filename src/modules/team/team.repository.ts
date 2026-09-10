import { and, asc, eq, isNull, or } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { team } from "../../db/schema"

export type TeamRow = typeof team.$inferSelect

export interface UpdateTeamInput {
	name?: string
	active?: boolean
	sortOrder?: number
}

export const teamRepository = {
	/**
	 * What an edition can actually use: its own teams plus the shared ones.
	 *
	 * This `or` is the whole reason `team.eventId` is nullable, and it is why
	 * every caller must go through here rather than writing
	 * `where eventId = ?` — that query silently drops every shared team, which
	 * for most companies is the entire list.
	 */
	async listForEvent(eventId: string, executor: DbExecutor = db): Promise<TeamRow[]> {
		return executor
			.select()
			.from(team)
			.where(or(eq(team.eventId, eventId), isNull(team.eventId)))
			.orderBy(asc(team.sortOrder), asc(team.name))
	},

	/**
	 * Every team, both scopes. Only the employee import needs this: it resolves a
	 * team name typed by HR and has to tell "no such team" apart from "that team
	 * exists but only inside one edition".
	 */
	async listAll(executor: DbExecutor = db): Promise<TeamRow[]> {
		return executor.select().from(team).orderBy(asc(team.name))
	},

	async findById(id: string, executor: DbExecutor = db): Promise<TeamRow | undefined> {
		const rows = await executor.select().from(team).where(eq(team.id, id)).limit(1)
		return rows[0]
	},

	/**
	 * Name collision within the scope the new team would live in. Shared teams
	 * collide with shared teams; an edition's collide with that edition's.
	 *
	 * This mirrors the two partial unique indexes exactly — it exists for the
	 * readable 409, not for correctness, which the indexes own.
	 */
	async findByName(
		eventId: string | null,
		name: string,
		executor: DbExecutor = db,
	): Promise<TeamRow | undefined> {
		const scope = eventId === null ? isNull(team.eventId) : eq(team.eventId, eventId)
		const rows = await executor
			.select()
			.from(team)
			.where(and(scope, eq(team.name, name)))
			.limit(1)
		return rows[0]
	},

	async insert(
		row: { id: string; eventId: string | null; name: string; sortOrder: number },
		executor: DbExecutor = db,
	): Promise<TeamRow> {
		const rows = await executor.insert(team).values(row).returning()
		return rows[0]!
	},

	async update(
		id: string,
		input: UpdateTeamInput,
		executor: DbExecutor = db,
	): Promise<TeamRow | undefined> {
		const rows = await executor.update(team).set(input).where(eq(team.id, id)).returning()
		return rows[0]
	},
}
