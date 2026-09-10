import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer, requireSuperAdmin } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { eventController } from "./event.controller"

/**
 * This file is the permission map for editions. Reading it must answer who can
 * call each line.
 *
 * Every route here is organiser-or-above. Employees never address an edition by
 * id: their own screens derive the current edition from their registration, and
 * are added in S2.
 *
 * There is no DELETE. `audit_log.eventId` is `onDelete: "restrict"` (ADR-010)
 * and creating an edition writes an audit row, so a delete would be refused by
 * the database from the first second the edition exists. An edition ends by
 * reaching `event_completed`, not by disappearing along with the record of what
 * was done to it.
 */
export const eventRoutes = new Hono<AppEnv>()

eventRoutes.use("*", requireAuth)

eventRoutes.get("/", requireOrganizer, (c) => eventController.list(c))
eventRoutes.post("/", requireOrganizer, (c) => eventController.create(c))

eventRoutes.get("/:eventId", requireOrganizer, eventScope, (c) => eventController.get(c))
eventRoutes.patch("/:eventId", requireOrganizer, eventScope, (c) => eventController.update(c))

// §12 forward, one step at a time. The service refuses a skip and refuses a
// move backwards even though the status body could name one.
eventRoutes.post("/:eventId/status/advance", requireOrganizer, eventScope, (c) =>
	eventController.advanceStatus(c),
)

// Backwards. Reopening registration after flights are allocated is the kind of
// thing one person should be able to do and everyone should be able to see
// afterwards, so it is `super_admin`, it demands a reason, and it is audited.
eventRoutes.post("/:eventId/status/revert", requireSuperAdmin, eventScope, (c) =>
	eventController.revertStatus(c),
)
