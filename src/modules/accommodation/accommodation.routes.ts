import { Hono } from "hono"
import { eventScope } from "../../api/middleware/event-scope"
import { requireEventStatus } from "../../api/middleware/require-event-status"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { accommodationController as controller } from "./accommodation.controller"

export const accommodationRoutes = new Hono<AppEnv>()
accommodationRoutes.use("*", requireAuth)
accommodationRoutes.get("/:eventId/hotels", eventScope, requireOrganizer, (c) => controller.listHotels(c))
accommodationRoutes.get("/:eventId/room-types", eventScope, requireOrganizer, (c) => controller.listRoomTypes(c))
accommodationRoutes.get("/:eventId/rooms", eventScope, requireOrganizer, (c) => controller.listRooms(c))
accommodationRoutes.get("/:eventId/room-assignments", eventScope, requireOrganizer, (c) => controller.listAssignments(c))
accommodationRoutes.get("/:eventId/room-assignments/export", eventScope, requireOrganizer, (c) => controller.exportAssignments(c))
const configurable = requireEventStatus("registration_open", "registration_closed", "allocation_processing")
accommodationRoutes.post("/:eventId/hotels", eventScope, requireOrganizer, configurable, (c) => controller.createHotel(c))
accommodationRoutes.patch("/:eventId/hotels/:hotelId", eventScope, requireOrganizer, configurable, (c) => controller.updateHotel(c))
accommodationRoutes.delete("/:eventId/hotels/:hotelId", eventScope, requireOrganizer, configurable, (c) => controller.deleteHotel(c))
accommodationRoutes.post("/:eventId/hotels/:hotelId/room-types", eventScope, requireOrganizer, configurable, (c) => controller.createRoomType(c))
accommodationRoutes.post("/:eventId/hotels/:hotelId/rooms", eventScope, requireOrganizer, configurable, (c) => controller.createRoom(c))
accommodationRoutes.patch("/:eventId/room-types/:roomTypeId", eventScope, requireOrganizer, configurable, (c) => controller.updateRoomType(c))
accommodationRoutes.delete("/:eventId/room-types/:roomTypeId", eventScope, requireOrganizer, configurable, (c) => controller.deleteRoomType(c))
accommodationRoutes.patch("/:eventId/rooms/:roomId", eventScope, requireOrganizer, configurable, (c) => controller.updateRoom(c))
accommodationRoutes.delete("/:eventId/rooms/:roomId", eventScope, requireOrganizer, configurable, (c) => controller.deleteRoom(c))
accommodationRoutes.post("/:eventId/room-assignments/import", eventScope, requireOrganizer, configurable, (c) => controller.importAssignments(c))
