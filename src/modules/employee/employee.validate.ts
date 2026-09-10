import { z } from "zod"

import { GENDER_HINT, GENDER_LABELS, employeeColumns } from "../../excel/employee.map"
import type { RowError, SheetData } from "../../excel/reader"
import type { Gender } from "../../db/schema/employee.schema"

/**
 * A file's worth of errors nobody will read is worse than the first hundred.
 * A sheet with one shifted column produces an error on every row.
 */
export const MAX_REPORTED_ERRORS = 100

export interface EmployeeRecord {
	excelRow: number
	email: string
	fullName: string
	employeeCode: string | null
	phone: string | null
	workLocationId: string | null
	defaultTeamId: string | null
	gender: Gender
}

/** Name → id, for the master data the sheet refers to by name. */
export interface MasterLookups {
	/** Shared teams only — `team.eventId is null`. Keyed by lower-cased name. */
	sharedTeamsByName: ReadonlyMap<string, string>
	/** Edition-scoped team names, so the error can say why the name is refused. */
	scopedTeamNames: ReadonlySet<string>
	workLocationsByName: ReadonlyMap<string, string>
}

export type ValidationOutcome =
	| { ok: true; records: EmployeeRecord[] }
	| { ok: false; errors: RowError[]; totalErrors: number }

const header = Object.fromEntries(employeeColumns.map((c) => [c.key, c.header])) as Record<
	string,
	string
>

const emailSchema = z.email()

/**
 * Validates the whole sheet and writes nothing. Pure: no database, no clock.
 *
 * That purity is the point. This is where a bad import is stopped, and it is the
 * only part of the flow that can be tested without a database — which is what
 * `.claude/rules/conventions.md` asks for by name.
 *
 * Every row is checked even after the first failure, so the organiser fixes the
 * file once instead of discovering the next problem on the next upload.
 */
export function validateEmployeeRows(
	rows: SheetData["rows"],
	master: MasterLookups,
): ValidationOutcome {
	const errors: RowError[] = []
	const records: EmployeeRecord[] = []

	// Duplicates inside the file are the file's problem, not the database's, and
	// they have to be caught before the write — an upsert would otherwise apply
	// both rows and keep whichever came last, silently.
	const seenEmail = new Map<string, number>()
	const seenCode = new Map<string, number>()

	const add = (row: number, column: string | undefined, message: string) => {
		errors.push({ row, column, message })
	}

	for (const { excelRow, values } of rows) {
		const before = errors.length

		const email = values.email?.toLowerCase() ?? ""
		if (!email) {
			add(excelRow, header.email, "Thiếu email.")
		} else if (!emailSchema.safeParse(email).success) {
			add(excelRow, header.email, `"${values.email}" không phải email hợp lệ.`)
		} else {
			const first = seenEmail.get(email)
			if (first !== undefined) {
				add(excelRow, header.email, `Email này đã xuất hiện ở dòng ${first}.`)
			} else {
				seenEmail.set(email, excelRow)
			}
		}

		const fullName = values.fullName ?? ""
		if (!fullName) add(excelRow, header.fullName, "Thiếu họ và tên.")

		const rawCode = values.employeeCode ?? ""
		let employeeCode: string | null = null
		if (rawCode) {
			const first = seenCode.get(rawCode)
			if (first !== undefined) {
				add(excelRow, header.employeeCode, `Mã nhân viên này đã xuất hiện ở dòng ${first}.`)
			} else {
				seenCode.set(rawCode, excelRow)
				employeeCode = rawCode
			}
		}

		let defaultTeamId: string | null = null
		const teamName = values.teamName ?? ""
		if (teamName) {
			const found = master.sharedTeamsByName.get(teamName.toLowerCase())
			if (found) {
				defaultTeamId = found
			} else if (master.scopedTeamNames.has(teamName.toLowerCase())) {
				// The name exists, but only inside one edition. An employee profile
				// outlives editions, so it cannot point there.
				add(
					excelRow,
					header.teamName,
					`Team "${teamName}" là Team riêng của một kỳ nên không dùng làm Team mặc định của CBNV. Tạo một Team dùng chung cùng tên ở màn hình Master Data.`,
				)
			} else {
				add(
					excelRow,
					header.teamName,
					`Team "${teamName}" không có trong danh sách Team. Thêm Team này ở màn hình Master Data trước khi import.`,
				)
			}
		}

		let workLocationId: string | null = null
		const locationName = values.workLocation ?? ""
		if (locationName) {
			const found = master.workLocationsByName.get(locationName.toLowerCase())
			if (found) {
				workLocationId = found
			} else {
				add(
					excelRow,
					header.workLocation,
					`Địa điểm làm việc "${locationName}" không có trong danh sách. Thêm ở màn hình Master Data trước khi import.`,
				)
			}
		}

		let gender: Gender = "undisclosed"
		const rawGender = values.gender ?? ""
		if (rawGender) {
			const mapped = GENDER_LABELS[rawGender.toLowerCase()]
			if (mapped) {
				gender = mapped
			} else {
				add(excelRow, header.gender, `"${rawGender}" không hợp lệ. ${GENDER_HINT}`)
			}
		}

		if (errors.length === before) {
			records.push({
				excelRow,
				email,
				fullName,
				employeeCode,
				phone: values.phone || null,
				workLocationId,
				defaultTeamId,
				gender,
			})
		}
	}

	if (errors.length > 0) {
		return { ok: false, errors: errors.slice(0, MAX_REPORTED_ERRORS), totalErrors: errors.length }
	}
	return { ok: true, records }
}
