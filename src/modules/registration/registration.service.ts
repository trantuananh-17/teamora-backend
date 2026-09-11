import { db } from "../../db/client"
import { ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors"
import type { Page, PaginationQuery } from "../../shared/pagination"
import { page } from "../../shared/pagination"
import { auditService, type AuditActor } from "../audit/audit.service"
import { eventRepository } from "../event/event.repository"
import { pickupPointRepository } from "../pickup-point/pickup-point.repository"
import { teamRepository } from "../team/team.repository"
import type {
  CreateRegistrationInput,
  BulkSetShiftLockedInput,
  ListRegistrationsQuery,
} from "./registration.dto"
import {
  registrationRepository,
  type RegistrationRow,
  type RegistrationWithRelations,
} from "./registration.repository"
import { notificationService } from "../notification/notification.service"

const ENTITY = "registration"

export const registrationService = {
  /**
   * CBNV tạo đăng ký của chính mình. §4
   */
  async createOrUpdate(
    eventId: string,
    userId: string,
    input: CreateRegistrationInput,
    actor: AuditActor,
  ): Promise<RegistrationWithRelations> {
    // Kiểm tra event tồn tại và đang mở đăng ký
    const event = await eventRepository.findById(eventId)
    if (!event) throw new NotFoundError("Event")

    if (event.status !== "registration_open") {
      throw new ForbiddenError("Kỳ này không còn cho phép đăng ký.")
    }

    const existing = await registrationRepository.findByEventAndUser(eventId, userId)

    // Validate team thuộc event này (hoặc là Team dùng chung)
    const team = await teamRepository.findById(input.teamId)
    if (!team) throw new NotFoundError("Team")
    if (team.eventId !== null && team.eventId !== eventId) {
      throw new ValidationError("Team không thuộc kỳ này.")
    }
    if (!team.active && team.id !== existing?.teamId) {
      throw new ValidationError("Team này đã ngừng sử dụng.")
    }

    // §4.3 - Nếu participating=true thì bắt buộc agreedTerms
    if (input.participating && !input.agreedTerms) {
      throw new ValidationError("Phải xác nhận đã đọc và đồng ý quy định.")
    }

    if (input.participating && !input.shiftPreference) {
      throw new ValidationError("Phải chọn ca bay nguyện vọng.")
    }

    // §4.5 - Nếu participating=true thì bắt buộc đủ 4 chặng transport needs
    if (input.participating) {
      if (!input.transportNeeds || input.transportNeeds.length !== 4) {
        throw new ValidationError("Phải cung cấp nhu cầu xe cho cả 4 chặng.")
      }
      const legs = new Set(input.transportNeeds.map((n) => n.leg))
      if (
        !legs.has("origin_to_airport") ||
        !legs.has("airport_to_hotel") ||
        !legs.has("hotel_to_airport") ||
        !legs.has("airport_to_origin")
      ) {
        throw new ValidationError("Thiếu thông tin một hoặc nhiều chặng xe.")
      }

      for (const need of input.transportNeeds) {
        if (need.needed && !need.pickupPointId) {
          throw new ValidationError("Chặng cần xe phải chọn điểm đón/trả.")
        }
        if (!need.needed && need.pickupPointId) {
          throw new ValidationError("Chặng không cần xe không được giữ điểm đón/trả.")
        }
        if (need.pickupPointId) {
          const point = await pickupPointRepository.findById(eventId, need.pickupPointId)
          if (!point) throw new ValidationError("Điểm đón/trả không thuộc kỳ này.")
          if (!point.active) throw new ValidationError("Điểm đón/trả này đã ngừng sử dụng.")
        }
      }
    }

    if (
      existing?.shiftLocked &&
      input.shiftPreference !== undefined &&
      input.shiftPreference !== existing.shiftPreference
    ) {
      throw new ForbiddenError("Ca bay đã được Ban Tổ chức khóa và không thể thay đổi.")
    }

    return db.transaction(async (tx) => {
      let registration: RegistrationRow

      if (existing) {
        // Update
        const before = await registrationRepository.findByIdWithRelations(eventId, existing.id, tx)

        registration = await registrationRepository.update(
          eventId,
          existing.id,
          {
            teamId: input.teamId,
            participating: input.participating,
            agreedTermsAt: input.agreedTerms ? new Date() : null,
            termsVersion: input.agreedTerms ? event.settings.terms?.version ?? "1" : null,
            shiftPreference: input.shiftPreference ?? null,
            wishNote: input.wishNote ?? null,
            submittedAt: new Date(),
          },
          tx,
        )

        // Update transport needs nếu có
        if (!input.participating) {
          await registrationRepository.deleteTransportNeeds(registration.id, tx)
        } else if (input.transportNeeds) {
          await registrationRepository.deleteTransportNeeds(registration.id, tx)
          await registrationRepository.createTransportNeeds(
            input.transportNeeds.map((n) => ({
              registrationId: registration.id,
              leg: n.leg,
              needed: n.needed,
              pickupPointId: n.pickupPointId,
            })),
            tx,
          )
        }

        const after = await registrationRepository.findByIdWithRelations(eventId, registration.id, tx)

        await auditService.record(
          {
            eventId,
            actor,
            entity: ENTITY,
            entityId: registration.id,
            action: "update",
            before,
            after,
          },
          tx,
        )
      } else {
        // Create
        registration = await registrationRepository.create(
          {
            eventId,
            userId,
            teamId: input.teamId,
            participating: input.participating,
            agreedTermsAt: input.agreedTerms ? new Date() : null,
            termsVersion: input.agreedTerms ? event.settings.terms?.version ?? "1" : null,
            shiftPreference: input.shiftPreference ?? null,
            wishNote: input.wishNote ?? null,
            submittedAt: new Date(),
          },
          tx,
        )

        // Create transport needs nếu có
        if (input.transportNeeds) {
          await registrationRepository.createTransportNeeds(
            input.transportNeeds.map((n) => ({
              registrationId: registration.id,
              leg: n.leg,
              needed: n.needed,
              pickupPointId: n.pickupPointId,
            })),
            tx,
          )
        }

        const after = await registrationRepository.findByIdWithRelations(eventId, registration.id, tx)

        await auditService.record(
          {
            eventId,
            actor,
            entity: ENTITY,
            entityId: registration.id,
            action: "create",
            after,
          },
          tx,
        )
      }

      // §4.7 - Email confirms the submitted answer, including "Không tham gia".
      await notificationService.scheduleRegistrationConfirmed(eventId, registration.id, tx)

      return (await registrationRepository.findByIdWithRelations(eventId, registration.id, tx))!
    })
  },

  /**
   * CBNV xem đăng ký của chính mình
   */
  async getMyRegistration(
    eventId: string,
    userId: string,
  ): Promise<RegistrationWithRelations | null> {
    const registration = await registrationRepository.findByEventAndUser(eventId, userId)
    if (!registration) return null
    return (await registrationRepository.findByIdWithRelations(eventId, registration.id)) ?? null
  },

  /**
   * BTC xem danh sách đăng ký (organizer only)
   */
  async list(
    eventId: string,
    query: ListRegistrationsQuery,
    pagination: PaginationQuery,
  ): Promise<Page<RegistrationWithRelations>> {
    const { items, total } = await registrationRepository.list(eventId, query, pagination)
    return page(items, total, pagination)
  },

  /**
   * BTC xem chi tiết một đăng ký (organizer only)
   */
  async getById(eventId: string, id: string): Promise<RegistrationWithRelations> {
    const found = await registrationRepository.findByIdWithRelations(eventId, id)
    if (!found) throw new NotFoundError("Registration")
    return found
  },

  /**
   * BTC bulk set shiftLocked theo bộ lọc. ADR-017
   * Organizer only, không kiểm tra event status - BTC có thể lock shift sau khi đóng đăng ký.
   */
  async bulkSetShiftLocked(
    eventId: string,
    input: BulkSetShiftLockedInput,
    actor: AuditActor,
  ): Promise<{ updated: number }> {
    const event = await eventRepository.findById(eventId)
    if (!event) throw new NotFoundError("Event")

    const filter = {
      teamIds: input.teamIds,
      participating: input.participating,
      shiftPreference: input.shiftPreference,
    }

    return db.transaction(async (tx) => {
      const updated = await registrationRepository.bulkSetShiftLocked(
        eventId,
        filter,
        input.shiftLocked,
        tx,
      )

      // Ghi một dòng audit cho toàn bộ thao tác bulk
      await auditService.record(
        {
          eventId,
          actor,
          entity: ENTITY,
          entityId: eventId,
          action: "bulk_update",
          after: { filter, shiftLocked: input.shiftLocked, updated },
          reason: `Bulk set shiftLocked=${input.shiftLocked} for ${updated} registrations`,
        },
        tx,
      )

      return { updated }
    })
  },

  /**
   * Thống kê đăng ký cho event dashboard
   */
  async getStats(eventId: string): Promise<{
    total: number
    participating: number
    notParticipating: number
  }> {
    const [total, participating] = await Promise.all([
      registrationRepository.countByEvent(eventId),
      registrationRepository.countParticipatingByEvent(eventId),
    ])

    return {
      total,
      participating,
      notParticipating: total - participating,
    }
  },

  async exportCsv(eventId: string, query: ListRegistrationsQuery): Promise<string> {
    const rows: RegistrationWithRelations[] = []
    let offset = 0

    while (true) {
      const page = await registrationRepository.list(eventId, query, { limit: 100, offset })
      rows.push(...page.items)
      offset += page.items.length
      if (offset >= page.total || page.items.length === 0) break
    }

    const header = [
      "Họ tên",
      "Email",
      "Mã nhân viên",
      "Điện thoại",
      "Team",
      "Tham gia",
      "Ca đăng ký",
      "Khóa ca",
      "Mong muốn",
      "Thời điểm đăng ký",
    ]
    const lines = rows.map((row) => [
      row.user.name,
      row.user.email,
      row.employeeProfile?.employeeCode ?? "",
      row.employeeProfile?.phone ?? "",
      row.team.name,
      row.participating ? "Có" : "Không",
      row.shiftPreference === "shift_1" ? "Ca 1" : row.shiftPreference === "shift_2" ? "Ca 2" : "",
      row.shiftLocked ? "Có" : "Không",
      row.wishNote ?? "",
      row.submittedAt?.toISOString() ?? "",
    ])

    return `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n")}`
  },
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
