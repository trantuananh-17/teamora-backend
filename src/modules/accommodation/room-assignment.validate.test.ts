import { describe, expect, it } from "vitest"
import { validateRoomAssignments } from "./room-assignment.validate"

const participants = [
	{ registrationId: "r1", employeeCode: "NV001" },
	{ registrationId: "r2", employeeCode: "NV002" },
]
const rooms = [{ roomId: "room-1", hotelName: "Ocean", roomCode: "A101", capacity: 2 }]
const row = (excelRow: number, employeeCode: string) => ({
	excelRow,
	employeeCode,
	hotelName: "Ocean",
	roomCode: "A101",
})

describe("validateRoomAssignments", () => {
	it("maps a valid file without writing partial data", () => {
		expect(validateRoomAssignments([row(2, "nv001")], participants, rooms, [])).toEqual({
			ok: true,
			records: [{ roomId: "room-1", registrationId: "r1" }],
		})
	})
	it("reports unknown employees and rooms by Excel row", () => {
		const result = validateRoomAssignments(
			[{ excelRow: 4, employeeCode: "bad", hotelName: "Other", roomCode: "X" }],
			participants,
			rooms,
			[],
		)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.errors.every((error) => error.row === 4)).toBe(true)
	})
	it("rejects duplicate employees", () => {
		const result = validateRoomAssignments(
			[row(2, "NV001"), row(3, "nv001")],
			participants,
			rooms,
			[],
		)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.errors.some((error) => error.message.includes("lặp"))).toBe(true)
	})
	it("counts manual assignments when enforcing capacity", () => {
		const result = validateRoomAssignments(
			[row(2, "NV001"), row(3, "NV002")],
			participants,
			rooms,
			[{ registrationId: "locked", roomId: "room-1" }],
		)
		expect(result.ok).toBe(false)
		if (!result.ok)
			expect(result.errors.some((error) => error.message.includes("vượt sức chứa"))).toBe(true)
	})
	it("preserves manual assignments", () => {
		const result = validateRoomAssignments([row(2, "NV001")], participants, rooms, [
			{ registrationId: "r1", roomId: "room-1" },
		])
		expect(result.ok).toBe(false)
		if (!result.ok)
			expect(result.errors.some((error) => error.message.includes("thủ công"))).toBe(true)
	})
})
