import { Hono } from "hono"
import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { journeyController } from "./journey.controller"

export const journeyRoutes = new Hono<AppEnv>()
journeyRoutes.use("*", requireAuth)
journeyRoutes.get("/me/journey", (c) => journeyController.mine(c))

export const dashboardRoutes = new Hono<AppEnv>()
dashboardRoutes.use("*", requireAuth)
dashboardRoutes.get("/:eventId/dashboard", eventScope, requireOrganizer, (c) => journeyController.dashboard(c))
