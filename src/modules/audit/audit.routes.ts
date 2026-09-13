import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { auditController } from "./audit.controller"

export const auditRoutes = new Hono<AppEnv>()

auditRoutes.use("*", requireAuth)
auditRoutes.get("/:eventId/audit-logs", eventScope, requireOrganizer, (c) =>
	auditController.list(c),
)
auditRoutes.get("/:eventId/audit-logs/export", eventScope, requireOrganizer, (c) =>
	auditController.exportExcel(c),
)
