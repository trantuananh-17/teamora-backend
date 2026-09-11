import { and, asc, count, eq, lte } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { notification, registration, user } from "../../db/schema"
import type { NotificationStatus } from "./notification.policy"

export type NotificationRow = typeof notification.$inferSelect

export interface NotificationWithRecipient extends NotificationRow {
  recipient: {
    name: string
    email: string
  } | null
}

export const notificationRepository = {
  async findPending(limit: number, executor: DbExecutor = db): Promise<NotificationRow[]> {
    return executor
      .select()
      .from(notification)
      .where(and(eq(notification.status, "pending"), lte(notification.scheduledAt, new Date())))
      .orderBy(asc(notification.scheduledAt))
      .limit(limit)
  },

  async findById(
    eventId: string,
    id: string,
    executor: DbExecutor = db,
  ): Promise<NotificationRow | undefined> {
    const rows = await executor
      .select()
      .from(notification)
      .where(and(eq(notification.eventId, eventId), eq(notification.id, id)))
      .limit(1)
    return rows[0]
  },

  async list(
    eventId: string,
    status: NotificationStatus | undefined,
    params: { limit: number; offset: number },
    executor: DbExecutor = db,
  ): Promise<{ items: NotificationWithRecipient[]; total: number }> {
    const where = status
      ? and(eq(notification.eventId, eventId), eq(notification.status, status))
      : eq(notification.eventId, eventId)

    const [rows, totals] = await Promise.all([
      executor
        .select({
          notification,
          recipient: {
            name: user.name,
            email: user.email,
          },
        })
        .from(notification)
        .leftJoin(registration, eq(notification.registrationId, registration.id))
        .leftJoin(user, eq(registration.userId, user.id))
        .where(where)
        .orderBy(asc(notification.scheduledAt))
        .limit(params.limit)
        .offset(params.offset),
      executor.select({ value: count() }).from(notification).where(where),
    ])

    return {
      items: rows.map((row) => ({
        ...row.notification,
        recipient: row.recipient?.email ? row.recipient : null,
      })),
      total: totals[0]?.value ?? 0,
    }
  },

  async markSent(id: string, executor: DbExecutor = db): Promise<void> {
    await executor
      .update(notification)
      .set({ status: "sent", sentAt: new Date(), lastError: null })
      .where(eq(notification.id, id))
  },

  async markDeliveryFailure(
    id: string,
    error: string,
    attempts: number,
    status: "pending" | "failed",
    executor: DbExecutor = db,
  ): Promise<void> {
    await executor
      .update(notification)
      .set({ status, attempts, lastError: error })
      .where(eq(notification.id, id))
  },

  async resetForRetry(
    eventId: string,
    id: string,
    executor: DbExecutor = db,
  ): Promise<void> {
    await executor
      .update(notification)
      .set({
        status: "pending",
        attempts: 0,
        lastError: null,
        scheduledAt: new Date(),
        sentAt: null,
      })
      .where(and(eq(notification.eventId, eventId), eq(notification.id, id)))
  },
}
