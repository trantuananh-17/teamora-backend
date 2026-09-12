import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { env } from "../../config/env"
import { ValidationError } from "../../shared/errors"
import { createHotelSchema, createRoomSchema, createRoomTypeSchema, listRoomsQuerySchema, updateHotelSchema, updateRoomSchema, updateRoomTypeSchema } from "./accommodation.dto"
import { accommodationService } from "./accommodation.service"

export const accommodationController = {
	async listHotels(c: AppContext) { const event = requireEventScope(c); return c.json({ items: await accommodationService.listHotels(event.id) }) },
	async createHotel(c: AppContext) { const event = requireEventScope(c); return c.json(await accommodationService.createHotel(event.id, createHotelSchema.parse(await c.req.json()), auditActor(c)), 201) },
	async updateHotel(c: AppContext) { const event = requireEventScope(c); return c.json(await accommodationService.updateHotel(event.id, requireParam(c, "hotelId"), updateHotelSchema.parse(await c.req.json()), auditActor(c))) },
	async deleteHotel(c: AppContext) { const event = requireEventScope(c); await accommodationService.deleteHotel(event.id, requireParam(c, "hotelId"), auditActor(c)); return c.body(null, 204) },
	async listRoomTypes(c: AppContext) { const event = requireEventScope(c); return c.json({ items: await accommodationService.listRoomTypes(event.id, c.req.query("hotelId")) }) },
	async createRoomType(c: AppContext) { const event = requireEventScope(c); return c.json(await accommodationService.createRoomType(event.id, requireParam(c, "hotelId"), createRoomTypeSchema.parse(await c.req.json()), auditActor(c)), 201) },
	async updateRoomType(c: AppContext) { const event = requireEventScope(c); return c.json(await accommodationService.updateRoomType(event.id, requireParam(c, "roomTypeId"), updateRoomTypeSchema.parse(await c.req.json()), auditActor(c))) },
	async deleteRoomType(c: AppContext) { const event = requireEventScope(c); await accommodationService.deleteRoomType(event.id, requireParam(c, "roomTypeId"), auditActor(c)); return c.body(null, 204) },
	async listRooms(c: AppContext) { const event = requireEventScope(c); return c.json({ items: await accommodationService.listRooms(event.id, listRoomsQuerySchema.parse(c.req.query())) }) },
	async createRoom(c: AppContext) { const event = requireEventScope(c); return c.json(await accommodationService.createRoom(event.id, requireParam(c, "hotelId"), createRoomSchema.parse(await c.req.json()), auditActor(c)), 201) },
	async updateRoom(c: AppContext) { const event = requireEventScope(c); return c.json(await accommodationService.updateRoom(event.id, requireParam(c, "roomId"), updateRoomSchema.parse(await c.req.json()), auditActor(c))) },
	async deleteRoom(c: AppContext) { const event = requireEventScope(c); await accommodationService.deleteRoom(event.id, requireParam(c, "roomId"), auditActor(c)); return c.body(null, 204) },
	async listAssignments(c: AppContext) { const event = requireEventScope(c); return c.json({ items: await accommodationService.listAssignments(event.id) }) },
	async importAssignments(c: AppContext) {
		const event = requireEventScope(c); const file = (await c.req.parseBody()).file
		if (!(file instanceof File)) throw new ValidationError("Thiếu file .xlsx trong trường file.")
		if (file.size > env.import.maxFileBytes) throw new ValidationError("File vượt quá giới hạn cho phép.")
		return c.json(await accommodationService.importAssignments(event.id, file.name, Buffer.from(await file.arrayBuffer()), auditActor(c)))
	},
	async exportAssignments(c: AppContext) {
		const event = requireEventScope(c); const output = await accommodationService.exportAssignments(event.id)
		return new Response(new Uint8Array(output), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="room-assignments-${event.code}.xlsx"` } })
	},
}
