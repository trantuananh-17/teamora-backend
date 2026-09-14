import { z } from "zod"

export const createHotelSchema = z.object({
	name: z.string().trim().min(1).max(160),
	address: z.string().trim().min(1).max(300),
})
export const updateHotelSchema = createHotelSchema
	.partial()
	.refine((row) => Object.keys(row).length > 0)
export const createRoomTypeSchema = z.object({
	name: z.string().trim().min(1).max(100),
	capacity: z.number().int().min(1).max(100),
})
export const updateRoomTypeSchema = createRoomTypeSchema
	.partial()
	.refine((row) => Object.keys(row).length > 0)
export const createRoomSchema = z.object({
	roomTypeId: z.string().min(1),
	code: z.string().trim().min(1).max(40),
	capacity: z.number().int().min(1).max(100),
})
export const updateRoomSchema = createRoomSchema
	.partial()
	.refine((row) => Object.keys(row).length > 0)
export const listRoomsQuerySchema = z.object({
	hotelId: z.string().min(1).optional(),
	search: z.string().trim().max(100).optional(),
})
export type CreateHotelInput = z.infer<typeof createHotelSchema>
export type UpdateHotelInput = z.infer<typeof updateHotelSchema>
export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>
export type CreateRoomInput = z.infer<typeof createRoomSchema>
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>
