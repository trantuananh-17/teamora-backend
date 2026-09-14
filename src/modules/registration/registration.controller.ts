import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam, requireUser } from "../../api/types"
import { paginationQuerySchema } from "../../shared/pagination"
import {
	createRegistrationSchema,
	bulkSetShiftLockedSchema,
	listRegistrationsQuerySchema,
} from "./registration.dto"
import { registrationService } from "./registration.service"

export const registrationController = {
	/**
	 * CBNV tạo hoặc cập nhật đăng ký của chính mình. §4
	 * Yêu cầu: event.status = registration_open
	 */
	async createOrUpdate(c: AppContext) {
		const event = requireEventScope(c)
		const user = requireUser(c)
		const input = createRegistrationSchema.parse(await c.req.json())
		return c.json(await registrationService.createOrUpdate(event.id, user.id, input, auditActor(c)))
	},

	/**
	 * CBNV xem đăng ký của chính mình
	 */
	async getMyRegistration(c: AppContext) {
		const event = requireEventScope(c)
		const user = requireUser(c)
		const registration = await registrationService.getMyRegistration(event.id, user.id)
		return c.json(registration)
	},

	/**
	 * BTC xem danh sách đăng ký (organizer only)
	 */
	async list(c: AppContext) {
		const event = requireEventScope(c)
		const query = listRegistrationsQuerySchema.parse(c.req.query())
		const pagination = paginationQuerySchema.parse(c.req.query())
		return c.json(await registrationService.list(event.id, query, pagination))
	},

	/**
	 * BTC xem chi tiết một đăng ký (organizer only)
	 */
	async getById(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await registrationService.getById(event.id, requireParam(c, "id")))
	},

	async exportCsv(c: AppContext) {
		const event = requireEventScope(c)
		const query = listRegistrationsQuerySchema.parse(c.req.query())
		const csv = await registrationService.exportCsv(event.id, query)
		return c.body(csv, 200, {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="registrations-${event.code}.csv"`,
		})
	},

	/**
	 * BTC bulk set shiftLocked theo bộ lọc. ADR-017
	 * Organizer only
	 */
	async bulkSetShiftLocked(c: AppContext) {
		const event = requireEventScope(c)
		const input = bulkSetShiftLockedSchema.parse(await c.req.json())
		return c.json(await registrationService.bulkSetShiftLocked(event.id, input, auditActor(c)))
	},

	/**
	 * Thống kê đăng ký cho event dashboard (organizer only)
	 */
	async getStats(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await registrationService.getStats(event.id))
	},
}
