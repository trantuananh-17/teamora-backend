import { describe, expect, it } from "vitest"

import { listAuditLogsQuerySchema } from "./audit.dto"

describe("listAuditLogsQuerySchema", () => {
	it("trims supported filters and coerces date bounds", () => {
		const result = listAuditLogsQuerySchema.parse({
			search: "  Nguyễn An  ",
			entity: " flight_assignment ",
			action: " update ",
			from: "2026-09-01T00:00:00.000Z",
			to: "2026-09-30T23:59:59.999Z",
		})

		expect(result).toMatchObject({
			search: "Nguyễn An",
			entity: "flight_assignment",
			action: "update",
		})
		expect(result.from).toEqual(new Date("2026-09-01T00:00:00.000Z"))
	})

	it("rejects an inverted date range", () => {
		expect(() =>
			listAuditLogsQuerySchema.parse({
				from: "2026-09-30T00:00:00.000Z",
				to: "2026-09-01T00:00:00.000Z",
			}),
		).toThrow("Thời điểm kết thúc")
	})
})
