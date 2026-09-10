import { z } from "zod"

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /**
   * True puts the team outside any one edition (`team.eventId = null`), which is
   * what most departments are — they exist every year. False scopes it to the
   * edition in the path, for a one-off working group.
   */
  shared: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
})

export type CreateTeamInput = z.infer<typeof createTeamSchema>

/** No delete: `registration.teamId` will point here from S2 onwards. */
export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Không có trường nào để cập nhật.")

export type UpdateTeamInput = z.infer<typeof updateTeamSchema>
