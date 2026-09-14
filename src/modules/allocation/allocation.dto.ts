import { z } from "zod"

export const flightAllocationParamsSchema = z.object({
	teamTogetherWeight: z.number().finite().nonnegative().default(100),
	shiftPreferenceWeight: z.number().finite().nonnegative().default(10),
})

export const createAllocationSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("flight"),
		params: flightAllocationParamsSchema.partial().optional(),
	}),
	z.object({ type: z.literal("vehicle"), params: z.object({}).optional() }),
])

export type CreateAllocationInput = z.infer<typeof createAllocationSchema>

export const listAllocationRunsQuerySchema = z.object({
	type: z.enum(["flight", "vehicle"]).default("flight"),
})

export type ListAllocationRunsQuery = z.infer<typeof listAllocationRunsQuerySchema>
