import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { teamController } from "./team.controller"

/**
 * Mounted at `/v1/events`, so every path here carries `:eventId` and every
 * handler runs behind `eventScope` (ADR-004).
 *
 * Reading is open to any signed-in account: §4.2 has employees choosing their
 * team from this list, and team names are not personal data. Writing is
 * organiser-only.
 *
 * The service refuses to edit a shared team through an edition's URL. A shared
 * team is reachable from every edition, so allowing it would let an organiser
 * rename a team every other edition uses while believing the change was local.
 */
export const teamRoutes = new Hono<AppEnv>()

teamRoutes.use("*", requireAuth)

teamRoutes.get("/:eventId/teams", eventScope, (c) => teamController.list(c))
teamRoutes.post("/:eventId/teams", requireOrganizer, eventScope, (c) => teamController.create(c))
teamRoutes.patch("/:eventId/teams/:teamId", requireOrganizer, eventScope, (c) =>
	teamController.update(c),
)
