import { Hono } from "hono"

import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { employeeController } from "./employee.controller"

/**
 * Company master data, so no `:eventId` — a person is the same person across
 * editions.
 *
 * **Organiser-only, both reading and writing.** Unlike teams and work locations,
 * this list is the company's staff: names, work emails, employee codes, phone
 * numbers. `.claude/rules/security.md` is explicit that a leak here is not a
 * technical incident.
 */
export const employeeRoutes = new Hono<AppEnv>()

employeeRoutes.use("*", requireAuth, requireOrganizer)

employeeRoutes.get("/", (c) => employeeController.list(c))
employeeRoutes.post("/import", (c) => employeeController.import(c))
