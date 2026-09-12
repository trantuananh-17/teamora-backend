import { check, sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { relations, sql } from "drizzle-orm"
import { event } from "./event.schema"
import { user } from "./auth.schema"
import { team } from "./master.schema"
import { pickupPoint } from "./master.schema"

export const TRANSPORT_LEGS = [
  "origin_to_airport",
  "airport_to_hotel",
  "hotel_to_airport",
  "airport_to_origin",
] as const

export type TransportLeg = (typeof TRANSPORT_LEGS)[number]

/**
 * Registration - CBNV đăng ký tham gia một kỳ Team Building
 * Khóa nối trung tâm: unique(eventId, userId)
 */
export const registration = sqliteTable(
  "registration",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "restrict" }),

    // §4.3 - Có/Không tham gia. Chọn "Không" vẫn lưu row - BTC cần biết ai từ chối
    participating: integer("participating", { mode: "boolean" }).notNull(),

    // §4.3 - Xác nhận quy định
    agreedTermsAt: integer("agreed_terms_at", { mode: "timestamp_ms" }),
    termsVersion: text("terms_version"),

    // §4.4 - Ca 1/Ca 2. Là nguyện vọng, không phải cam kết
    shiftPreference: text("shift_preference").$type<"shift_1" | "shift_2">(),

    // ADR-017 - Ràng buộc cứng, không phải nguyện vọng. BTC đánh dấu bulk theo bộ lọc Team
    shiftLocked: integer("shift_locked", { mode: "boolean" }).notNull().default(false),

    // §4.6 - Mong muốn/đề xuất tự do
    wishNote: text("wish_note"),

    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("registration_event_id_user_id_uidx").on(t.eventId, t.userId),
    index("registration_event_id_idx").on(t.eventId),
    index("registration_user_id_idx").on(t.userId),
    index("registration_team_id_idx").on(t.teamId),
    check("registration_participating_check", sql`${t.participating} in (0, 1)`),
    check("registration_shift_locked_check", sql`${t.shiftLocked} in (0, 1)`),
    check(
      "registration_shift_preference_check",
      sql`${t.shiftPreference} is null or ${t.shiftPreference} in ('shift_1', 'shift_2')`,
    ),
  ]
)

/**
 * Registration Transport Need - Nhu cầu xe 4 chặng
 * Bốn row cho mỗi registration tham gia, unique(registrationId, leg)
 * Lưu cả row needed=false: phân biệt "đã trả lời Không" với "chưa trả lời"
 */
export const registrationTransportNeed = sqliteTable(
  "registration_transport_need",
  {
    id: text("id").primaryKey(),
    registrationId: text("registration_id")
      .notNull()
      .references(() => registration.id, { onDelete: "cascade" }),

    // §7.1 - 4 chặng cố định
    leg: text("leg").$type<TransportLeg>().notNull(),

    // §4.5 - Có/Không cần xe
    needed: integer("needed", { mode: "boolean" }).notNull(),

    // §4.5 - Điểm đón/trả. Nullable: không cần xe thì không chọn điểm
    pickupPointId: text("pickup_point_id").references(() => pickupPoint.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("registration_transport_need_reg_leg_uidx").on(t.registrationId, t.leg),
    index("registration_transport_need_reg_id_idx").on(t.registrationId),
    check("registration_transport_need_needed_check", sql`${t.needed} in (0, 1)`),
    check(
      "registration_transport_need_leg_check",
      sql`${t.leg} in ('origin_to_airport', 'airport_to_hotel', 'hotel_to_airport', 'airport_to_origin')`,
    ),
  ]
)

export const registrationRelations = relations(registration, ({ one, many }) => ({
  event: one(event, {
    fields: [registration.eventId],
    references: [event.id],
  }),
  user: one(user, {
    fields: [registration.userId],
    references: [user.id],
  }),
  team: one(team, {
    fields: [registration.teamId],
    references: [team.id],
  }),
  transportNeeds: many(registrationTransportNeed),
}))

export const registrationTransportNeedRelations = relations(registrationTransportNeed, ({ one }) => ({
  registration: one(registration, {
    fields: [registrationTransportNeed.registrationId],
    references: [registration.id],
  }),
  pickupPoint: one(pickupPoint, {
    fields: [registrationTransportNeed.pickupPointId],
    references: [pickupPoint.id],
  }),
}))
