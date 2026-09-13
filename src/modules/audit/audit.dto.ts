import { z } from "zod"

const optionalFilter = z.string().trim().min(1).max(120).optional()

export const listAuditLogsQuerySchema = z
	.object({
		search: optionalFilter,
		entity: optionalFilter,
		action: optionalFilter,
		from: z.coerce.date().optional(),
		to: z.coerce.date().optional(),
	})
	.refine((value) => !value.from || !value.to || value.to >= value.from, {
		message: "Thời điểm kết thúc phải sau thời điểm bắt đầu.",
		path: ["to"],
	})

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>
