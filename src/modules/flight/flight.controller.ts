import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { env } from "../../config/env"
import { ValidationError } from "../../shared/errors"
import { paginationQuerySchema } from "../../shared/pagination"
import {
	createFlightSchema,
	listFlightAssignmentsQuerySchema,
	listFlightsQuerySchema,
	manualAssignFlightSchema,
	setFlightAssignmentLockSchema,
	updateFlightSchema,
} from "./flight.dto"
import { flightService } from "./flight.service"

export const flightController = {
	async list(c: AppContext) {
		const event = requireEventScope(c)
		const query = listFlightsQuerySchema.parse(c.req.query())
		const pagination = paginationQuerySchema.parse(c.req.query())
		return c.json(await flightService.list(event.id, query, pagination))
	},

	async create(c: AppContext) {
		const event = requireEventScope(c)
		const input = createFlightSchema.parse(await c.req.json())
		return c.json(await flightService.create(event.id, input, auditActor(c)), 201)
	},

	async update(c: AppContext) {
		const event = requireEventScope(c)
		const input = updateFlightSchema.parse(await c.req.json())
		return c.json(
			await flightService.update(event.id, requireParam(c, "flightId"), input, auditActor(c)),
		)
	},

	async delete(c: AppContext) {
		const event = requireEventScope(c)
		await flightService.delete(event.id, requireParam(c, "flightId"), auditActor(c))
		return c.body(null, 204)
	},

	async import(c: AppContext) {
		const event = requireEventScope(c)
		const body = await c.req.parseBody()
		const file = body.file
		if (!(file instanceof File)) {
			throw new ValidationError('Thiếu file. Gửi dạng multipart/form-data với trường "file".')
		}
		if (file.size > env.import.maxFileBytes) {
			throw new ValidationError(
				`File vượt quá ${Math.floor(env.import.maxFileBytes / 1024 / 1024)}MB.`,
			)
		}
		return c.json(
			await flightService.importFromExcel(
				event.id,
				file.name,
				Buffer.from(await file.arrayBuffer()),
				auditActor(c),
			),
		)
	},

	async exportExcel(c: AppContext) {
		const event = requireEventScope(c)
		const output = await flightService.exportExcel(event.id, auditActor(c))
		return new Response(new Uint8Array(output), {
			status: 200,
			headers: {
				"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"content-disposition": `attachment; filename="flights-${event.code}.xlsx"`,
			},
		})
	},

	async listAssignments(c: AppContext) {
		const event = requireEventScope(c)
		const query = listFlightAssignmentsQuerySchema.parse(c.req.query())
		const pagination = paginationQuerySchema.parse(c.req.query())
		return c.json(await flightService.listAssignments(event.id, query, pagination))
	},

	async manualAssign(c: AppContext) {
		const event = requireEventScope(c)
		const input = manualAssignFlightSchema.parse(await c.req.json())
		return c.json(await flightService.manualAssign(event.id, input, auditActor(c)))
	},

	async setAssignmentLock(c: AppContext) {
		const event = requireEventScope(c)
		const input = setFlightAssignmentLockSchema.parse(await c.req.json())
		return c.json(
			await flightService.setAssignmentLock(
				event.id,
				requireParam(c, "assignmentId"),
				input,
				auditActor(c),
			),
		)
	},
}
