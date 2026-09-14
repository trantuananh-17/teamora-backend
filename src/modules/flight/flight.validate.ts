import { DIRECTION_LABELS, flightColumns, SHIFT_LABELS } from "../../excel/flight.map"
import type { RowError, SheetData } from "../../excel/reader"
import type { FlightDirection, FlightShift } from "../../db/schema/flight.schema"

export interface FlightImportRecord {
	excelRow: number
	code: string
	direction: FlightDirection
	departAt: Date
	arriveAt: Date
	fromAirport: string
	toAirport: string
	capacity: number
	shift: FlightShift | null
	note: string | null
}

export type FlightValidationOutcome =
	| { ok: true; records: FlightImportRecord[] }
	| { ok: false; errors: RowError[]; totalErrors: number }

const headers = Object.fromEntries(
	flightColumns.map((column) => [column.key, column.header]),
) as Record<string, string>

export function validateFlightRows(rows: SheetData["rows"]): FlightValidationOutcome {
	const errors: RowError[] = []
	const records: FlightImportRecord[] = []
	const seen = new Map<string, number>()

	for (const { excelRow, values } of rows) {
		const before = errors.length
		const add = (column: string, message: string) => errors.push({ row: excelRow, column, message })
		const code = values.code?.toUpperCase() ?? ""
		if (!code) add(headers.code!, "Thiếu mã chuyến.")
		else if (!/^[A-Z0-9_-]{1,32}$/.test(code)) {
			add(headers.code!, "Mã chuyến chỉ gồm chữ, số, gạch ngang và gạch dưới.")
		}

		const direction =
			DIRECTION_LABELS[(values.direction?.toLowerCase() ?? "") as keyof typeof DIRECTION_LABELS]
		if (!direction) add(headers.direction!, "Chiều nhận một trong các giá trị: Đi, Về.")

		const departAt = parseFlightDate(values.departAt ?? "")
		if (!departAt) add(headers.departAt!, "Ngày giờ không hợp lệ. Dùng định dạng dd/MM/yyyy HH:mm.")
		const arriveAt = parseFlightDate(values.arriveAt ?? "")
		if (!arriveAt) add(headers.arriveAt!, "Ngày giờ không hợp lệ. Dùng định dạng dd/MM/yyyy HH:mm.")
		if (departAt && arriveAt && arriveAt <= departAt) {
			add(headers.arriveAt!, "Giờ đến phải sau giờ khởi hành.")
		}

		const fromAirport = values.fromAirport ?? ""
		const toAirport = values.toAirport ?? ""
		if (!fromAirport) add(headers.fromAirport!, "Thiếu sân bay đi.")
		if (!toAirport) add(headers.toAirport!, "Thiếu sân bay đến.")

		const capacity = Number(values.capacity)
		if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10_000) {
			add(headers.capacity!, "Sức chứa phải là số nguyên từ 0 đến 10000.")
		}

		const rawShift = values.shift?.toLowerCase() ?? ""
		const shift = rawShift ? SHIFT_LABELS[rawShift as keyof typeof SHIFT_LABELS] : null
		if (rawShift && !shift) add(headers.shift!, "Ca nhận một trong các giá trị: Ca 1, Ca 2.")

		if (code && direction) {
			const key = `${code}:${direction}`
			const first = seen.get(key)
			if (first !== undefined) add(headers.code!, `Chuyến cùng mã và chiều đã có ở dòng ${first}.`)
			else seen.set(key, excelRow)
		}

		if (errors.length === before && direction && departAt && arriveAt) {
			records.push({
				excelRow,
				code,
				direction,
				departAt,
				arriveAt,
				fromAirport,
				toAirport,
				capacity,
				shift: shift ?? null,
				note: values.note || null,
			})
		}
	}

	return errors.length > 0
		? { ok: false, errors: errors.slice(0, 100), totalErrors: errors.length }
		: { ok: true, records }
}

function parseFlightDate(value: string): Date | null {
	const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(value)
	if (local) {
		const [, day, month, year, hour, minute] = local
		const parsed = new Date(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
		)
		if (
			parsed.getFullYear() !== Number(year) ||
			parsed.getMonth() !== Number(month) - 1 ||
			parsed.getDate() !== Number(day) ||
			parsed.getHours() !== Number(hour) ||
			parsed.getMinutes() !== Number(minute)
		)
			return null
		return parsed
	}
	const timestamp = Date.parse(value)
	return Number.isNaN(timestamp) ? null : new Date(timestamp)
}
