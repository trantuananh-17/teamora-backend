import type { ColumnSpec } from "./reader"

export const flightColumns = [
	{ key: "code", header: "Mã chuyến", required: true },
	{ key: "direction", header: "Chiều", required: true },
	{ key: "departAt", header: "Giờ khởi hành", required: true },
	{ key: "arriveAt", header: "Giờ đến", required: true },
	{ key: "fromAirport", header: "Sân bay đi", required: true },
	{ key: "toAirport", header: "Sân bay đến", required: true },
	{ key: "capacity", header: "Sức chứa", required: true },
	{ key: "shift", header: "Ca", required: false },
	{ key: "note", header: "Ghi chú", required: false },
] as const satisfies readonly ColumnSpec[]

export const DIRECTION_LABELS = {
	đi: "outbound",
	di: "outbound",
	outbound: "outbound",
	về: "return",
	ve: "return",
	return: "return",
} as const

export const SHIFT_LABELS = {
	"ca 1": "shift_1",
	ca1: "shift_1",
	shift_1: "shift_1",
	"ca 2": "shift_2",
	ca2: "shift_2",
	shift_2: "shift_2",
} as const
