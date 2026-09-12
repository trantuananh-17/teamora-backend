import { Hono } from "hono"
import { eventScope } from "../../api/middleware/event-scope"
import { requireEventStatus } from "../../api/middleware/require-event-status"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { vehicleController } from "./vehicle.controller"

export const vehicleRoutes = new Hono<AppEnv>()
vehicleRoutes.use("*", requireAuth)
vehicleRoutes.get("/:eventId/vehicles", eventScope, requireOrganizer, (c) => vehicleController.list(c))
vehicleRoutes.get("/:eventId/vehicles/assignments", eventScope, requireOrganizer, (c) => vehicleController.listAssignments(c))
vehicleRoutes.get("/:eventId/vehicles/export", eventScope, requireOrganizer, (c) => vehicleController.exportWorkbook(c))
const configurable = requireEventStatus("registration_open", "registration_closed", "allocation_processing", "information_published", "event_started")
const allocating = requireEventStatus("registration_closed", "allocation_processing", "information_published", "event_started")
vehicleRoutes.post("/:eventId/vehicles/assignments/manual", eventScope, requireOrganizer, allocating, (c) => vehicleController.manualAssign(c))
vehicleRoutes.patch("/:eventId/vehicles/assignments/:assignmentId/lock", eventScope, requireOrganizer, allocating, (c) => vehicleController.setAssignmentLock(c))
vehicleRoutes.post("/:eventId/vehicles", eventScope, requireOrganizer, configurable, (c) => vehicleController.create(c))
vehicleRoutes.patch("/:eventId/vehicles/:vehicleId", eventScope, requireOrganizer, configurable, (c) => vehicleController.update(c))
vehicleRoutes.delete("/:eventId/vehicles/:vehicleId", eventScope, requireOrganizer, configurable, (c) => vehicleController.delete(c))
