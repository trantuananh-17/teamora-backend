import { z } from "zod"

export const listNotificationsQuerySchema = z.object({
	status: z.enum(["pending", "sent", "failed"]).optional(),
})

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>
