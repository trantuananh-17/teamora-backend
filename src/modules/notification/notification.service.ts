import { db, type DbExecutor } from "../../db/client"
import { notification } from "../../db/schema"
import { event } from "../../db/schema"
import { eq } from "drizzle-orm"
import { newId } from "../../shared/id"
import type { Page, PaginationQuery } from "../../shared/pagination"
import { page } from "../../shared/pagination"
import { ConflictError, NotFoundError } from "../../shared/errors"
import { auditService, type AuditActor } from "../audit/audit.service"
import type { ListNotificationsQuery } from "./notification.dto"
import { canRetryNotification } from "./notification.policy"
import {
  notificationRepository,
  type NotificationWithRecipient,
} from "./notification.repository"

export type NotificationChannel = "email" | "teams" | "in_app"
export type NotificationTemplate =
  | "registration_confirmed"
  | "information_published"
  | "assignment_changed"

interface ScheduleNotificationInput {
  eventId: string
  registrationId: string | null
  channel: NotificationChannel
  template: NotificationTemplate
  payload: Record<string, unknown>
  scheduledAt?: Date
}

/**
 * §11 - Notification service
 * Phase 1: chỉ email. Phase 2: teams, in_app
 */
export const notificationService = {
  async list(
    eventId: string,
    query: ListNotificationsQuery,
    pagination: PaginationQuery,
  ): Promise<Page<NotificationWithRecipient>> {
    const result = await notificationRepository.list(eventId, query.status, pagination)
    return page(result.items, result.total, pagination)
  },

  async retry(
    eventId: string,
    id: string,
    actor: AuditActor,
  ): Promise<{ id: string; status: "pending" }> {
    const existing = await notificationRepository.findById(eventId, id)
    if (!existing) throw new NotFoundError("Notification")
    if (!canRetryNotification(existing.status)) {
      throw new ConflictError("Chỉ email gửi lỗi mới có thể gửi lại.")
    }

    await db.transaction(async (tx) => {
      await notificationRepository.resetForRetry(eventId, id, tx)
      await auditService.record(
        {
          eventId,
          actor,
          entity: "notification",
          entityId: id,
          action: "retry",
          before: { status: existing.status, attempts: existing.attempts },
          after: { status: "pending", attempts: 0 },
          reason: "Organizer requested email retry",
        },
        tx,
      )
    })

    return { id, status: "pending" }
  },

  async schedule(input: ScheduleNotificationInput, executor: DbExecutor = db): Promise<void> {
    await executor.insert(notification).values({
      id: newId(),
      eventId: input.eventId,
      registrationId: input.registrationId,
      channel: input.channel,
      template: input.template,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      scheduledAt: input.scheduledAt ?? new Date(),
    })
  },

  /**
   * §4.7 - Email xác nhận đăng ký
   */
  async scheduleRegistrationConfirmed(
    eventId: string,
    registrationId: string,
    executor: DbExecutor = db,
  ): Promise<void> {
    await this.schedule(
      {
        eventId,
        registrationId,
        channel: "email",
        template: "registration_confirmed",
        payload: { registrationId },
      },
      executor,
    )
  },

  /**
   * §11 - Email thông báo BTC công bố thông tin
   */
  async scheduleInformationPublished(
    eventId: string,
    registrationId: string,
    executor: DbExecutor = db,
  ): Promise<void> {
    await this.schedule(
      {
        eventId,
        registrationId,
        channel: "email",
        template: "information_published",
        payload: { registrationId },
      },
      executor,
    )
  },

  /**
   * §11 - Email thông báo thay đổi phân bổ
   */
  async scheduleAssignmentChanged(
    eventId: string,
    registrationId: string,
    changeType: "flight" | "vehicle" | "room" | "schedule" | "announcement",
    executor: DbExecutor = db,
  ): Promise<void> {
    await this.schedule(
      {
        eventId,
        registrationId,
        channel: "email",
        template: "assignment_changed",
        payload: { registrationId, changeType },
      },
      executor,
    )
  },

  async scheduleChangesIfPublished(
    eventId: string,
    registrationIds: string[],
    changeType: "flight" | "vehicle" | "room" | "schedule" | "announcement",
    executor: DbExecutor = db,
  ): Promise<void> {
    const edition = (await executor.select({ status: event.status }).from(event).where(eq(event.id, eventId)).limit(1))[0]
    if (!edition || !["information_published", "event_started"].includes(edition.status)) return
    for (const registrationId of new Set(registrationIds)) {
      await this.scheduleAssignmentChanged(eventId, registrationId, changeType, executor)
    }
  },
}
