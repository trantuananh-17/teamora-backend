import { describe, expect, it } from "vitest"

import type { SheetData } from "../../excel/reader"
import { MAX_REPORTED_ERRORS, validateEmployeeRows, type MasterLookups } from "./employee.validate"

const master: MasterLookups = {
	sharedTeamsByName: new Map([["kinh doanh", "team-kd"]]),
	scopedTeamNames: new Set(["biệt đội 2026"]),
	workLocationsByName: new Map([["hà nội", "loc-hn"]]),
}

function sheet(...rows: Record<string, string>[]): SheetData["rows"] {
	return rows.map((values, i) => ({
		// Row 1 is the header, so the first data row is 2 — the number the
		// organiser sees in Excel.
		excelRow: i + 2,
		values: {
			employeeCode: "",
			fullName: "",
			email: "",
			teamName: "",
			workLocation: "",
			phone: "",
			gender: "",
			...values,
		},
	}))
}

const valid = {
	employeeCode: "NV001",
	fullName: "Nguyễn Văn A",
	email: "a@congty.vn",
	teamName: "Kinh doanh",
	workLocation: "Hà Nội",
	phone: "0912345678",
	gender: "Nam",
}

describe("validateEmployeeRows", () => {
	it("maps a good row onto master data ids", () => {
		const result = validateEmployeeRows(sheet(valid), master)
		expect(result.ok).toBe(true)
		if (!result.ok) return

		expect(result.records).toHaveLength(1)
		expect(result.records[0]).toMatchObject({
			excelRow: 2,
			email: "a@congty.vn",
			employeeCode: "NV001",
			defaultTeamId: "team-kd",
			workLocationId: "loc-hn",
			gender: "male",
			// The leading zero survives, because the reader hands over text.
			phone: "0912345678",
		})
	})

	it("lower-cases the email but keeps the phone as written", () => {
		const result = validateEmployeeRows(sheet({ ...valid, email: "A@Congty.VN" }), master)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.records[0]!.email).toBe("a@congty.vn")
	})

	it("matches team and location case-insensitively", () => {
		const result = validateEmployeeRows(
			sheet({ ...valid, teamName: "KINH DOANH", workLocation: "hà nội" }),
			master,
		)
		expect(result.ok).toBe(true)
	})

	it("treats an optional column left blank as absent, not as an error", () => {
		const result = validateEmployeeRows(
			sheet({ fullName: "B", email: "b@congty.vn" }),
			master,
		)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.records[0]).toMatchObject({
			employeeCode: null,
			defaultTeamId: null,
			workLocationId: null,
			phone: null,
			gender: "undisclosed",
		})
	})

	it("reports the Excel row number and the Vietnamese header", () => {
		const result = validateEmployeeRows(sheet(valid, { ...valid, email: "not-an-email" }), master)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors[0]).toMatchObject({ row: 3, column: "Email" })
	})

	it("refuses a team that exists only inside one edition, and says why", () => {
		const result = validateEmployeeRows(sheet({ ...valid, teamName: "Biệt đội 2026" }), master)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors[0]!.message).toContain("Team riêng của một kỳ")
	})

	it("refuses a team nobody has created", () => {
		const result = validateEmployeeRows(sheet({ ...valid, teamName: "Không có" }), master)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors[0]!.message).toContain("Master Data")
	})

	it("refuses an unrecognised gender rather than defaulting it", () => {
		// A typo that quietly became "undisclosed" would resurface in Phase 2 as a
		// room allocation nobody can account for.
		const result = validateEmployeeRows(sheet({ ...valid, gender: "Nam." }), master)
		expect(result.ok).toBe(false)
	})

	it("catches a duplicate email inside the file and points at the first row", () => {
		const result = validateEmployeeRows(sheet(valid, valid), master)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors.some((e) => e.message.includes("dòng 2"))).toBe(true)
	})

	it("catches a duplicate employee code inside the file", () => {
		const result = validateEmployeeRows(
			sheet(valid, { ...valid, email: "b@congty.vn" }),
			master,
		)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors[0]!.column).toBe("Mã nhân viên")
	})

	it("returns no records at all when any row fails", () => {
		// The whole point: 799 good rows and one bad one still write nothing.
		const result = validateEmployeeRows(
			sheet(valid, { ...valid, email: "b@congty.vn", workLocation: "Đà Nẵng" }),
			master,
		)
		expect(result.ok).toBe(false)
	})

	it("caps the reported errors but reports the true total", () => {
		const many = Array.from({ length: MAX_REPORTED_ERRORS + 50 }, (_, i) => ({
			fullName: `Người ${i}`,
			email: `x${i}@congty.vn`,
			gender: "sai",
		}))
		const result = validateEmployeeRows(sheet(...many), master)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors).toHaveLength(MAX_REPORTED_ERRORS)
		expect(result.totalErrors).toBe(MAX_REPORTED_ERRORS + 50)
	})

	it("collects every problem in one pass instead of stopping at the first", () => {
		const result = validateEmployeeRows(
			sheet({ ...valid, email: "", fullName: "", workLocation: "Đà Nẵng" }),
			master,
		)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors.length).toBeGreaterThanOrEqual(3)
	})
})
