import { Hono } from "hono"

import { requireOrganizer } from "../../api/middleware/require-organizer"
import { requireAuth } from "../../api/middleware/session"
import type { AppEnv } from "../../api/types"
import { workLocationController } from "./work-location.controller"

/**
 * Company master data, so no `:eventId` and no `eventScope` — this list is the
 * same for every edition (DATA-MODEL.md).
 *
 * Writing is organiser-only. Reading is open to any signed-in account: an
 * employee's registration form has to render the office list, and a list of
 * office names is not personal data.
 */
export const workLocationRoutes = new Hono<AppEnv>()

workLocationRoutes.use("*", requireAuth)

workLocationRoutes.get("/", (c) => workLocationController.list(c))
workLocationRoutes.post("/", requireOrganizer, (c) => workLocationController.create(c))
workLocationRoutes.patch("/:workLocationId", requireOrganizer, (c) =>
  workLocationController.update(c),
)
