import { Hono } from "hono"
import { eventScope } from "../../api/middleware/event-scope"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireEventStatus } from "../../api/middleware/require-event-status"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { contentController as controller } from "./content.controller"

export const contentRoutes = new Hono<AppEnv>()
contentRoutes.use("*", requireAuth)
const mutable = requireEventStatus("registration_open", "registration_closed", "allocation_processing", "information_published", "event_started")
contentRoutes.get("/:eventId/schedule", eventScope, requireOrganizer, (c) => controller.listSchedule(c))
contentRoutes.post("/:eventId/schedule", eventScope, requireOrganizer, mutable, (c) => controller.createSchedule(c))
contentRoutes.patch("/:eventId/schedule/:itemId", eventScope, requireOrganizer, mutable, (c) => controller.updateSchedule(c))
contentRoutes.delete("/:eventId/schedule/:itemId", eventScope, requireOrganizer, mutable, (c) => controller.deleteSchedule(c))
contentRoutes.get("/:eventId/announcements", eventScope, requireOrganizer, (c) => controller.listAnnouncements(c))
contentRoutes.post("/:eventId/announcements", eventScope, requireOrganizer, mutable, (c) => controller.createAnnouncement(c))
contentRoutes.patch("/:eventId/announcements/:announcementId", eventScope, requireOrganizer, mutable, (c) => controller.updateAnnouncement(c))
contentRoutes.delete("/:eventId/announcements/:announcementId", eventScope, requireOrganizer, mutable, (c) => controller.deleteAnnouncement(c))
