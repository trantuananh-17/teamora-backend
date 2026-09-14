import { z } from "zod"

const date = z.coerce.date()

const scheduleItemFields = z.object({
	day: z.number().int().min(1).max(30),
	startAt: date,
	endAt: date,
	title: z.string().trim().min(1).max(180),
	description: z.string().trim().max(2000).nullable().optional(),
	location: z.string().trim().max(300).nullable().optional(),
	sortOrder: z.number().int().min(0).max(10000).default(0),
})

export const createScheduleItemSchema = scheduleItemFields.refine(
	(value) => value.endAt > value.startAt,
	{ message: "Giờ kết thúc phải sau giờ bắt đầu.", path: ["endAt"] },
)

export const updateScheduleItemSchema = scheduleItemFields
	.partial()
	.refine((value) => Object.keys(value).length > 0)

export const createAnnouncementSchema = z.object({
	title: z.string().trim().min(1).max(180),
	body: z.string().trim().min(1).max(5000),
	audience: z.enum(["all", "participants", "organizers"]).default("participants"),
	published: z.boolean().default(false),
})
export const updateAnnouncementSchema = z
	.object({
		title: z.string().trim().min(1).max(180).optional(),
		body: z.string().trim().min(1).max(5000).optional(),
		audience: z.enum(["all", "participants", "organizers"]).optional(),
		published: z.boolean().optional(),
	})
	.refine((value) => Object.keys(value).length > 0)

export type CreateScheduleItemInput = z.infer<typeof createScheduleItemSchema>
export type UpdateScheduleItemInput = z.infer<typeof updateScheduleItemSchema>
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>
