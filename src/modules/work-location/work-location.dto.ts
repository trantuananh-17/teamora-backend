import { z } from "zod"

export const createWorkLocationSchema = z.object({
	name: z.string().trim().min(1).max(120),
	sortOrder: z.number().int().min(0).default(0),
})

export type CreateWorkLocationInput = z.infer<typeof createWorkLocationSchema>

/**
 * No delete anywhere in master data. `employee_profile.workLocationId` and
 * `pickup_point.workLocationId` are both `onDelete: "restrict"`, so a location
 * anybody has ever been assigned to cannot be removed — and one nobody uses is
 * not worth an endpoint. `active: false` is how a closed office leaves the form
 * while the people who worked there keep pointing at it.
 */
export const updateWorkLocationSchema = z
	.object({
		name: z.string().trim().min(1).max(120).optional(),
		active: z.boolean().optional(),
		sortOrder: z.number().int().min(0).optional(),
	})
	.refine((input) => Object.keys(input).length > 0, "Không có trường nào để cập nhật.")

export type UpdateWorkLocationInput = z.infer<typeof updateWorkLocationSchema>
