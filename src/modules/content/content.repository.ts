import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { announcement, registration, scheduleItem } from "../../db/schema"
import type { AnnouncementAudience } from "../../db/schema/journey.schema"

export type ScheduleItemRow = typeof scheduleItem.$inferSelect
export type AnnouncementRow = typeof announcement.$inferSelect

export const contentRepository = {
	listSchedule(eventId: string, executor: DbExecutor = db) {
		return executor
			.select()
			.from(scheduleItem)
			.where(eq(scheduleItem.eventId, eventId))
			.orderBy(asc(scheduleItem.day), asc(scheduleItem.startAt), asc(scheduleItem.sortOrder))
	},
	async findScheduleItem(eventId: string, id: string, executor: DbExecutor = db) {
		return (
			await executor
				.select()
				.from(scheduleItem)
				.where(and(eq(scheduleItem.eventId, eventId), eq(scheduleItem.id, id)))
				.limit(1)
		)[0]
	},
	async insertScheduleItem(row: typeof scheduleItem.$inferInsert, executor: DbExecutor = db) {
		return (await executor.insert(scheduleItem).values(row).returning())[0]!
	},
	async updateScheduleItem(
		eventId: string,
		id: string,
		values: Partial<typeof scheduleItem.$inferInsert>,
		executor: DbExecutor = db,
	) {
		return (
			await executor
				.update(scheduleItem)
				.set({ ...values, updatedAt: new Date() })
				.where(and(eq(scheduleItem.eventId, eventId), eq(scheduleItem.id, id)))
				.returning()
		)[0]
	},
	async deleteScheduleItem(eventId: string, id: string, executor: DbExecutor = db) {
		return (
			(
				await executor
					.delete(scheduleItem)
					.where(and(eq(scheduleItem.eventId, eventId), eq(scheduleItem.id, id)))
			).rowsAffected > 0
		)
	},
	listAnnouncements(eventId: string, executor: DbExecutor = db) {
		return executor
			.select()
			.from(announcement)
			.where(eq(announcement.eventId, eventId))
			.orderBy(desc(announcement.publishedAt), desc(announcement.updatedAt))
	},
	listPublishedAnnouncements(
		eventId: string,
		audiences: AnnouncementAudience[],
		executor: DbExecutor = db,
	) {
		return executor
			.select()
			.from(announcement)
			.where(and(eq(announcement.eventId, eventId), inArray(announcement.audience, audiences)))
			.orderBy(desc(announcement.publishedAt), desc(announcement.updatedAt))
			.then((rows) => rows.filter((row) => row.publishedAt !== null))
	},
	async findAnnouncement(eventId: string, id: string, executor: DbExecutor = db) {
		return (
			await executor
				.select()
				.from(announcement)
				.where(and(eq(announcement.eventId, eventId), eq(announcement.id, id)))
				.limit(1)
		)[0]
	},
	async insertAnnouncement(row: typeof announcement.$inferInsert, executor: DbExecutor = db) {
		return (await executor.insert(announcement).values(row).returning())[0]!
	},
	async updateAnnouncement(
		eventId: string,
		id: string,
		values: Partial<typeof announcement.$inferInsert>,
		executor: DbExecutor = db,
	) {
		return (
			await executor
				.update(announcement)
				.set({ ...values, updatedAt: new Date() })
				.where(and(eq(announcement.eventId, eventId), eq(announcement.id, id)))
				.returning()
		)[0]
	},
	async deleteAnnouncement(eventId: string, id: string, executor: DbExecutor = db) {
		return (
			(
				await executor
					.delete(announcement)
					.where(and(eq(announcement.eventId, eventId), eq(announcement.id, id)))
			).rowsAffected > 0
		)
	},
	async participantRegistrationIds(eventId: string, executor: DbExecutor = db) {
		return (
			await executor
				.select({ id: registration.id })
				.from(registration)
				.where(and(eq(registration.eventId, eventId), eq(registration.participating, true)))
		).map((row) => row.id)
	},
}
