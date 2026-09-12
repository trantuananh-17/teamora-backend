import ExcelJS from "exceljs"

import type { ColumnSpec } from "./reader"

/** Writes the same visible column map the importer reads, so export can be edited and re-imported. */
export async function writeSheet(
	name: string,
	columns: readonly ColumnSpec[],
	rows: readonly Record<string, string | number | null>[],
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	const sheet = workbook.addWorksheet(name)
	sheet.columns = columns.map((column) => ({
		header: column.header,
		key: column.key,
		width: Math.max(14, column.header.length + 4),
	}))
	for (const row of rows) sheet.addRow(row)
	sheet.getRow(1).font = { bold: true }
	sheet.views = [{ state: "frozen", ySplit: 1 }]
	const output = await workbook.xlsx.writeBuffer()
	return Buffer.from(output)
}
