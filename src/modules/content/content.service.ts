import { db } from "../../db/client"
import { ConflictError, NotFoundError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import { notificationService } from "../notification/notification.service"
import type {
	CreateAnnouncementInput,
	CreateScheduleItemInput,
	UpdateAnnouncementInput,
	UpdateScheduleItemInput,
} from "./content.dto"
import { contentRepository } from "./content.repository"

async function scheduleGeneralChange(
	eventId: string,
	kind: "schedule" | "announcement",
	executor: Parameters<typeof contentRepository.participantRegistrationIds>[1],
) {
	const registrationIds = await contentRepository.participantRegistrationIds(eventId, executor)
	await notificationService.scheduleChangesIfPublished(eventId, registrationIds, kind, executor)
}

export const contentService = {
	listSchedule: contentRepository.listSchedule,
	listAnnouncements: contentRepository.listAnnouncements,
	async createScheduleItem(eventId: string, input: CreateScheduleItemInput, actor: AuditActor) {
		return db.transaction(async (tx) => {
			const row = await contentRepository.insertScheduleItem(
				{
					id: newId(),
					eventId,
					...input,
					description: input.description ?? null,
					location: input.location ?? null,
				},
				tx,
			)
			await auditService.record(
				{ eventId, actor, entity: "schedule_item", entityId: row.id, action: "create", after: row },
				tx,
			)
			await scheduleGeneralChange(eventId, "schedule", tx)
			return row
		})
	},
	async updateScheduleItem(
		eventId: string,
		id: string,
		input: UpdateScheduleItemInput,
		actor: AuditActor,
	) {
		const before = await contentRepository.findScheduleItem(eventId, id)
		if (!before) throw new NotFoundError("Schedule item")
		const startAt = input.startAt ?? before.startAt
		const endAt = input.endAt ?? before.endAt
		if (endAt <= startAt) throw new ConflictError("Giờ kết thúc phải sau giờ bắt đầu.")
		const after = await db.transaction(async (tx) => {
			const row = await contentRepository.updateScheduleItem(eventId, id, input, tx)
			await auditService.record(
				{
					eventId,
					actor,
					entity: "schedule_item",
					entityId: id,
					action: "update",
					before,
					after: row,
				},
				tx,
			)
			await scheduleGeneralChange(eventId, "schedule", tx)
			return row!
		})
		return after
	},
	async deleteScheduleItem(eventId: string, id: string, actor: AuditActor) {
		const before = await contentRepository.findScheduleItem(eventId, id)
		if (!before) throw new NotFoundError("Schedule item")
		await db.transaction(async (tx) => {
			await contentRepository.deleteScheduleItem(eventId, id, tx)
			await auditService.record(
				{ eventId, actor, entity: "schedule_item", entityId: id, action: "delete", before },
				tx,
			)
			await scheduleGeneralChange(eventId, "schedule", tx)
		})
	},
	async createAnnouncement(eventId: string, input: CreateAnnouncementInput, actor: AuditActor) {
		const row = await db.transaction(async (tx) => {
			const created = await contentRepository.insertAnnouncement(
				{
					id: newId(),
					eventId,
					title: input.title,
					body: input.body,
					audience: input.audience,
					publishedAt: input.published ? new Date() : null,
				},
				tx,
			)
			await auditService.record(
				{
					eventId,
					actor,
					entity: "announcement",
					entityId: created.id,
					action: "create",
					after: created,
				},
				tx,
			)
			if (created.publishedAt) await scheduleGeneralChange(eventId, "announcement", tx)
			return created
		})
		return row
	},
	async updateAnnouncement(
		eventId: string,
		id: string,
		input: UpdateAnnouncementInput,
		actor: AuditActor,
	) {
		const before = await contentRepository.findAnnouncement(eventId, id)
		if (!before) throw new NotFoundError("Announcement")
		const values = {
			...input,
			publishedAt:
				input.published === undefined
					? undefined
					: input.published
						? (before.publishedAt ?? new Date())
						: null,
		} as Record<string, unknown>
		delete values.published
		const after = await db.transaction(async (tx) => {
			const row = await contentRepository.updateAnnouncement(eventId, id, values, tx)
			await auditService.record(
				{
					eventId,
					actor,
					entity: "announcement",
					entityId: id,
					action: "update",
					before,
					after: row,
				},
				tx,
			)
			if (before.publishedAt || row?.publishedAt)
				await scheduleGeneralChange(eventId, "announcement", tx)
			return row!
		})
		return after
	},
	async deleteAnnouncement(eventId: string, id: string, actor: AuditActor) {
		const before = await contentRepository.findAnnouncement(eventId, id)
		if (!before) throw new NotFoundError("Announcement")
		await db.transaction(async (tx) => {
			await contentRepository.deleteAnnouncement(eventId, id, tx)
			await auditService.record(
				{ eventId, actor, entity: "announcement", entityId: id, action: "delete", before },
				tx,
			)
			if (before.publishedAt) await scheduleGeneralChange(eventId, "announcement", tx)
		})
	},
}
