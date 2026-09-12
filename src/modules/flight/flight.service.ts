import { db } from "../../db/client"
import type { AllocationFlag, FlightDirection } from "../../db/schema/flight.schema"
import { flightColumns } from "../../excel/flight.map"
import { readSheet, type RowError } from "../../excel/reader"
import { writeSheet } from "../../excel/writer"
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { page, type Page, type PaginationQuery } from "../../shared/pagination"
import { auditService, type AuditActor } from "../audit/audit.service"
import { notificationService } from "../notification/notification.service"
import type {
	CreateFlightInput,
	ListFlightAssignmentsQuery,
	ListFlightsQuery,
	ManualAssignFlightInput,
	SetFlightAssignmentLockInput,
	UpdateFlightInput,
} from "./flight.dto"
import {
	flightRepository,
	type AllocationRegistrationRow,
	type AssignmentDetailRow,
	type FlightAssignmentRow,
	type FlightRow,
	type FlightWithOccupancy,
} from "./flight.repository"
import { validateFlightRows } from "./flight.validate"

const FLIGHT_ENTITY = "flight"
const ASSIGNMENT_ENTITY = "flight_assignment"

export interface AssignmentView {
	id: string
	flight: FlightRow
	source: "auto" | "manual"
	locked: boolean
	flags: AllocationFlag[]
	assignedAt: Date
}

export interface RegistrationFlightView {
	registrationId: string
	user: { name: string; email: string }
	team: { id: string; name: string }
	shiftPreference: "shift_1" | "shift_2" | null
	shiftLocked: boolean
	assignments: {
		outbound: AssignmentView | null
		return: AssignmentView | null
	}
}

export const flightService = {
	async list(
		eventId: string,
		query: ListFlightsQuery,
		pagination: PaginationQuery,
	): Promise<Page<FlightWithOccupancy>> {
		const result = await flightRepository.list(eventId, query, pagination)
		return page(result.items, result.total, pagination)
	},

	async create(
		eventId: string,
		input: CreateFlightInput,
		actor: AuditActor,
	): Promise<FlightWithOccupancy> {
		const code = input.code.toUpperCase()
		if (await flightRepository.findByCodeDirection(eventId, code, input.direction)) {
			throw new ConflictError(`Kỳ này đã có chuyến ${code} cho chiều đã chọn.`)
		}
		return db.transaction(async (tx) => {
			const created = await flightRepository.insert(
				{ id: newId(), eventId, ...input, code },
				tx,
			)
			await auditService.record(
				{
					eventId,
					actor,
					entity: FLIGHT_ENTITY,
					entityId: created.id,
					action: "create",
					after: created,
				},
				tx,
			)
			return { ...created, assignedCount: 0 }
		})
	},

	async update(
		eventId: string,
		flightId: string,
		input: UpdateFlightInput,
		actor: AuditActor,
	): Promise<{ flight: FlightWithOccupancy; warnings: string[] }> {
		const before = await flightRepository.findById(eventId, flightId)
		if (!before) throw new NotFoundError("Flight")
		const nextCode = input.code?.toUpperCase() ?? before.code
		const nextDirection = input.direction ?? before.direction
		const nextDepartAt = input.departAt ?? before.departAt
		const nextArriveAt = input.arriveAt ?? before.arriveAt
		if (nextArriveAt <= nextDepartAt) throw new ValidationError("Giờ đến phải sau giờ khởi hành.")
		if (nextDirection !== before.direction && before.assignedCount > 0) {
			throw new ConflictError("Không thể đổi chiều của chuyến đã có người được phân bổ.")
		}
		const collision = await flightRepository.findByCodeDirection(eventId, nextCode, nextDirection)
		if (collision && collision.id !== flightId) {
			throw new ConflictError(`Kỳ này đã có chuyến ${nextCode} cho chiều đã chọn.`)
		}

		const affected = (await flightRepository.listAssignments(eventId)).filter((row) => row.assignment.flightId === flightId).map((row) => row.assignment.registrationId)
		return db.transaction(async (tx) => {
			const updated = await flightRepository.update(
				eventId,
				flightId,
				{ ...input, code: nextCode },
				tx,
			)
			if (!updated) throw new NotFoundError("Flight")
			const after = { ...updated, assignedCount: before.assignedCount }
			await auditService.record(
				{
					eventId,
					actor,
					entity: FLIGHT_ENTITY,
					entityId: flightId,
					action: "update",
					before,
					after,
				},
				tx,
			)
			await notificationService.scheduleChangesIfPublished(eventId, affected, "flight", tx)
			const warnings =
				after.assignedCount > after.capacity
					? [`Chuyến ${after.code} đang vượt ${after.assignedCount - after.capacity} chỗ.`]
					: []
			return { flight: after, warnings }
		})
	},

	async delete(eventId: string, flightId: string, actor: AuditActor): Promise<void> {
		const before = await flightRepository.findById(eventId, flightId)
		if (!before) throw new NotFoundError("Flight")
		if (before.assignedCount > 0) {
			throw new ConflictError("Không thể xóa chuyến đang có người được phân bổ.")
		}
		await db.transaction(async (tx) => {
			if (!(await flightRepository.delete(eventId, flightId, tx))) throw new NotFoundError("Flight")
			await auditService.record(
				{
					eventId,
					actor,
					entity: FLIGHT_ENTITY,
					entityId: flightId,
					action: "delete",
					before,
				},
				tx,
			)
		})
	},

	async importFromExcel(
		eventId: string,
		fileName: string,
		buffer: Buffer,
		actor: AuditActor,
	): Promise<{ fileName: string; total: number; created: number; updated: number }> {
		const sheet = await readSheet(buffer, flightColumns)
		if (sheet.rows.length === 0) throw new ValidationError("File không có dòng dữ liệu nào.")
		const outcome = validateFlightRows(sheet.rows)
		if (!outcome.ok) {
			throw new ValidationError(
				`File có ${outcome.totalErrors} lỗi. Chưa ghi dòng nào — sửa file rồi import lại.`,
				{ totalErrors: outcome.totalErrors, errors: outcome.errors },
			)
		}

		const current = await flightRepository.listAll(eventId)
		const currentByKey = new Map(current.map((row) => [`${row.code}:${row.direction}`, row]))
		const capacityErrors: RowError[] = []
		for (const record of outcome.records) {
			const existing = currentByKey.get(`${record.code}:${record.direction}`)
			if (existing && record.capacity < existing.assignedCount) {
				capacityErrors.push({
					row: record.excelRow,
					column: "Sức chứa",
					message: `Chuyến đang có ${existing.assignedCount} người, không thể giảm còn ${record.capacity}.`,
				})
			}
		}
		if (capacityErrors.length > 0) {
			throw new ValidationError(
				`File có ${capacityErrors.length} lỗi. Chưa ghi dòng nào — sửa file rồi import lại.`,
				{ totalErrors: capacityErrors.length, errors: capacityErrors },
			)
		}

		let created = 0
		let updated = 0
		await db.transaction(async (tx) => {
			for (const record of outcome.records) {
				const { excelRow: _excelRow, ...fields } = record
				const existing = currentByKey.get(`${record.code}:${record.direction}`)
				if (existing) {
					await flightRepository.update(eventId, existing.id, fields, tx)
					updated++
				} else {
					await flightRepository.insert({ id: newId(), eventId, ...fields }, tx)
					created++
				}
			}
			await auditService.record(
				{
					eventId,
					actor,
					entity: "flight_import",
					entityId: newId(),
					action: "import",
					after: { fileName, total: outcome.records.length, created, updated },
				},
				tx,
			)
		})
		return { fileName, total: outcome.records.length, created, updated }
	},

	async exportExcel(eventId: string, actor: AuditActor): Promise<Buffer> {
		const rows = await flightRepository.listAll(eventId)
		await auditService.record({
			eventId,
			actor,
			entity: FLIGHT_ENTITY,
			entityId: eventId,
			action: "export",
			after: { rows: rows.length },
		})
		return writeSheet(
			"Chuyến bay",
			flightColumns,
			rows.map((row) => ({
				code: row.code,
				direction: row.direction === "outbound" ? "Đi" : "Về",
				departAt: formatImportDate(row.departAt),
				arriveAt: formatImportDate(row.arriveAt),
				fromAirport: row.fromAirport,
				toAirport: row.toAirport,
				capacity: row.capacity,
				shift: row.shift === "shift_1" ? "Ca 1" : row.shift === "shift_2" ? "Ca 2" : "",
				note: row.note ?? "",
			})),
		)
	},

	async listAssignments(
		eventId: string,
		query: ListFlightAssignmentsQuery,
		pagination: PaginationQuery,
	): Promise<Page<RegistrationFlightView>> {
		const [registrations, assignments] = await Promise.all([
			flightRepository.listParticipatingRegistrations(eventId),
			flightRepository.listAssignments(eventId),
		])
		const byRegistration = assignmentMap(assignments)
		let views = registrations.map((row) => registrationView(row, byRegistration.get(row.id) ?? []))
		if (query.search) {
			const needle = query.search.toLocaleLowerCase("vi")
			views = views.filter(
				(row) =>
					row.user.name.toLocaleLowerCase("vi").includes(needle) ||
					row.user.email.toLocaleLowerCase("vi").includes(needle),
			)
		}
		if (query.teamId) views = views.filter((row) => row.team.id === query.teamId)
		if (query.flag) {
			views = views.filter((row) =>
				[row.assignments.outbound, row.assignments.return].some((item) =>
					item?.flags.includes(query.flag!),
				),
			)
		}
		return page(views.slice(pagination.offset, pagination.offset + pagination.limit), views.length, pagination)
	},

	async manualAssign(
		eventId: string,
		input: ManualAssignFlightInput,
		actor: AuditActor,
	): Promise<{ updated: number; warnings: string[] }> {
		return db.transaction(async (tx) => {
			const target = await flightRepository.findById(eventId, input.flightId, tx)
			if (!target) throw new NotFoundError("Flight")
			const registrations = input.teamId
				? (await flightRepository.listParticipatingRegistrations(eventId, tx)).filter(
						(row) => row.teamId === input.teamId,
					)
				: await flightRepository.findParticipatingRegistrationsByIds(
						eventId,
						input.registrationIds ?? [],
						tx,
					)
			if (
				registrations.length === 0 ||
				(input.registrationIds && registrations.length !== new Set(input.registrationIds).size)
			) {
				throw new NotFoundError(input.teamId ? "Team registrations" : "Registration")
			}
			const registrationIds = registrations.map((row) => row.id)
			const before = await flightRepository.findAssignmentsForRegistrations(
				eventId,
				registrationIds,
				target.direction,
				tx,
			)
			const alreadyOnTarget = before.filter((row) => row.assignment.flightId === target.id).length
			const finalOccupancy = target.assignedCount - alreadyOnTarget + registrations.length
			const warnings: string[] = []
			if (finalOccupancy > target.capacity) {
				warnings.push(`Chuyến ${target.code} vượt ${finalOccupancy - target.capacity} chỗ sau điều chỉnh.`)
			}

			const rows = registrations.map((row) => {
				const flags: AllocationFlag[] = []
				if (finalOccupancy > target.capacity) flags.push("over_capacity")
				if (row.shiftPreference && target.shift && row.shiftPreference !== target.shift) {
					if (row.shiftLocked) {
						flags.push("shift_locked_unmet")
						warnings.push(`${row.user.name} đang bị chuyển lệch ca bắt buộc.`)
					} else {
						flags.push("shift_unmet")
					}
				}
				return { registrationId: row.id, flags }
			})

			await flightRepository.upsertManualAssignments(
				eventId,
				target.id,
				target.direction,
				actor.id,
				rows,
				tx,
			)
			const after = await flightRepository.findAssignmentsForRegistrations(
				eventId,
				registrationIds,
				target.direction,
				tx,
			)
			await auditService.record(
				{
					eventId,
					actor,
					entity: ASSIGNMENT_ENTITY,
					entityId: target.id,
					action: "manual_assign",
					before,
					after,
					reason: input.reason,
				},
				tx,
			)
			await notificationService.scheduleChangesIfPublished(eventId, registrationIds, "flight", tx)
			return { updated: registrations.length, warnings: [...new Set(warnings)] }
		})
	},

	async setAssignmentLock(
		eventId: string,
		assignmentId: string,
		input: SetFlightAssignmentLockInput,
		actor: AuditActor,
	): Promise<FlightAssignmentRow> {
		return db.transaction(async (tx) => {
			const before = await flightRepository.findAssignmentById(eventId, assignmentId, tx)
			if (!before) throw new NotFoundError("Flight assignment")
			const after = await flightRepository.setAssignmentLock(eventId, assignmentId, input.locked, tx)
			if (!after) throw new NotFoundError("Flight assignment")
			await auditService.record(
				{
					eventId,
					actor,
					entity: ASSIGNMENT_ENTITY,
					entityId: assignmentId,
					action: input.locked ? "lock" : "unlock",
					before: before.assignment,
					after,
					reason: input.reason,
				},
				tx,
			)
			return after
		})
	},
}

function assignmentMap(rows: AssignmentDetailRow[]) {
	const result = new Map<string, AssignmentDetailRow[]>()
	for (const row of rows) {
		const values = result.get(row.assignment.registrationId) ?? []
		values.push(row)
		result.set(row.assignment.registrationId, values)
	}
	return result
}

function registrationView(
	registration: AllocationRegistrationRow,
	assignments: AssignmentDetailRow[],
): RegistrationFlightView {
	const view = (direction: FlightDirection): AssignmentView | null => {
		const row = assignments.find((item) => item.assignment.direction === direction)
		return row
			? {
					id: row.assignment.id,
					flight: row.flight,
					source: row.assignment.source,
					locked: row.assignment.locked,
					flags: row.assignment.flags,
					assignedAt: row.assignment.assignedAt,
				}
			: null
	}
	return {
		registrationId: registration.id,
		user: registration.user,
		team: registration.team,
		shiftPreference: registration.shiftPreference,
		shiftLocked: registration.shiftLocked,
		assignments: { outbound: view("outbound"), return: view("return") },
	}
}

function formatImportDate(value: Date): string {
	const part = (number: number) => String(number).padStart(2, "0")
	return `${part(value.getDate())}/${part(value.getMonth() + 1)}/${value.getFullYear()} ${part(value.getHours())}:${part(value.getMinutes())}`
}
