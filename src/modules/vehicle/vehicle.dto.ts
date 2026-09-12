import { z } from "zod"

import { TRANSPORT_LEGS } from "../../db/schema/registration.schema"

const codeSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/)
const fields = {
	code: codeSchema,
	name: z.string().trim().min(1).max(120),
	capacity: z.number().int().min(0).max(10_000),
	leg: z.enum(TRANSPORT_LEGS),
	gatherAt: z.coerce.date(),
	departAt: z.coerce.date(),
	pickupPointId: z.string().min(1).nullable().default(null),
	destination: z.string().trim().min(1).max(200),
	leaderName: z.string().trim().max(120).nullable().default(null),
	leaderPhone: z.string().trim().max(32).nullable().default(null),
	note: z.string().trim().max(500).nullable().default(null),
}

export const createVehicleSchema = z.object(fields).refine((row) => row.departAt >= row.gatherAt, {
	message: "Giờ khởi hành không được trước giờ tập trung.", path: ["departAt"],
})
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>

export const updateVehicleSchema = z.object({
	code: fields.code.optional(), name: fields.name.optional(), capacity: fields.capacity.optional(),
	leg: fields.leg.optional(), gatherAt: fields.gatherAt.optional(), departAt: fields.departAt.optional(),
	pickupPointId: z.string().min(1).nullable().optional(), destination: fields.destination.optional(),
	leaderName: z.string().trim().max(120).nullable().optional(),
	leaderPhone: z.string().trim().max(32).nullable().optional(),
	note: z.string().trim().max(500).nullable().optional(),
}).refine((row) => Object.keys(row).length > 0, "Không có trường nào để cập nhật.")
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>

export const listVehiclesQuerySchema = z.object({
	search: z.string().trim().max(100).optional(),
	leg: z.enum(TRANSPORT_LEGS).optional(),
})
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>

export const listVehicleAssignmentsQuerySchema = z.object({
	search: z.string().trim().max(100).optional(),
	leg: z.enum(TRANSPORT_LEGS).optional(),
})
export type ListVehicleAssignmentsQuery = z.infer<typeof listVehicleAssignmentsQuerySchema>

export const manualAssignVehicleSchema = z.object({
	registrationIds: z.array(z.string().min(1)).min(1).max(1_000),
	vehicleId: z.string().min(1),
	reason: z.string().trim().min(1).max(500),
})
export type ManualAssignVehicleInput = z.infer<typeof manualAssignVehicleSchema>

export const setVehicleAssignmentLockSchema = z.object({
	locked: z.boolean(), reason: z.string().trim().min(1).max(500),
})
export type SetVehicleAssignmentLockInput = z.infer<typeof setVehicleAssignmentLockSchema>
