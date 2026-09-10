import { z } from "zod"

export const createPickupPointSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(400).nullish(),
  /**
   * Which office's people see this point on their form. Null means everyone —
   * the airport, say. §4.5.
   */
  workLocationId: z.string().min(1).nullish(),
  sortOrder: z.number().int().min(0).default(0),
})

export type CreatePickupPointInput = z.infer<typeof createPickupPointSchema>

/** No delete: `registration_transport_need.pickupPointId` points here from S2. */
export const updatePickupPointSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().max(400).nullish(),
    workLocationId: z.string().min(1).nullish(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Không có trường nào để cập nhật.")

export type UpdatePickupPointInput = z.infer<typeof updatePickupPointSchema>
