import ExcelJS from "exceljs"

import { env } from "../config/env"
import { ValidationError } from "../shared/errors"

/**
 * One error the organiser can act on. They are sitting in front of a spreadsheet,
 * not reading a log.
 */
export interface RowError {
	/** The row number **as Excel shows it**, header included, so Ctrl+G lands on it. */
	row: number
	/** The header the organiser sees ("Mã nhân viên"), not the field name. */
	column?: string
	message: string
}

export interface ColumnSpec {
	readonly key: string
	readonly header: string
	readonly required: boolean
}

/** A row of raw text, keyed by column key. Every value is trimmed; never a number. */
export type RawRow = Record<string, string>

export interface SheetData {
	rows: { excelRow: number; values: RawRow }[]
}

/** Excel puts the header on row 1, so the first data row is 2. */
const HEADER_ROW = 1

/**
 * Everything is read as text. Excel will happily hand back `912345678` for a
 * phone number typed as `0912345678`, and a date as a serial number — both are
 * silent corruption, and both are avoided by never asking for the typed value.
 */
function cellText(cell: ExcelJS.Cell): string {
	const value = cell.value

	if (value === null || value === undefined) return ""
	if (typeof value === "string") return value.trim()
	if (typeof value === "number" || typeof value === "boolean") return String(value).trim()
	if (value instanceof Date) return value.toISOString().trim()

	// A formula cell carries its computed result; a hyperlink and rich text carry
	// the visible text. `cell.text` is what the organiser actually sees.
	return String(cell.text ?? "").trim()
}

/**
 * Reads one sheet into trimmed text rows.
 *
 * Refuses the file whole rather than reading what it can: an import that half
 * understands its input is how a spreadsheet with a shifted column silently
 * loads four hundred people into the wrong fields.
 */
export async function readSheet(
	buffer: Buffer,
	columns: readonly ColumnSpec[],
): Promise<SheetData> {
	if (buffer.byteLength > env.import.maxFileBytes) {
		throw new ValidationError(
			`File vượt quá ${Math.floor(env.import.maxFileBytes / 1024 / 1024)}MB.`,
		)
	}

	const workbook = new ExcelJS.Workbook()
	try {
		await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
	} catch {
		// Never echo the parser's own message: it quotes file internals, and this
		// is untrusted input.
		throw new ValidationError("Không đọc được file. Hãy dùng định dạng .xlsx.")
	}

	const sheet = workbook.worksheets[0]
	if (!sheet) throw new ValidationError("File không có sheet nào.")

	// Header first, and a missing required column rejects the file before a single
	// row is read — there is nothing useful to say about rows whose columns are
	// not the ones we asked for.
	const headerRow = sheet.getRow(HEADER_ROW)
	const headerToIndex = new Map<string, number>()
	headerRow.eachCell((cell, colNumber) => {
		const text = cellText(cell)
		if (text) headerToIndex.set(text.toLowerCase(), colNumber)
	})

	const missing = columns
		.filter((column) => column.required && !headerToIndex.has(column.header.toLowerCase()))
		.map((column) => column.header)

	if (missing.length > 0) {
		throw new ValidationError(`File thiếu cột bắt buộc: ${missing.join(", ")}.`, {
			missingColumns: missing,
		})
	}

	// `rowCount` is the sheet's last used row, which is what a zip bomb inflates.
	// Checked before iterating, not while.
	const dataRowCount = Math.max(0, sheet.rowCount - HEADER_ROW)
	if (dataRowCount > env.import.maxRows) {
		throw new ValidationError(
			`File có ${dataRowCount} dòng, vượt giới hạn ${env.import.maxRows} dòng.`,
		)
	}

	const rows: SheetData["rows"] = []

	for (let excelRow = HEADER_ROW + 1; excelRow <= sheet.rowCount; excelRow++) {
		const row = sheet.getRow(excelRow)
		const values: RawRow = {}
		let hasAnyValue = false

		for (const column of columns) {
			const colNumber = headerToIndex.get(column.header.toLowerCase())
			const text = colNumber ? cellText(row.getCell(colNumber)) : ""
			values[column.key] = text
			if (text) hasAnyValue = true
		}

		// A wholly empty row is the trailing blank every hand-edited spreadsheet
		// carries, not a row the organiser meant to fill in.
		if (hasAnyValue) rows.push({ excelRow, values })
	}

	return { rows }
}
