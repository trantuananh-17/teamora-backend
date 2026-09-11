import { Hono } from "hono"

import { eventScope } from "../../api/middleware/event-scope"
import { requireEventStatus } from "../../api/middleware/require-event-status"
import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { registrationController } from "./registration.controller"

/**
 * §4 - Đăng ký Team Building
 *
 * Permission map:
 * - CBNV: PUT /v1/events/:eventId/registrations/me, GET /v1/events/:eventId/registrations/me
 *   Chỉ khi event.status = registration_open
 * - Organizer: GET list, GET by id, POST bulk-set-shift-locked, GET stats
 */
export const registrationRoutes = new Hono<AppEnv>()

registrationRoutes.use("*", requireAuth)

// CBNV tạo/cập nhật đăng ký của chính mình. Yêu cầu: event.status = registration_open
registrationRoutes.put(
  "/:eventId/registrations/me",
  eventScope,
  requireEventStatus("registration_open"),
  (c) => registrationController.createOrUpdate(c),
)

// CBNV xem đăng ký của chính mình. Không yêu cầu trạng thái - employee luôn đọc được đăng ký mình
registrationRoutes.get("/:eventId/registrations/me", eventScope, (c) =>
  registrationController.getMyRegistration(c),
)

// BTC xem danh sách đăng ký (organizer only)
registrationRoutes.get("/:eventId/registrations", eventScope, requireOrganizer, (c) =>
  registrationController.list(c),
)

registrationRoutes.get("/:eventId/registrations/export", eventScope, requireOrganizer, (c) =>
  registrationController.exportCsv(c),
)

// BTC xem chi tiết một đăng ký (organizer only)
registrationRoutes.get("/:eventId/registrations/:id", eventScope, requireOrganizer, (c) =>
  registrationController.getById(c),
)

// BTC bulk set shiftLocked (organizer only). ADR-017
registrationRoutes.post(
  "/:eventId/registrations/bulk-set-shift-locked",
  eventScope,
  requireOrganizer,
  (c) => registrationController.bulkSetShiftLocked(c),
)

// Thống kê đăng ký (organizer only)
registrationRoutes.get("/:eventId/registrations-stats", eventScope, requireOrganizer, (c) =>
  registrationController.getStats(c),
)
