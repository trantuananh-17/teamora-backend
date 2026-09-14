import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { pickupPointController } from "./pickup-point.controller"

/**
 * Mounted at `/v1/events`. Per edition, unlike `work_location`: the meeting
 * points change when the hotel and the schedule change.
 *
 * Reading is open to any signed-in account — §4.5 has employees picking their
 * pickup point on the registration form. Writing is organiser-only.
 */
export const pickupPointRoutes = new Hono<AppEnv>()

pickupPointRoutes.use("*", requireAuth)

pickupPointRoutes.get("/:eventId/pickup-points", eventScope, (c) => pickupPointController.list(c))
pickupPointRoutes.post("/:eventId/pickup-points", requireOrganizer, eventScope, (c) =>
	pickupPointController.create(c),
)
pickupPointRoutes.patch(
	"/:eventId/pickup-points/:pickupPointId",
	requireOrganizer,
	eventScope,
	(c) => pickupPointController.update(c),
)
