import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { createPickupPointSchema, updatePickupPointSchema } from "./pickup-point.dto"
import { pickupPointService } from "./pickup-point.service"

export const pickupPointController = {
  async list(c: AppContext) {
    const event = requireEventScope(c)
    return c.json({ items: await pickupPointService.listForEvent(event.id) })
  },

  async create(c: AppContext) {
    const event = requireEventScope(c)
    const input = createPickupPointSchema.parse(await c.req.json())
    return c.json(await pickupPointService.create(event.id, input, auditActor(c)), 201)
  },

  async update(c: AppContext) {
    const event = requireEventScope(c)
    const id = requireParam(c, "pickupPointId")
    const input = updatePickupPointSchema.parse(await c.req.json())
    return c.json(await pickupPointService.update(event.id, id, input, auditActor(c)))
  },
}
