import type { Context } from "hono"

import type { AuthSession } from "../auth/auth"
import { NotFoundError, UnauthorizedError } from "../shared/errors"
import type { Logger } from "../shared/logger"

export interface AppVariables {
	requestId: string
	logger: Logger
	user?: AuthSession["user"]
	session?: AuthSession["session"]
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
 * A path parameter the route declares. Missing means the handler is mounted on a
 * path that does not carry it — a wiring bug, answered as 404 rather than a 500.
 */
export function requireParam(c: AppContext, name: string): string {
	const value = c.req.param(name)
	if (!value) throw new NotFoundError("Resource")
	return value
}
