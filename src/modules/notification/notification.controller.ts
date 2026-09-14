import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { paginationQuerySchema } from "../../shared/pagination"
import { listNotificationsQuerySchema } from "./notification.dto"
import { notificationService } from "./notification.service"

export const notificationController = {
	async list(c: AppContext) {
		const event = requireEventScope(c)
		const query = listNotificationsQuerySchema.parse(c.req.query())
		const pagination = paginationQuerySchema.parse(c.req.query())
		return c.json(await notificationService.list(event.id, query, pagination))
	},

	async retry(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await notificationService.retry(event.id, requireParam(c, "id"), auditActor(c)))
	},
}
