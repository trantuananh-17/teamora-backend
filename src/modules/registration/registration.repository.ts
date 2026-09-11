import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import {
  registration,
  registrationTransportNeed,
  user,
  team,
  employeeProfile,
} from "../../db/schema"
import { newId } from "../../shared/id"
import type { TransportLeg } from "./registration.dto"

export type RegistrationRow = typeof registration.$inferSelect
export type TransportNeedRow = typeof registrationTransportNeed.$inferSelect

export interface RegistrationWithRelations extends RegistrationRow {
  user: {
    id: string
    name: string
    email: string
  }
  team: {
    id: string
    name: string
  }
  employeeProfile: {
    employeeCode: string | null
    phone: string | null
  } | null
  transportNeeds: TransportNeedRow[]
}

export interface CreateRegistrationData {
  eventId: string
  userId: string
  teamId: string
  participating: boolean
  agreedTermsAt: Date | null
  termsVersion: string | null
  shiftPreference: "shift_1" | "shift_2" | null
  wishNote: string | null
  submittedAt: Date | null
}

export interface UpdateRegistrationData {
  teamId?: string
  participating?: boolean
  agreedTermsAt?: Date | null
  termsVersion?: string | null
  shiftPreference?: "shift_1" | "shift_2" | null
  wishNote?: string | null
  submittedAt?: Date | null
}

export interface CreateTransportNeedData {
  registrationId: string
  leg: TransportLeg
  needed: boolean
  pickupPointId: string | null
}

export interface ListRegistrationsFilter {
  teamId?: string
  teamIds?: string[]
  participating?: boolean
  shiftPreference?: "shift_1" | "shift_2"
  shiftLocked?: boolean
  search?: string
}

export const registrationRepository = {
  async findByEventAndUser(
    eventId: string,
    userId: string,
    executor: DbExecutor = db,
  ): Promise<RegistrationRow | undefined> {
    const rows = await executor
      .select()
      .from(registration)
      .where(and(eq(registration.eventId, eventId), eq(registration.userId, userId)))
      .limit(1)
    return rows[0]
  },

  async findById(
    eventId: string,
    id: string,
    executor: DbExecutor = db,
  ): Promise<RegistrationRow | undefined> {
    const rows = await executor
      .select()
      .from(registration)
      .where(and(eq(registration.eventId, eventId), eq(registration.id, id)))
      .limit(1)
    return rows[0]
  },

  async findByIdWithRelations(
    eventId: string,
    id: string,
    executor: DbExecutor = db,
  ): Promise<RegistrationWithRelations | undefined> {
    const rows = await executor
      .select({
        registration,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        team: {
          id: team.id,
          name: team.name,
        },
        employeeProfile: {
          employeeCode: employeeProfile.employeeCode,
          phone: employeeProfile.phone,
        },
      })
      .from(registration)
      .innerJoin(user, eq(registration.userId, user.id))
      .innerJoin(team, eq(registration.teamId, team.id))
      .leftJoin(employeeProfile, eq(user.id, employeeProfile.userId))
      .where(and(eq(registration.eventId, eventId), eq(registration.id, id)))
      .limit(1)

    if (rows.length === 0) return undefined

    const row = rows[0]
    if (!row) return undefined

    const transportNeeds = await this.getTransportNeeds(id, executor)

    return {
      ...row.registration,
      user: row.user,
      team: row.team,
      employeeProfile: row.employeeProfile,
      transportNeeds,
    }
  },

  async list(
    eventId: string,
    filter: ListRegistrationsFilter,
    params: { limit: number; offset: number },
    executor: DbExecutor = db,
  ): Promise<{ items: RegistrationWithRelations[]; total: number }> {
    const conditions = [eq(registration.eventId, eventId)]

    if (filter.teamId) {
      conditions.push(eq(registration.teamId, filter.teamId))
    }
    if (filter.teamIds?.length) {
      conditions.push(inArray(registration.teamId, filter.teamIds))
    }
    if (filter.participating !== undefined) {
      conditions.push(eq(registration.participating, filter.participating))
    }
    if (filter.shiftPreference) {
      conditions.push(eq(registration.shiftPreference, filter.shiftPreference))
    }
    if (filter.shiftLocked !== undefined) {
      conditions.push(eq(registration.shiftLocked, filter.shiftLocked))
    }
    if (filter.search) {
      const searchPattern = `%${filter.search}%`
      conditions.push(
        or(
          ilike(user.name, searchPattern),
          ilike(user.email, searchPattern),
          ilike(employeeProfile.employeeCode, searchPattern),
        )!,
      )
    }

    const whereClause = and(...conditions)

    const [items, totals] = await Promise.all([
      executor
        .select({
          registration,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          team: {
            id: team.id,
            name: team.name,
          },
          employeeProfile: {
            employeeCode: employeeProfile.employeeCode,
            phone: employeeProfile.phone,
          },
        })
        .from(registration)
        .innerJoin(user, eq(registration.userId, user.id))
        .innerJoin(team, eq(registration.teamId, team.id))
        .leftJoin(employeeProfile, eq(user.id, employeeProfile.userId))
        .where(whereClause)
        .orderBy(desc(registration.updatedAt))
        .limit(params.limit)
        .offset(params.offset),
      executor
        .select({ value: count() })
        .from(registration)
        .innerJoin(user, eq(registration.userId, user.id))
        .leftJoin(employeeProfile, eq(user.id, employeeProfile.userId))
        .where(whereClause),
    ])

    // Load transport needs cho tất cả registrations
    const registrationIds = items.map((item) => item.registration.id)
    const allTransportNeeds =
      registrationIds.length > 0
        ? await executor
            .select()
            .from(registrationTransportNeed)
            .where(inArray(registrationTransportNeed.registrationId, registrationIds))
        : []

    const transportNeedsMap = new Map<string, TransportNeedRow[]>()
    for (const need of allTransportNeeds) {
      if (!transportNeedsMap.has(need.registrationId)) {
        transportNeedsMap.set(need.registrationId, [])
      }
      transportNeedsMap.get(need.registrationId)!.push(need)
    }

    const itemsWithRelations: RegistrationWithRelations[] = items.map((item) => ({
      ...item.registration,
      user: item.user,
      team: item.team,
      employeeProfile: item.employeeProfile,
      transportNeeds: transportNeedsMap.get(item.registration.id) || [],
    }))

    return {
      items: itemsWithRelations,
      total: totals[0]?.value ?? 0,
    }
  },

  async create(
    data: CreateRegistrationData,
    executor: DbExecutor = db,
  ): Promise<RegistrationRow> {
    const id = newId()

    await executor.insert(registration).values({
      id,
      eventId: data.eventId,
      userId: data.userId,
      teamId: data.teamId,
      participating: data.participating,
      agreedTermsAt: data.agreedTermsAt,
      termsVersion: data.termsVersion,
      shiftPreference: data.shiftPreference,
      shiftLocked: false,
      wishNote: data.wishNote,
      submittedAt: data.submittedAt,
      updatedAt: new Date(),
    })

    return (await this.findById(data.eventId, id, executor))!
  },

  async update(
    eventId: string,
    id: string,
    data: UpdateRegistrationData,
    executor: DbExecutor = db,
  ): Promise<RegistrationRow> {
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (data.teamId !== undefined) updates.teamId = data.teamId
    if (data.participating !== undefined) updates.participating = data.participating
    if (data.agreedTermsAt !== undefined) updates.agreedTermsAt = data.agreedTermsAt
    if (data.termsVersion !== undefined) updates.termsVersion = data.termsVersion
    if (data.shiftPreference !== undefined) updates.shiftPreference = data.shiftPreference
    if (data.wishNote !== undefined) updates.wishNote = data.wishNote
    if (data.submittedAt !== undefined) updates.submittedAt = data.submittedAt

    await executor
      .update(registration)
      .set(updates)
      .where(and(eq(registration.eventId, eventId), eq(registration.id, id)))

    return (await this.findById(eventId, id, executor))!
  },

  async bulkSetShiftLocked(
    eventId: string,
    filter: ListRegistrationsFilter,
    shiftLocked: boolean,
    executor: DbExecutor = db,
  ): Promise<number> {
    const conditions = [eq(registration.eventId, eventId)]

    if (filter.teamIds?.length) {
      conditions.push(inArray(registration.teamId, filter.teamIds))
    } else if (filter.teamId) {
      conditions.push(eq(registration.teamId, filter.teamId))
    }
    if (filter.participating !== undefined) {
      conditions.push(eq(registration.participating, filter.participating))
    }
    if (filter.shiftPreference) {
      conditions.push(eq(registration.shiftPreference, filter.shiftPreference))
    }

    const result = await executor
      .update(registration)
      .set({ shiftLocked, updatedAt: new Date() })
      .where(and(...conditions))

    return result.rowsAffected
  },

  // Transport needs
  async getTransportNeeds(
    registrationId: string,
    executor: DbExecutor = db,
  ): Promise<TransportNeedRow[]> {
    return executor
      .select()
      .from(registrationTransportNeed)
      .where(eq(registrationTransportNeed.registrationId, registrationId))
  },

  async createTransportNeeds(
    data: CreateTransportNeedData[],
    executor: DbExecutor = db,
  ): Promise<void> {
    if (data.length === 0) return

    await executor.insert(registrationTransportNeed).values(
      data.map((d) => ({
        id: newId(),
        registrationId: d.registrationId,
        leg: d.leg,
        needed: d.needed,
        pickupPointId: d.pickupPointId,
      })),
    )
  },

  async deleteTransportNeeds(registrationId: string, executor: DbExecutor = db): Promise<void> {
    await executor
      .delete(registrationTransportNeed)
      .where(eq(registrationTransportNeed.registrationId, registrationId))
  },

  async countByEvent(eventId: string, executor: DbExecutor = db): Promise<number> {
    const result = await executor
      .select({ value: count() })
      .from(registration)
      .where(eq(registration.eventId, eventId))
    return result[0]?.value ?? 0
  },

  async countParticipatingByEvent(eventId: string, executor: DbExecutor = db): Promise<number> {
    const result = await executor
      .select({ value: count() })
      .from(registration)
      .where(and(eq(registration.eventId, eventId), eq(registration.participating, true)))
    return result[0]?.value ?? 0
  },
}
