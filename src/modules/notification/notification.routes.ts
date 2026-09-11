import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { notificationController } from "./notification.controller"

/** BTC-only surface for inspecting delivery and retrying a failed email. */
export const notificationRoutes = new Hono<AppEnv>()

notificationRoutes.use("*", requireAuth)
notificationRoutes.get("/:eventId/notifications", eventScope, requireOrganizer, (c) =>
  notificationController.list(c),
)
notificationRoutes.post("/:eventId/notifications/:id/retry", eventScope, requireOrganizer, (c) =>
  notificationController.retry(c),
)
