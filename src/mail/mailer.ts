import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

import { env } from "../config/env"
import { logger } from "../shared/logger"

let transporter: Transporter | null = null

/**
 * Mail là off hoàn toàn khi SMTP_HOST không set - điều này cho phép test và
 * `pnpm dev:api` chạy không cần relay. Half-configured là off, không phải half-on.
 */
export function getMailTransporter(): Transporter | null {
  if (!env.smtp) {
    logger.warn("mail.disabled", { reason: "SMTP_HOST not configured" })
    return null
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth:
        env.smtp.user && env.smtp.password
          ? {
              user: env.smtp.user,
              pass: env.smtp.password,
            }
          : undefined,
    })
  }

  return transporter
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
}

/**
 * §11 - Gửi email. Trả về true nếu thành công, false nếu mail disabled,
 * throw error nếu gửi thất bại.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const transport = getMailTransporter()
  if (!transport) {
    logger.warn("mail.skip", { reason: "transport not configured" })
    return false
  }

  await transport.sendMail({
    from: env.smtp!.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })

  logger.info("mail.sent", { subject: params.subject })

  return true
}
