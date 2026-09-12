import { z } from "zod"

import { ALLOCATION_FLAGS, FLIGHT_DIRECTIONS, FLIGHT_SHIFTS } from "../../db/schema/flight.schema"

const flightCodeSchema = z
	.string()
	.trim()
	.min(1)
	.max(32)
	.regex(/^[A-Za-z0-9_-]+$/, "Mã chuyến chỉ gồm chữ, số, gạch ngang và gạch dưới.")

const flightFields = {
	code: flightCodeSchema,
	direction: z.enum(FLIGHT_DIRECTIONS),
	departAt: z.coerce.date(),
	arriveAt: z.coerce.date(),
	fromAirport: z.string().trim().min(1).max(120),
	toAirport: z.string().trim().min(1).max(120),
	capacity: z.number().int().min(0).max(10_000),
	shift: z.enum(FLIGHT_SHIFTS).nullable().default(null),
	note: z.string().trim().max(500).nullable().default(null),
}

export const createFlightSchema = z
	.object(flightFields)
	.refine((input) => input.arriveAt > input.departAt, {
		message: "Giờ đến phải sau giờ khởi hành.",
		path: ["arriveAt"],
	})

export type CreateFlightInput = z.infer<typeof createFlightSchema>

export const updateFlightSchema = z
	.object({
		code: flightFields.code.optional(),
		direction: flightFields.direction.optional(),
		departAt: flightFields.departAt.optional(),
		arriveAt: flightFields.arriveAt.optional(),
		fromAirport: flightFields.fromAirport.optional(),
		toAirport: flightFields.toAirport.optional(),
		capacity: flightFields.capacity.optional(),
		shift: z.enum(FLIGHT_SHIFTS).nullable().optional(),
		note: z.string().trim().max(500).nullable().optional(),
	})
	.refine((input) => Object.keys(input).length > 0, "Không có trường nào để cập nhật.")

export type UpdateFlightInput = z.infer<typeof updateFlightSchema>

export const listFlightsQuerySchema = z.object({
	search: z.string().trim().max(100).optional(),
	direction: z.enum(FLIGHT_DIRECTIONS).optional(),
	shift: z.enum(FLIGHT_SHIFTS).optional(),
})

export type ListFlightsQuery = z.infer<typeof listFlightsQuerySchema>

export const listFlightAssignmentsQuerySchema = z.object({
	search: z.string().trim().max(100).optional(),
	teamId: z.string().min(1).optional(),
	flag: z.enum(ALLOCATION_FLAGS).optional(),
})

export type ListFlightAssignmentsQuery = z.infer<typeof listFlightAssignmentsQuerySchema>

export const manualAssignFlightSchema = z
	.object({
		registrationIds: z.array(z.string().min(1)).min(1).max(1_000).optional(),
		teamId: z.string().min(1).optional(),
		flightId: z.string().min(1),
		reason: z.string().trim().min(1).max(500),
	})
	.refine((input) => Boolean(input.registrationIds) !== Boolean(input.teamId), {
		message: "Chọn danh sách CBNV hoặc một Team, không chọn đồng thời cả hai.",
		path: ["registrationIds"],
	})

export type ManualAssignFlightInput = z.infer<typeof manualAssignFlightSchema>

export const setFlightAssignmentLockSchema = z.object({
	locked: z.boolean(),
	reason: z.string().trim().min(1).max(500),
})

export type SetFlightAssignmentLockInput = z.infer<typeof setFlightAssignmentLockSchema>
