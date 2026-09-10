import { createMiddleware } from "hono/factory"

import { ForbiddenError } from "../../shared/errors"
import { requireUser } from "../types"
import type { AppEnv } from "../types"

/** REQUIREMENTS §2. `super_admin` is an organiser plus everything else. */
const ORGANIZER_ROLES = new Set(["organizer", "super_admin"])
const SUPER_ADMIN_ROLES = new Set(["super_admin"])

/**
 * Who may manage an edition's data. Mounted on every route that writes
 * organiser-owned data, and on the read routes that show other people's
 * personal details.
 *
 * `requireUser` rather than `c.get("user")`: a route that forgets the session
 * middleware fails closed with a 401 instead of reading `undefined.role`.
 */
export const requireOrganizer = createMiddleware<AppEnv>(async (c, next) => {
	const user = requireUser(c)
	if (!ORGANIZER_ROLES.has(user.role ?? "")) throw new ForbiddenError()
	await next()
})

/**
 * Reserved for the operations §12 puts beyond an organiser: reverting an
 * edition's status, and deleting an edition outright.
 */
export const requireSuperAdmin = createMiddleware<AppEnv>(async (c, next) => {
	const user = requireUser(c)
	if (!SUPER_ADMIN_ROLES.has(user.role ?? "")) throw new ForbiddenError()
	await next()
})
