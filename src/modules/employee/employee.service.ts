import { db } from "../../db/client"
import { GENDER_DISPLAY, employeeColumns } from "../../excel/employee.map"
import { readSheet, type RowError } from "../../excel/reader"
import { writeWorkbook } from "../../excel/writer"
import { ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import { auditService, type AuditActor } from "../audit/audit.service"
import { teamRepository } from "../team/team.repository"
import { workLocationRepository } from "../work-location/work-location.repository"
import {
	employeeRepository,
	type EmployeeListRow,
	type EmployeeSelfRow,
} from "./employee.repository"
import { validateEmployeeRows, type EmployeeRecord, type MasterLookups } from "./employee.validate"

const ENTITY = "employee_import"

export interface ImportSummary {
	fileName: string
	total: number
	created: number
	updated: number
}

export const employeeService = {
	async getMine(userId: string): Promise<EmployeeSelfRow> {
		const employee = await employeeRepository.findByUserId(userId)
		if (!employee) throw new ValidationError("Tài khoản không tồn tại.")
		return employee
	},

	async list(): Promise<EmployeeListRow[]> {
		return employeeRepository.list()
	},

	async exportWorkbook(actor: AuditActor): Promise<Buffer> {
		const [employees, locations, teams] = await Promise.all([
			employeeRepository.list(),
			workLocationRepository.list(),
			teamRepository.listAll(),
		])
		const locationById = new Map(locations.map((row) => [row.id, row.name]))
		const sharedTeams = teams.filter((row) => row.eventId === null)
		const teamById = new Map(sharedTeams.map((row) => [row.id, row.name]))

		const output = await writeWorkbook([
			{
				name: "Cán bộ nhân viên",
				// Same headers and labels as the import template, so an exported file
				// edited by HR imports back without renaming columns.
				columns: [
					...employeeColumns,
					{ key: "role", header: "Vai trò", required: true },
					{ key: "active", header: "Đang làm việc", required: true },
				],
				rows: employees.map((row) => ({
					employeeCode: row.employeeCode ?? "",
					fullName: row.name,
					email: row.email,
					phone: row.phone ?? "",
					workLocation: row.workLocationId
						? (locationById.get(row.workLocationId) ?? row.workLocationId)
						: "",
					teamName: row.defaultTeamId ? (teamById.get(row.defaultTeamId) ?? row.defaultTeamId) : "",
					gender: row.gender ? (GENDER_DISPLAY[row.gender] ?? row.gender) : "",
					role: row.role ?? "employee",
					active: row.active === false ? "Không" : "Có",
				})),
			},
			{
				name: "Địa điểm làm việc",
				columns: [
					{ key: "name", header: "Tên địa điểm", required: true },
					{ key: "active", header: "Đang dùng", required: true },
					{ key: "sortOrder", header: "Thứ tự", required: true },
				],
				rows: locations.map((row) => ({
					name: row.name,
					active: row.active ? "Có" : "Không",
					sortOrder: row.sortOrder,
				})),
			},
			{
				name: "Team dùng chung",
				columns: [
					{ key: "name", header: "Tên Team", required: true },
					{ key: "active", header: "Đang dùng", required: true },
					{ key: "sortOrder", header: "Thứ tự", required: true },
				],
				rows: sharedTeams.map((row) => ({
					name: row.name,
					active: row.active ? "Có" : "Không",
					sortOrder: row.sortOrder,
				})),
			},
		])

		await auditService.record({
			eventId: null,
			actor,
			entity: "employee",
			entityId: "master-data",
			action: "export",
			after: {
				employees: employees.length,
				workLocations: locations.length,
				sharedTeams: sharedTeams.length,
			},
		})
		return output
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
