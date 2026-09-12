import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { paginationQuerySchema } from "../../shared/pagination"
import { createVehicleSchema, listVehicleAssignmentsQuerySchema, listVehiclesQuerySchema, manualAssignVehicleSchema, setVehicleAssignmentLockSchema, updateVehicleSchema } from "./vehicle.dto"
import { vehicleService } from "./vehicle.service"

export const vehicleController = {
	async list(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await vehicleService.list(event.id, listVehiclesQuerySchema.parse(c.req.query()), paginationQuerySchema.parse(c.req.query())))
	},
	async create(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await vehicleService.create(event.id, createVehicleSchema.parse(await c.req.json()), auditActor(c)), 201)
	},
	async update(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await vehicleService.update(event.id, requireParam(c, "vehicleId"), updateVehicleSchema.parse(await c.req.json()), auditActor(c)))
	},
	async delete(c: AppContext) {
		const event = requireEventScope(c)
		await vehicleService.delete(event.id, requireParam(c, "vehicleId"), auditActor(c))
		return c.body(null, 204)
	},
	async listAssignments(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await vehicleService.listAssignments(event.id, listVehicleAssignmentsQuerySchema.parse(c.req.query()), paginationQuerySchema.parse(c.req.query())))
	},
	async manualAssign(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await vehicleService.manualAssign(event.id, manualAssignVehicleSchema.parse(await c.req.json()), auditActor(c)))
	},
	async setAssignmentLock(c: AppContext) {
		const event = requireEventScope(c)
		return c.json(await vehicleService.setAssignmentLock(event.id, requireParam(c, "assignmentId"), setVehicleAssignmentLockSchema.parse(await c.req.json()), auditActor(c)))
	},
	async exportWorkbook(c: AppContext) {
		const event = requireEventScope(c); const output = await vehicleService.exportWorkbook(event.id, auditActor(c))
		return new Response(new Uint8Array(output), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="vehicles-${event.code}.xlsx"` } })
	},
}
