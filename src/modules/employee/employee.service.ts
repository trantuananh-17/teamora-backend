import { db } from "../../db/client"
import { employeeColumns } from "../../excel/employee.map"
import { readSheet, type RowError } from "../../excel/reader"
import { ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import { teamRepository } from "../team/team.repository"
import { workLocationRepository } from "../work-location/work-location.repository"
import { employeeRepository, type EmployeeListRow } from "./employee.repository"
import {
	validateEmployeeRows,
	type EmployeeRecord,
	type MasterLookups,
} from "./employee.validate"

const ENTITY = "employee_import"

export interface ImportSummary {
	fileName: string
	total: number
	created: number
	updated: number
}

export const employeeService = {
	async list(): Promise<EmployeeListRow[]> {
		return employeeRepository.list()
	},

	/**
	 * Reads the sheet, checks every row, and only then writes — all of it, or none
	 * of it.
	 *
	 * A file that fails on row 500 having already written 499 people leaves a
	 * state nobody can describe: the organiser cannot tell whether to fix the file
	 * and re-run it whole, or to import only what is missing. Refusing outright
	 * makes the answer always "fix it and upload again".
	 */
	async importFromExcel(
		fileName: string,
		buffer: Buffer,
		actor: AuditActor,
	): Promise<ImportSummary> {
		const sheet = await readSheet(buffer, employeeColumns)
		if (sheet.rows.length === 0) throw new ValidationError("File không có dòng dữ liệu nào.")

		const master = await loadMasterLookups()
		const outcome = validateEmployeeRows(sheet.rows, master)

		if (!outcome.ok) {
			throw new ValidationError(
				`File có ${outcome.totalErrors} lỗi. Chưa ghi dòng nào — sửa file rồi import lại.`,
				{ totalErrors: outcome.totalErrors, errors: outcome.errors },
			)
		}

		const { records } = outcome
		const emails = records.map((r) => r.email)
		const existingUsers = await employeeRepository.findUserIdsByEmails(emails)

		await assertEmployeeCodesAreFree(records, existingUsers)

		const existingProfiles = await employeeRepository.findProfileUserIds([
			...existingUsers.values(),
		])

		let created = 0
		let updated = 0

		// Everything above is reads and pure computation, so the write window stays
		// short — SQLite has one writer and a long transaction blocks every request.
		await db.transaction(async (tx) => {
			for (const record of records) {
				const existingUserId = existingUsers.get(record.email)

				if (existingUserId) {
					await employeeRepository.updateUserName(existingUserId, record.fullName, tx)
					const profileFields = {
						employeeCode: record.employeeCode,
						phone: record.phone,
						workLocationId: record.workLocationId,
						defaultTeamId: record.defaultTeamId,
						gender: record.gender,
					}
					if (existingProfiles.has(existingUserId)) {
						await employeeRepository.updateProfile(existingUserId, profileFields, tx)
					} else {
						await employeeRepository.insertProfile(
							{ id: newId(), userId: existingUserId, ...profileFields },
							tx,
						)
					}
					updated++
					continue
				}

				const userId = newId()
				await employeeRepository.insertUser(
					{ id: userId, name: record.fullName, email: record.email, role: "employee" },
					tx,
				)
				await employeeRepository.insertProfile(
					{
						id: newId(),
						userId,
						employeeCode: record.employeeCode,
						phone: record.phone,
						workLocationId: record.workLocationId,
						defaultTeamId: record.defaultTeamId,
						gender: record.gender,
					},
					tx,
				)
				created++
			}

			// One entry for the import, not one per row. Eight hundred entries for a
			// single action would wash every other change out of the trail.
			await auditService.record(
				{
					// Employees belong to the company, not to an edition.
					eventId: null,
					actor,
					entity: ENTITY,
					entityId: newId(),
					action: "import",
					after: { fileName, total: records.length, created, updated },
				},
				tx,
			)
		})

		return { fileName, total: records.length, created, updated }
	},
}

/**
 * Only shared teams may be a person's default: `employee_profile` outlives
 * editions, so pointing at an edition-scoped team would dangle. Scoped names are
 * collected too, so the error can explain that rather than claim the team does
 * not exist.
 */
async function loadMasterLookups(): Promise<MasterLookups> {
	const [teams, locations] = await Promise.all([
		teamRepository.listAll(),
		workLocationRepository.list(),
	])

	const sharedTeamsByName = new Map<string, string>()
	const scopedTeamNames = new Set<string>()
	for (const row of teams) {
		if (row.eventId === null) sharedTeamsByName.set(row.name.toLowerCase(), row.id)
		else scopedTeamNames.add(row.name.toLowerCase())
	}

	return {
		sharedTeamsByName,
		scopedTeamNames,
		workLocationsByName: new Map(locations.map((l) => [l.name.toLowerCase(), l.id])),
	}
}

/**
 * A code already held by somebody else. The unique index would refuse it too,
 * but only after the transaction had begun and as a message quoting an index
 * name — this says which row and which person instead.
 */
async function assertEmployeeCodesAreFree(
	records: EmployeeRecord[],
	existingUsers: ReadonlyMap<string, string>,
) {
	const codes = records.map((r) => r.employeeCode).filter((c): c is string => c !== null)
	if (codes.length === 0) return

	const holders = await employeeRepository.findUserIdsByEmployeeCodes(codes)
	const errors: RowError[] = []

	for (const record of records) {
		if (!record.employeeCode) continue
		const holder = holders.get(record.employeeCode)
		if (holder && holder !== existingUsers.get(record.email)) {
			errors.push({
				row: record.excelRow,
				column: "Mã nhân viên",
				message: `Mã "${record.employeeCode}" đang thuộc về một CBNV khác trong hệ thống.`,
			})
		}
	}

	if (errors.length > 0) {
		throw new ValidationError(
			`File có ${errors.length} lỗi. Chưa ghi dòng nào — sửa file rồi import lại.`,
			{ totalErrors: errors.length, errors },
		)
	}
}
