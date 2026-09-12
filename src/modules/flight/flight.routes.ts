import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireEventStatus } from "../../api/middleware/require-event-status"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { flightController } from "./flight.controller"

export const flightRoutes = new Hono<AppEnv>()

flightRoutes.use("*", requireAuth)

flightRoutes.get("/:eventId/flights", eventScope, requireOrganizer, (c) => flightController.list(c))
flightRoutes.get("/:eventId/flights/export", eventScope, requireOrganizer, (c) =>
	flightController.exportExcel(c),
)
flightRoutes.get("/:eventId/flights/assignments", eventScope, requireOrganizer, (c) =>
	flightController.listAssignments(c),
)

const configurableStatus = requireEventStatus(
	"registration_open",
	"registration_closed",
	"allocation_processing",
	"information_published",
	"event_started",
)
const allocationStatus = requireEventStatus("registration_closed", "allocation_processing", "information_published", "event_started")

flightRoutes.post(
	"/:eventId/flights",
	eventScope,
	requireOrganizer,
	configurableStatus,
	(c) => flightController.create(c),
)
flightRoutes.post(
	"/:eventId/flights/import",
	eventScope,
	requireOrganizer,
	configurableStatus,
	(c) => flightController.import(c),
)
flightRoutes.patch(
	"/:eventId/flights/assignments/:assignmentId/lock",
	eventScope,
	requireOrganizer,
	allocationStatus,
	(c) => flightController.setAssignmentLock(c),
)
flightRoutes.post(
	"/:eventId/flights/assignments/manual",
	eventScope,
	requireOrganizer,
	allocationStatus,
	(c) => flightController.manualAssign(c),
)
flightRoutes.patch(
	"/:eventId/flights/:flightId",
	eventScope,
	requireOrganizer,
	configurableStatus,
	(c) => flightController.update(c),
)
flightRoutes.delete(
	"/:eventId/flights/:flightId",
	eventScope,
	requireOrganizer,
	configurableStatus,
	(c) => flightController.delete(c),
)
