import { writeWorkbook, type WorkbookSheet } from "../../excel/writer"
import { type TransportLeg } from "../../db/schema/registration.schema"
import { accommodationRepository } from "../accommodation/accommodation.repository"
import { allocationRepository } from "../allocation/allocation.repository"
import { auditRepository } from "../audit/audit.repository"
import { auditService, type AuditActor } from "../audit/audit.service"
import { contentRepository } from "../content/content.repository"
import { flightRepository } from "../flight/flight.repository"
import { notificationRepository } from "../notification/notification.repository"
import { pickupPointRepository } from "../pickup-point/pickup-point.repository"
import {
	registrationRepository,
	type RegistrationWithRelations,
} from "../registration/registration.repository"
import { teamRepository } from "../team/team.repository"
import { vehicleRepository } from "../vehicle/vehicle.repository"
import { workLocationRepository } from "../work-location/work-location.repository"
import { eventRepository } from "./event.repository"
import { NotFoundError } from "../../shared/errors"

const LEG_LABELS: Record<TransportLeg, string> = {
	origin_to_airport: "Nơi làm việc → Sân bay",
	airport_to_hotel: "Sân bay → Khách sạn",
	hotel_to_airport: "Khách sạn → Sân bay",
	airport_to_origin: "Sân bay → Nơi làm việc",
}

/** One operational workbook is the hand-off surface for a complete edition. */
export const eventExportService = {
	async exportWorkbook(eventId: string, actor: AuditActor): Promise<Buffer> {
		const edition = await eventRepository.findById(eventId)
		if (!edition) throw new NotFoundError("Event")

		const [
			teams,
			pickupPoints,
			workLocations,
			registrations,
			flights,
			flightAssignments,
			vehicles,
			vehicleAssignments,
			hotels,
			roomTypes,
			rooms,
			roomAssignments,
			schedule,
			announcements,
			allocationRuns,
			notifications,
			auditLogs,
		] = await Promise.all([
			teamRepository.listForEvent(eventId),
			pickupPointRepository.listForEvent(eventId),
			workLocationRepository.list(),
			listRegistrations(eventId),
			flightRepository.listAll(eventId),
			flightRepository.listAssignments(eventId),
			vehicleRepository.listAll(eventId),
			vehicleRepository.listAssignments(eventId),
			accommodationRepository.listHotels(eventId),
			accommodationRepository.listRoomTypes(eventId),
			accommodationRepository.listRooms(eventId),
			accommodationRepository.listAssignments(eventId),
			contentRepository.listSchedule(eventId),
			contentRepository.listAnnouncements(eventId),
			listAllocationRuns(eventId),
			listNotifications(eventId),
			auditRepository.listAllForEvent(eventId, {}),
		])

		const registrationById = new Map(registrations.map((row) => [row.id, row]))
		const pickupPointById = new Map(pickupPoints.map((row) => [row.id, row]))
		const workLocationById = new Map(workLocations.map((row) => [row.id, row.name]))
		const hotelById = new Map(hotels.map((row) => [row.hotel.id, row.hotel]))
		const roomTypeById = new Map(roomTypes.map((row) => [row.id, row]))
		const roomById = new Map(rooms.map((row) => [row.room.id, row.room]))

		const sheets: WorkbookSheet[] = [
			{
				name: "Kỳ Team Building",
				columns: columns([
					["name", "Tên kỳ"],
					["code", "Mã kỳ"],
					["status", "Trạng thái"],
					["registrationOpenAt", "Mở đăng ký"],
					["registrationCloseAt", "Đóng đăng ký"],
					["publishedAt", "Công bố lúc"],
					["settings", "Cấu hình"],
				]),
				rows: [
					{
						name: edition.name,
						code: edition.code,
						status: edition.status,
						registrationOpenAt: dateCell(edition.registrationOpenAt),
						registrationCloseAt: dateCell(edition.registrationCloseAt),
						publishedAt: dateCell(edition.publishedAt),
						settings: jsonCell(edition.settings),
					},
				],
			},
			{
				name: "Team",
				columns: columns([
					["name", "Tên Team"],
					["scope", "Phạm vi"],
					["active", "Đang dùng"],
					["sortOrder", "Thứ tự"],
				]),
				rows: teams.map((row) => ({
					name: row.name,
					scope: row.eventId ? "Riêng kỳ" : "Dùng chung",
					active: yesNo(row.active),
					sortOrder: row.sortOrder,
				})),
			},
			{
				name: "Điểm đón",
				columns: columns([
					["name", "Tên điểm"],
					["address", "Địa chỉ"],
					["workLocation", "Nơi làm việc"],
					["active", "Đang dùng"],
					["sortOrder", "Thứ tự"],
				]),
				rows: pickupPoints.map((row) => ({
					name: row.name,
					address: row.address ?? "",
					workLocation: row.workLocationId
						? (workLocationById.get(row.workLocationId) ?? row.workLocationId)
						: "Tất cả",
					active: yesNo(row.active),
					sortOrder: row.sortOrder,
				})),
			},
			{
				name: "Đăng ký",
				columns: columns([
					["employeeCode", "Mã nhân viên"],
					["name", "Họ tên"],
					["email", "Email"],
					["phone", "Điện thoại"],
					["team", "Team"],
					["participating", "Tham gia"],
					["shift", "Ca nguyện vọng"],
					["shiftLocked", "Khóa ca"],
					["originToAirport", "Xe nơi làm việc → sân bay"],
					["airportToHotel", "Xe sân bay → khách sạn"],
					["hotelToAirport", "Xe khách sạn → sân bay"],
					["airportToOrigin", "Xe sân bay → nơi làm việc"],
					["wishNote", "Mong muốn"],
					["submittedAt", "Gửi lúc"],
				]),
				rows: registrations.map((row) => registrationRow(row, pickupPointById)),
			},
			{
				name: "Chuyến bay",
				columns: columns([
					["code", "Mã chuyến"],
					["direction", "Chiều"],
					["departAt", "Khởi hành"],
					["arriveAt", "Hạ cánh"],
					["from", "Điểm đi"],
					["to", "Điểm đến"],
					["shift", "Ca"],
					["capacity", "Sức chứa"],
					["assigned", "Đã xếp"],
					["note", "Ghi chú"],
				]),
				rows: flights.map((row) => ({
					code: row.code,
					direction: row.direction,
					departAt: dateCell(row.departAt),
					arriveAt: dateCell(row.arriveAt),
					from: row.fromAirport,
					to: row.toAirport,
					shift: row.shift ?? "",
					capacity: row.capacity,
					assigned: row.assignedCount,
					note: row.note ?? "",
				})),
			},
			{
				name: "Phân chuyến bay",
				columns: columns([
					["employeeCode", "Mã nhân viên"],
					["name", "Họ tên"],
					["team", "Team"],
					["direction", "Chiều"],
					["flight", "Chuyến bay"],
					["source", "Nguồn"],
					["locked", "Đã khóa"],
					["flags", "Cảnh báo"],
					["assignedAt", "Xếp lúc"],
				]),
				rows: flightAssignments.map(({ assignment, flight }) =>
					assignmentRow(registrationById.get(assignment.registrationId), {
						direction: assignment.direction,
						target: flight.code,
						source: assignment.source,
						locked: yesNo(assignment.locked),
						flags: assignment.flags.join(", "),
						assignedAt: dateCell(assignment.assignedAt),
					}),
				),
			},
			{
				name: "Xe",
				columns: columns([
					["code", "Mã xe"],
					["name", "Tên xe"],
					["leg", "Chặng"],
					["pickup", "Điểm đón/trả"],
					["destination", "Điểm đến"],
					["gatherAt", "Tập trung"],
					["departAt", "Khởi hành"],
					["capacity", "Sức chứa"],
					["assigned", "Đã xếp"],
					["leader", "Trưởng xe"],
					["leaderPhone", "SĐT trưởng xe"],
					["note", "Ghi chú"],
				]),
				rows: vehicles.map((row) => ({
					code: row.code,
					name: row.name,
					leg: LEG_LABELS[row.leg],
					pickup: row.pickupPointId
						? (pickupPointById.get(row.pickupPointId)?.name ?? row.pickupPointId)
						: "",
					destination: row.destination,
					gatherAt: dateCell(row.gatherAt),
					departAt: dateCell(row.departAt),
					capacity: row.capacity,
					assigned: row.assignedCount,
					leader: row.leaderName ?? "",
					leaderPhone: row.leaderPhone ?? "",
					note: row.note ?? "",
				})),
			},
			{
				name: "Phân xe",
				columns: columns([
					["employeeCode", "Mã nhân viên"],
					["name", "Họ tên"],
					["team", "Team"],
					["leg", "Chặng"],
					["vehicle", "Xe"],
					["source", "Nguồn"],
					["locked", "Đã khóa"],
					["flags", "Cảnh báo"],
					["assignedAt", "Xếp lúc"],
				]),
				rows: vehicleAssignments.map(({ assignment, vehicle }) =>
					assignmentRow(registrationById.get(assignment.registrationId), {
						leg: LEG_LABELS[assignment.leg],
						vehicle: vehicle.code,
						source: assignment.source,
						locked: yesNo(assignment.locked),
						flags: assignment.flags.join(", "),
						assignedAt: dateCell(assignment.assignedAt),
					}),
				),
			},
			{
				name: "Khách sạn",
				columns: columns([
					["name", "Khách sạn"],
					["address", "Địa chỉ"],
					["rooms", "Số phòng"],
				]),
				rows: hotels.map((row) => ({
					name: row.hotel.name,
					address: row.hotel.address,
					rooms: row.roomCount,
				})),
			},
			{
				name: "Loại phòng",
				columns: columns([
					["hotel", "Khách sạn"],
					["name", "Loại phòng"],
					["capacity", "Sức chứa mặc định"],
				]),
				rows: roomTypes.map((row) => ({
					hotel: hotelById.get(row.hotelId)?.name ?? row.hotelId,
					name: row.name,
					capacity: row.capacity,
				})),
			},
			{
				name: "Phòng",
				columns: columns([
					["hotel", "Khách sạn"],
					["code", "Mã phòng"],
					["roomType", "Loại phòng"],
					["capacity", "Sức chứa"],
					["assigned", "Đã xếp"],
				]),
				rows: rooms.map((row) => ({
					hotel: row.hotel.name,
					code: row.room.code,
					roomType: row.roomType.name,
					capacity: row.room.capacity,
					assigned: row.assignedCount,
				})),
			},
			{
				name: "Phân phòng",
				columns: columns([
					["employeeCode", "Mã nhân viên"],
					["name", "Họ tên"],
					["email", "Email"],
					["hotel", "Khách sạn"],
					["room", "Mã phòng"],
					["roomType", "Loại phòng"],
					["source", "Nguồn"],
					["locked", "Đã khóa"],
				]),
				rows: roomAssignments.map((row) => ({
					employeeCode: row.employeeCode ?? "",
					name: row.name,
					email: row.email,
					hotel: row.hotel.name,
					room: row.room.code,
					roomType:
						roomTypeById.get(roomById.get(row.assignment.roomId)?.roomTypeId ?? "")?.name ?? "",
					source: row.assignment.source,
					locked: yesNo(row.assignment.locked),
				})),
			},
			{
				name: "Lịch trình",
				columns: columns([
					["day", "Ngày"],
					["startAt", "Bắt đầu"],
					["endAt", "Kết thúc"],
					["title", "Hoạt động"],
					["location", "Địa điểm"],
					["description", "Mô tả"],
					["sortOrder", "Thứ tự"],
				]),
				rows: schedule.map((row) => ({
					day: row.day,
					startAt: dateCell(row.startAt),
					endAt: dateCell(row.endAt),
					title: row.title,
					location: row.location ?? "",
					description: row.description ?? "",
					sortOrder: row.sortOrder,
				})),
			},
			{
				name: "Thông báo",
				columns: columns([
					["title", "Tiêu đề"],
					["audience", "Đối tượng"],
					["publishedAt", "Công bố lúc"],
					["body", "Nội dung"],
				]),
				rows: announcements.map((row) => ({
					title: row.title,
					audience: row.audience,
					publishedAt: dateCell(row.publishedAt),
					body: row.body,
				})),
			},
			{
				name: "Lượt phân bổ",
				columns: columns([
					["id", "Run ID"],
					["type", "Loại"],
					["status", "Trạng thái"],
					["createdAt", "Tạo lúc"],
					["committedAt", "Commit lúc"],
					["stats", "Thống kê"],
					["params", "Tham số"],
				]),
				rows: allocationRuns.map((row) => ({
					id: row.id,
					type: row.type,
					status: row.status,
					createdAt: dateCell(row.createdAt),
					committedAt: dateCell(row.committedAt),
					stats: jsonCell(row.stats),
					params: jsonCell(row.params),
				})),
			},
			{
				name: "Email hệ thống",
				columns: columns([
					["recipient", "Người nhận"],
					["email", "Email"],
					["template", "Mẫu"],
					["status", "Trạng thái"],
					["attempts", "Số lần thử"],
					["scheduledAt", "Lên lịch"],
					["sentAt", "Gửi lúc"],
					["lastError", "Lỗi gần nhất"],
				]),
				rows: notifications.map((row) => ({
					recipient: row.recipient?.name ?? "",
					email: row.recipient?.email ?? "",
					template: row.template,
					status: row.status,
					attempts: row.attempts,
					scheduledAt: dateCell(row.scheduledAt),
					sentAt: dateCell(row.sentAt),
					lastError: row.lastError ?? "",
				})),
			},
			{
				name: "Nhật ký thay đổi",
				columns: columns([
					["createdAt", "Thời điểm"],
					["actor", "Người thao tác"],
					["email", "Email"],
					["entity", "Đối tượng"],
					["entityId", "ID đối tượng"],
					["action", "Hành động"],
					["reason", "Lý do"],
					["before", "Trước thay đổi"],
					["after", "Sau thay đổi"],
				]),
				rows: auditLogs.map((row) => ({
					createdAt: dateCell(row.createdAt),
					actor: row.actorName ?? "Hệ thống",
					email: row.actorEmail ?? "",
					entity: row.entity,
					entityId: row.entityId,
					action: row.action,
					reason: row.reason ?? "",
					before: jsonCell(row.before),
					after: jsonCell(row.after),
				})),
			},
		]

		const output = await writeWorkbook(sheets)
		await auditService.record({
			eventId,
			actor,
			entity: "event",
			entityId: eventId,
			action: "export",
			after: { sheets: sheets.length },
		})
		return output
	},
}

async function listRegistrations(eventId: string): Promise<RegistrationWithRelations[]> {
	const rows: RegistrationWithRelations[] = []
	let offset = 0
	while (true) {
		const result = await registrationRepository.list(eventId, {}, { limit: 100, offset })
		rows.push(...result.items)
		offset += result.items.length
		if (offset >= result.total || result.items.length === 0) return rows
	}
}

async function listNotifications(eventId: string) {
	const rows: Awaited<ReturnType<typeof notificationRepository.list>>["items"] = []
	let offset = 0
	while (true) {
		const result = await notificationRepository.list(eventId, undefined, { limit: 100, offset })
		rows.push(...result.items)
		offset += result.items.length
		if (offset >= result.total || result.items.length === 0) return rows
	}
}

async function listAllocationRuns(eventId: string) {
	const [flights, vehicles] = await Promise.all([
		allocationRepository.list(eventId, "flight"),
		allocationRepository.list(eventId, "vehicle"),
	])
	return [...flights, ...vehicles].sort(
		(left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
	)
}

function registrationRow(
	row: RegistrationWithRelations,
	pickupPoints: ReadonlyMap<string, { name: string }>,
) {
	const needs = new Map(row.transportNeeds.map((need) => [need.leg, need]))
	const needCell = (leg: TransportLeg) => {
		const need = needs.get(leg)
		if (!need?.needed) return "Không"
		return need.pickupPointId
			? (pickupPoints.get(need.pickupPointId)?.name ?? need.pickupPointId)
			: "Có"
	}
	return {
		employeeCode: row.employeeProfile?.employeeCode ?? "",
		name: row.user.name,
		email: row.user.email,
		phone: row.employeeProfile?.phone ?? "",
		team: row.team.name,
		participating: yesNo(row.participating),
		shift: row.shiftPreference ?? "",
		shiftLocked: yesNo(row.shiftLocked),
		originToAirport: needCell("origin_to_airport"),
		airportToHotel: needCell("airport_to_hotel"),
		hotelToAirport: needCell("hotel_to_airport"),
		airportToOrigin: needCell("airport_to_origin"),
		wishNote: row.wishNote ?? "",
		submittedAt: dateCell(row.submittedAt),
	}
}

function assignmentRow(
	person: RegistrationWithRelations | undefined,
	values: Record<string, string | number | null>,
) {
	return {
		employeeCode: person?.employeeProfile?.employeeCode ?? "",
		name: person?.user.name ?? "Không xác định",
		team: person?.team.name ?? "",
		...values,
	}
}

function columns(values: readonly (readonly [string, string])[]) {
	return values.map(([key, header]) => ({ key, header, required: true }))
}

function yesNo(value: boolean | null | undefined): string {
	return value ? "Có" : "Không"
}

function dateCell(value: Date | null | undefined): string {
	return value?.toISOString() ?? ""
}

function jsonCell(value: unknown): string {
	return value === null || value === undefined ? "" : JSON.stringify(value)
}
