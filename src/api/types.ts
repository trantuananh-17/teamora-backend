import type { Context } from "hono"

import type { AuthSession } from "../auth/auth"
import type { EventRow } from "../modules/event/event.repository"
import { NotFoundError, UnauthorizedError } from "../shared/errors"
import type { Logger } from "../shared/logger"

export interface AppVariables {
	requestId: string
	logger: Logger
	user?: AuthSession["user"]
	session?: AuthSession["session"]
	/** Set by `eventScope` once `:eventId` has been resolved to a real row. */
	event?: EventRow
}

export type AppEnv = { Variables: AppVariables }
export type AppContext = Context<AppEnv>

/**
 * Accessors, not casts. A handler behind `requireAuth` still has to ask for the
 * user through here, so a route that forgets the middleware fails closed with a
 * 401 instead of reading `undefined.id`.
 */
export function requireUser(c: AppContext): AuthSession["user"] {
	const user = c.get("user")
	if (!user) throw new UnauthorizedError()
	return user
}

/**
 * The edition this request is scoped to. A handler that reaches for this without
 * `eventScope` above it gets a 404 rather than reading `undefined.status` —
 * which matters because `event.status` is an authorization input (ADR-005), and
 * a missing one must never read as "allowed".
 */
export function requireEventScope(c: AppContext): EventRow {
	const event = c.get("event")
	if (!event) throw new NotFoundError("Event")
	return event
}

/**
 * A path parameter the route declares. Missing means the handler is mounted on a
 * path that does not carry it — a wiring bug, answered as 404 rather than a 500.
 */
export function requireParam(c: AppContext, name: string): string {
	const value = c.req.param(name)
	if (!value) throw new NotFoundError("Resource")
	return value
}
