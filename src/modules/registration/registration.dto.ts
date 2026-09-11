import { z } from "zod"

// §4.5 - Bốn chặng cố định
export const transportLegSchema = z.enum([
  "origin_to_airport",
  "airport_to_hotel",
  "hotel_to_airport",
  "airport_to_origin",
])
export type TransportLeg = z.infer<typeof transportLegSchema>

export const shiftSchema = z.enum(["shift_1", "shift_2"])
export type Shift = z.infer<typeof shiftSchema>

// §4.5 - Nhu cầu xe một chặng
export const transportNeedInputSchema = z.object({
  leg: transportLegSchema,
  needed: z.boolean(),
  pickupPointId: z.string().nullable(),
}).superRefine((value, ctx) => {
  if (value.needed && !value.pickupPointId) {
    ctx.addIssue({
      code: "custom",
      path: ["pickupPointId"],
      message: "Chặng cần xe phải chọn điểm đón/trả.",
    })
  }
  if (!value.needed && value.pickupPointId) {
    ctx.addIssue({
      code: "custom",
      path: ["pickupPointId"],
      message: "Chặng không cần xe không được giữ điểm đón/trả.",
    })
  }
})
export type TransportNeedInput = z.infer<typeof transportNeedInputSchema>

// §4 - CBNV tạo/cập nhật đăng ký
export const createRegistrationSchema = z.object({
  // §4.3 - Có/Không tham gia
  participating: z.boolean(),

  // §4.2 - Chọn từ Master Data
  teamId: z.string().min(1),

  // §4.3 - Xác nhận quy định. Nếu participating=true thì bắt buộc
  agreedTerms: z.boolean().optional(),

  // §4.4 - Ca 1/Ca 2 nguyện vọng
  shiftPreference: shiftSchema.optional(),

  // §4.5 - Nhu cầu xe 4 chặng. Nếu participating=true thì bắt buộc đủ 4
  transportNeeds: z.array(transportNeedInputSchema).optional(),

  // §4.6 - Mong muốn tự do
  wishNote: z.string().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (!value.participating) return

  if (value.agreedTerms !== true) {
    ctx.addIssue({ code: "custom", path: ["agreedTerms"], message: "Phải đồng ý quy định." })
  }
  if (!value.shiftPreference) {
    ctx.addIssue({ code: "custom", path: ["shiftPreference"], message: "Phải chọn ca bay." })
  }

  const needs = value.transportNeeds ?? []
  const legs = new Set(needs.map((need) => need.leg))
  if (needs.length !== transportLegSchema.options.length || legs.size !== transportLegSchema.options.length) {
    ctx.addIssue({
      code: "custom",
      path: ["transportNeeds"],
      message: "Phải trả lời nhu cầu xe cho đủ bốn chặng.",
    })
  }
})
export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>

// BTC bulk set shiftLocked theo bộ lọc (ADR-017)
export const bulkSetShiftLockedSchema = z.object({
  teamIds: z.array(z.string()).min(1).optional(),
  participating: z.boolean().optional(),
  shiftPreference: shiftSchema.optional(),
  shiftLocked: z.boolean(),
})
export type BulkSetShiftLockedInput = z.infer<typeof bulkSetShiftLockedSchema>

// Lọc danh sách đăng ký
export const listRegistrationsQuerySchema = z.object({
  teamId: z.string().optional(),
  participating: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  shiftPreference: shiftSchema.optional(),
  shiftLocked: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  search: z.string().optional(), // tìm theo tên, email, mã NV
})
export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>
