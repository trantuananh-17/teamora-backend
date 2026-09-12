import type { ColumnSpec } from "./reader"

export const roomAssignmentColumns = [
	{ key: "employeeCode", header: "Mã nhân viên", required: true },
	{ key: "hotelName", header: "Khách sạn", required: true },
	{ key: "roomCode", header: "Mã phòng", required: true },
] as const satisfies readonly ColumnSpec[]
