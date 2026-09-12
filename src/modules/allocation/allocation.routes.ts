import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireEventStatus } from "../../api/middleware/require-event-status"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { allocationController } from "./allocation.controller"

export const allocationRoutes = new Hono<AppEnv>()

allocationRoutes.use("*", requireAuth)

allocationRoutes.get("/:eventId/allocations", eventScope, requireOrganizer, (c) =>
	allocationController.list(c),
)
allocationRoutes.post(
	"/:eventId/allocations",
	eventScope,
	requireOrganizer,
	requireEventStatus("registration_closed", "allocation_processing"),
	(c) => allocationController.preview(c),
)
allocationRoutes.get("/:eventId/allocations/:runId", eventScope, requireOrganizer, (c) =>
	allocationController.get(c),
)
allocationRoutes.post(
	"/:eventId/allocations/:runId/commit",
	eventScope,
	requireOrganizer,
	requireEventStatus("registration_closed", "allocation_processing"),
	(c) => allocationController.commit(c),
)
allocationRoutes.post(
	"/:eventId/allocations/:runId/discard",
	eventScope,
	requireOrganizer,
	requireEventStatus("registration_closed", "allocation_processing"),
	(c) => allocationController.discard(c),
)
