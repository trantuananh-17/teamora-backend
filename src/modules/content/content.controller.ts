import type { AppContext } from "../../api/types"
import { auditActor, requireEventScope, requireParam } from "../../api/types"
import { createAnnouncementSchema, createScheduleItemSchema, updateAnnouncementSchema, updateScheduleItemSchema } from "./content.dto"
import { contentService } from "./content.service"

export const contentController = {
	async listSchedule(c: AppContext) { return c.json(await contentService.listSchedule(requireEventScope(c).id)) },
	async createSchedule(c: AppContext) { return c.json(await contentService.createScheduleItem(requireEventScope(c).id, createScheduleItemSchema.parse(await c.req.json()), auditActor(c)), 201) },
	async updateSchedule(c: AppContext) { return c.json(await contentService.updateScheduleItem(requireEventScope(c).id, requireParam(c, "itemId"), updateScheduleItemSchema.parse(await c.req.json()), auditActor(c))) },
	async deleteSchedule(c: AppContext) { await contentService.deleteScheduleItem(requireEventScope(c).id, requireParam(c, "itemId"), auditActor(c)); return c.body(null, 204) },
	async listAnnouncements(c: AppContext) { return c.json(await contentService.listAnnouncements(requireEventScope(c).id)) },
	async createAnnouncement(c: AppContext) { return c.json(await contentService.createAnnouncement(requireEventScope(c).id, createAnnouncementSchema.parse(await c.req.json()), auditActor(c)), 201) },
	async updateAnnouncement(c: AppContext) { return c.json(await contentService.updateAnnouncement(requireEventScope(c).id, requireParam(c, "announcementId"), updateAnnouncementSchema.parse(await c.req.json()), auditActor(c))) },
	async deleteAnnouncement(c: AppContext) { await contentService.deleteAnnouncement(requireEventScope(c).id, requireParam(c, "announcementId"), auditActor(c)); return c.body(null, 204) },
}
