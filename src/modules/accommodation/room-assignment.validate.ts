import type { RowError } from "../../excel/reader"

export interface RoomImportRow {
	excelRow: number
	employeeCode: string
	hotelName: string
	roomCode: string
}
export interface RoomImportParticipant {
	registrationId: string
	employeeCode: string | null
}
export interface RoomImportTarget {
	roomId: string
	hotelName: string
	roomCode: string
	capacity: number
}
export interface ExistingManualRoomAssignment {
	registrationId: string
	roomId: string
}

export function validateRoomAssignments(
	rows: RoomImportRow[],
	participants: RoomImportParticipant[],
	rooms: RoomImportTarget[],
	manual: ExistingManualRoomAssignment[],
) {
	const people = new Map(
		participants
			.filter((row) => row.employeeCode)
			.map((row) => [row.employeeCode!.toLocaleLowerCase(), row]),
	)
	const roomMap = new Map(
		rooms.map((row) => [
			`${row.hotelName.toLocaleLowerCase()}|${row.roomCode.toLocaleLowerCase()}`,
			row,
		]),
	)
	const manualByRegistration = new Set(manual.map((row) => row.registrationId))
	const seen = new Set<string>()
	const errors: RowError[] = []
	const records: { roomId: string; registrationId: string }[] = []
	for (const row of rows) {
		const code = row.employeeCode.toLocaleLowerCase()
		const person = people.get(code)
		const target = roomMap.get(
			`${row.hotelName.toLocaleLowerCase()}|${row.roomCode.toLocaleLowerCase()}`,
		)
		if (!person)
			errors.push({
				row: row.excelRow,
				column: "Mã nhân viên",
				message: "Không tìm thấy CBNV tham gia kỳ này.",
			})
		if (seen.has(code))
			errors.push({
				row: row.excelRow,
				column: "Mã nhân viên",
				message: "Mã nhân viên bị lặp trong file.",
			})
		if (!target)
			errors.push({
				row: row.excelRow,
				column: "Mã phòng",
				message: "Không tìm thấy phòng trong khách sạn đã chọn.",
			})
		if (person && manualByRegistration.has(person.registrationId))
			errors.push({
				row: row.excelRow,
				column: "Mã nhân viên",
				message: "CBNV đang có phân phòng thủ công được khóa.",
			})
		seen.add(code)
		if (
			person &&
			target &&
			!manualByRegistration.has(person.registrationId) &&
			!seenDuplicate(rows, row)
		)
			records.push({ roomId: target.roomId, registrationId: person.registrationId })
	}
	const counts = new Map<string, number>()
	for (const row of manual) counts.set(row.roomId, (counts.get(row.roomId) ?? 0) + 1)
	for (const row of records) counts.set(row.roomId, (counts.get(row.roomId) ?? 0) + 1)
	for (const target of rooms)
		if ((counts.get(target.roomId) ?? 0) > target.capacity)
			errors.push({
				row: 1,
				column: "Mã phòng",
				message: `Phòng ${target.roomCode} vượt sức chứa ${target.capacity}.`,
			})
	return errors.length ? { ok: false as const, errors } : { ok: true as const, records }
}

function seenDuplicate(rows: RoomImportRow[], current: RoomImportRow) {
	return (
		rows.find(
			(row) => row.employeeCode.toLocaleLowerCase() === current.employeeCode.toLocaleLowerCase(),
		) !== current
	)
}
