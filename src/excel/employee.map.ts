import type { ColumnSpec } from "./reader"

/**
 * The employee sheet, declared once. The download template, the import reader
 * and the export writer all read this — three separate declarations would be
 * three things to keep in step, and an export that cannot be re-imported.
 *
 * "Họ và tên" lands on `user.name`. There is no `employee_profile.fullName`;
 * see DATA-MODEL.md.
 *
 * "Bộ phận/Team" lands on `employee_profile.defaultTeamId` and must name a
 * **shared** team. It pre-fills the registration form; what the employee
 * confirms there becomes `registration.teamId`, and that is what the allocator
 * reads (§4.2).
 */
export const employeeColumns = [
	{ key: "employeeCode", header: "Mã nhân viên", required: false },
	{ key: "fullName", header: "Họ và tên", required: true },
	{ key: "email", header: "Email", required: true },
	{ key: "teamName", header: "Bộ phận/Team", required: false },
	{ key: "workLocation", header: "Địa điểm làm việc", required: false },
	{ key: "phone", header: "Số điện thoại", required: false },
	{ key: "gender", header: "Giới tính", required: false },
] as const satisfies readonly ColumnSpec[]

/**
 * What the organisers may write in the Giới tính column. Vietnamese, because the
 * file is filled in by Vietnamese HR staff, and the stored value is the enum.
 *
 * An unrecognised value is a row error rather than a silent `undisclosed`: a
 * typo that quietly becomes "not disclosed" resurfaces in Phase 2 as a room
 * allocation nobody can explain.
 */
export const GENDER_LABELS: Record<string, "male" | "female" | "other" | "undisclosed"> = {
	nam: "male",
	male: "male",
	m: "male",
	nữ: "female",
	nu: "female",
	female: "female",
	f: "female",
	khác: "other",
	khac: "other",
	other: "other",
	"không tiết lộ": "undisclosed",
	"khong tiet lo": "undisclosed",
}

/** Export writes these so the file round-trips through `GENDER_LABELS` on import. */
export const GENDER_DISPLAY: Record<string, string> = {
	male: "Nam",
	female: "Nữ",
	other: "Khác",
	undisclosed: "Không tiết lộ",
}

export const GENDER_HINT = "Giới tính nhận: Nam, Nữ, Khác, Không tiết lộ."
