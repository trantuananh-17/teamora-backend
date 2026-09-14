import { describe, expect, it } from "vitest"

import { validateFlightRows } from "./flight.validate"

function row(excelRow: number, values: Record<string, string>) {
	return { excelRow, values }
}

const valid = {
	code: "VN213",
	direction: "Đi",
	departAt: "12/10/2027 14:35",
	arriveAt: "12/10/2027 16:05",
	fromAirport: "HAN",
	toAirport: "DAD",
	capacity: "180",
	shift: "Ca 1",
	note: "",
}

describe("validateFlightRows", () => {
	it("normalizes a valid Vietnamese flight row", () => {
		const result = validateFlightRows([row(2, valid)])
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.records[0]).toMatchObject({
			code: "VN213",
			direction: "outbound",
			capacity: 180,
			shift: "shift_1",
		})
	})

	it("reports the visible column when arrival is before departure", () => {
		const result = validateFlightRows([row(7, { ...valid, arriveAt: "12/10/2027 13:00" })])
		expect(result).toMatchObject({
			ok: false,
			errors: [{ row: 7, column: "Giờ đến" }],
		})
	})

	it("rejects a duplicate code and direction inside the same file", () => {
		const result = validateFlightRows([row(2, valid), row(5, { ...valid, code: "vn213" })])
		expect(result).toMatchObject({
			ok: false,
			errors: [{ row: 5, column: "Mã chuyến" }],
		})
	})

	it("accepts the same code for the opposite direction", () => {
		const result = validateFlightRows([
			row(2, valid),
			row(3, {
				...valid,
				direction: "Về",
				departAt: "15/10/2027 10:00",
				arriveAt: "15/10/2027 11:30",
				fromAirport: "DAD",
				toAirport: "HAN",
			}),
		])
		expect(result.ok).toBe(true)
	})
})
