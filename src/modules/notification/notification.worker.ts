import { logger } from "../../shared/logger"
import { registrationRepository } from "../registration/registration.repository"
import { sendEmail } from "../../mail/mailer"
import {
  renderRegistrationConfirmed,
  renderInformationPublished,
  renderAssignmentChanged,
} from "../../mail/templates"
import { failureTransition } from "./notification.policy"
import { notificationRepository, type NotificationRow } from "./notification.repository"

const BATCH_SIZE = 10

async function markDeliveryFailure(
  notif: NotificationRow,
  error: string,
): Promise<void> {
  const transition = failureTransition(notif.attempts)
  await notificationRepository.markDeliveryFailure(
    notif.id,
    error,
    transition.attempts,
    transition.status,
  )
}

/**
 * §11 - Outbox worker xử lý pending notifications
 * ADR-008: chạy bằng setInterval trong process API, không phải worker process riêng
 */
async function processNotification(notif: NotificationRow): Promise<void> {
  if (!notif.registrationId) {
    logger.warn("notification.skip", { id: notif.id, reason: "missing registrationId" })
    await markDeliveryFailure(notif, "Missing registrationId")
    return
  }

  // Load registration với relations để render template
  const registration = await registrationRepository.findByIdWithRelations(
    notif.eventId,
    notif.registrationId,
  )

  if (!registration) {
    logger.warn("notification.skip", { id: notif.id, reason: "registration not found" })
    await markDeliveryFailure(notif, "Registration not found")
    return
  }

  // Render template
  let subject: string
  let html: string

  try {
    switch (notif.template) {
      case "registration_confirmed": {
        const rendered = renderRegistrationConfirmed(registration)
        subject = rendered.subject
        html = rendered.html
        break
      }
      case "information_published": {
        const rendered = renderInformationPublished()
        subject = rendered.subject
        html = rendered.html
        break
      }
      case "assignment_changed": {
        const changeType = (notif.payload as { changeType?: string }).changeType as
          | "flight"
          | "vehicle"
          | "room"
        const rendered = renderAssignmentChanged(changeType ?? "flight")
        subject = rendered.subject
        html = rendered.html
        break
      }
      default:
        throw new Error(`Unknown template: ${notif.template}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error("notification.render_failed", { id: notif.id, template: notif.template, error: message })
    await markDeliveryFailure(notif, `Render failed: ${message}`)
    return
  }

  // Gửi email
  try {
    const sent = await sendEmail({
      to: registration.user.email,
      subject,
      html,
    })

    if (sent) {
      await notificationRepository.markSent(notif.id)
      logger.info("notification.processed", {
        id: notif.id,
        template: notif.template,
      })
    } else {
      // Mail disabled - mark sent để không retry
      await notificationRepository.markSent(notif.id)
      logger.info("notification.skipped", {
        id: notif.id,
        reason: "mail disabled",
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error("notification.send_failed", {
      id: notif.id,
      attempts: notif.attempts + 1,
      error: message,
    })
    await markDeliveryFailure(notif, message)
  }
}

/**
 * Process một batch pending notifications. Gọi bởi interval worker.
 */
async function processBatch(): Promise<void> {
  try {
    const pending = await notificationRepository.findPending(BATCH_SIZE)

    if (pending.length === 0) {
      return
    }

    logger.info("notification.batch_start", { count: pending.length })

    for (const notif of pending) {
      try {
        await processNotification(notif)
      } catch (err) {
        // Log error nhưng không throw - tiếp tục xử lý notification khác
        logger.error("notification.process_error", {
          id: notif.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    logger.info("notification.batch_done", { count: pending.length })
  } catch (err) {
    logger.error("notification.batch_error", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

let intervalId: NodeJS.Timeout | null = null

/**
 * Start outbox worker. Gọi từ main.api.ts sau khi server lên.
 * Interval 5s - không cần quá nhanh, email không phải realtime.
 */
export function startOutboxWorker(): void {
  if (intervalId) {
    logger.warn("outbox.already_running")
    return
  }

  logger.info("outbox.start")

  // Process ngay lần đầu
  processBatch().catch((err) => {
    logger.error("outbox.initial_batch_error", {
      error: err instanceof Error ? err.message : String(err),
    })
  })

  // Sau đó chạy mỗi 5s
  intervalId = setInterval(() => {
    processBatch().catch((err) => {
      logger.error("outbox.interval_error", {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }, 5000)
}

/**
 * Stop outbox worker. Gọi khi graceful shutdown.
 */
export function stopOutboxWorker(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info("outbox.stopped")
  }
}
