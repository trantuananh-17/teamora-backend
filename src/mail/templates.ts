import { env } from "../config/env"
import type { RegistrationWithRelations } from "../modules/registration/registration.repository"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

/**
 * Dùng cho cả lần kích hoạt đầu tiên của user import và lần quên mật khẩu sau đó.
 * Better Auth quản lý token một lần; template chỉ nhận URL công khai của frontend.
 */
export function renderPasswordReset(name: string, resetUrl: string): {
  subject: string
  html: string
} {
  return {
    subject: "Thiết lập lại mật khẩu Teamora",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#172023;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#087f8c;color:#fff;padding:24px;border-radius:10px 10px 0 0;">
      <div style="font-size:14px;opacity:.8;">TEAMORA</div>
      <h1 style="margin:8px 0 0;font-size:24px;">Thiết lập mật khẩu</h1>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 10px 10px;">
      <p>Xin chào <strong>${escapeHtml(name)}</strong>,</p>
      <p>Bạn vừa yêu cầu thiết lập hoặc đặt lại mật khẩu cho tài khoản Teamora.</p>
      <p style="margin:28px 0;">
        <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#087f8c;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:600;">Thiết lập mật khẩu</a>
      </p>
      <p>Liên kết có hiệu lực trong 60 phút và chỉ dùng được một lần. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>
      <p style="margin-top:24px;padding-top:16px;border-top:1px solid #e4e8ea;color:#647176;font-size:13px;">Email được gửi tự động từ Teamora, vui lòng không trả lời.</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

/**
 * §4.7 - Email xác nhận đăng ký
 * Template đơn giản, chỉ thông tin cần thiết
 */
export function renderRegistrationConfirmed(registration: RegistrationWithRelations): {
  subject: string
  html: string
} {
  const eventLink = `${env.appBaseUrl}/`

  return {
    subject: "Xác nhận đăng ký Team Building",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0891b2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; }
    .info-row { margin: 12px 0; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .button { display: inline-block; background: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Đăng ký thành công</h2>
    </div>
    <div class="content">
      <p>Xin chào <strong>${registration.user.name}</strong>,</p>
      <p>Bạn đã đăng ký thành công chương trình Team Building. Thông tin đăng ký của bạn:</p>

      <div class="info-row">
        <span class="label">Tham gia:</span>
        <span class="value">${registration.participating ? "Có" : "Không"}</span>
      </div>

      ${
        registration.participating
          ? `
      <div class="info-row">
        <span class="label">Bộ phận:</span>
        <span class="value">${registration.team.name}</span>
      </div>

      ${
        registration.shiftPreference
          ? `
      <div class="info-row">
        <span class="label">Ca bay nguyện vọng:</span>
        <span class="value">${registration.shiftPreference === "shift_1" ? "Ca 1" : "Ca 2"}</span>
      </div>
      `
          : ""
      }

      ${
        registration.transportNeeds.some((n) => n.needed)
          ? `
      <div class="info-row">
        <span class="label">Nhu cầu xe:</span>
        <span class="value">Đã đăng ký ${registration.transportNeeds.filter((n) => n.needed).length}/4 chặng</span>
      </div>
      `
          : ""
      }
      `
          : ""
      }

      <p>Bạn có thể xem lại hoặc chỉnh sửa thông tin đăng ký (trong thời gian cho phép) tại:</p>
      <a href="${eventLink}" class="button">Xem thông tin đăng ký</a>

      <div class="footer">
        <p>Ban Tổ chức sẽ thông báo chi tiết chuyến bay, xe đưa đón và lịch trình sau khi hoàn tất phân bổ.</p>
        <p style="margin-top: 8px; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

/**
 * §11 - Email thông báo BTC đã công bố thông tin
 */
export function renderInformationPublished(): {
  subject: string
  html: string
} {
  const journeyLink = `${env.appBaseUrl}/`

  return {
    subject: "Thông tin Team Building đã sẵn sàng",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0891b2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Thông tin hành trình đã sẵn sàng</h2>
    </div>
    <div class="content">
      <p>Ban Tổ chức đã hoàn tất phân bổ chuyến bay, xe đưa đón và khách sạn.</p>
      <p>Bạn có thể xem toàn bộ thông tin hành trình của mình tại:</p>
      <a href="${journeyLink}" class="button">Xem hành trình của tôi</a>

      <div class="footer">
        <p>Vui lòng kiểm tra kỹ thông tin và liên hệ Ban Tổ chức nếu có bất kỳ thắc mắc nào.</p>
        <p style="margin-top: 8px; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

/**
 * §11 - Email thông báo thay đổi phân bổ
 */
export function renderAssignmentChanged(changeType: "flight" | "vehicle" | "room"): {
  subject: string
  html: string
} {
  const journeyLink = `${env.appBaseUrl}/`
  const changeLabel =
    changeType === "flight" ? "chuyến bay" : changeType === "vehicle" ? "xe đưa đón" : "phòng"

  return {
    subject: `Thay đổi ${changeLabel} - Team Building`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Thông báo thay đổi</h2>
    </div>
    <div class="content">
      <p>Ban Tổ chức đã điều chỉnh <strong>${changeLabel}</strong> cho bạn.</p>
      <p>Vui lòng kiểm tra lại thông tin hành trình mới nhất:</p>
      <a href="${journeyLink}" class="button">Xem hành trình của tôi</a>

      <div class="footer">
        <p>Liên hệ Ban Tổ chức nếu bạn có bất kỳ thắc mắc nào.</p>
        <p style="margin-top: 8px; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}
