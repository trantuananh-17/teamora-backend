import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope } from "../../api/types"
import { paginationQuerySchema } from "../../shared/pagination"
import { listAuditLogsQuerySchema } from "./audit.dto"
import { auditService } from "./audit.service"

export const auditController = {
	async list(c: AppContext) {
		const event = requireEventScope(c)
		const query = listAuditLogsQuerySchema.parse(c.req.query())
		const pagination = paginationQuerySchema.parse(c.req.query())
		return c.json(await auditService.list(event.id, query, pagination))
	},

	async exportExcel(c: AppContext) {
		const event = requireEventScope(c)
		const query = listAuditLogsQuerySchema.parse(c.req.query())
		const output = await auditService.exportExcel(event.id, query, auditActor(c))
		return new Response(new Uint8Array(output), {
			status: 200,
			headers: {
				"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"content-disposition": `attachment; filename="audit-log-${event.code}.xlsx"`,
			},
		})
	},
}
