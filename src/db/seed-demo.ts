import { createLocalAccountIssuer } from "@better-auth/core/db"
import { and, count, eq, inArray, like } from "drizzle-orm"

import { auth } from "../auth/auth"
import { allocationService } from "../modules/allocation/allocation.service"
import { closeDatabase, db, openDatabase } from "./client"
import {
	allocationRun,
	announcement,
	employeeProfile,
	event,
	flight,
	flightAssignment,
	hotel,
	notification,
	pickupPoint,
	registration,
	registrationTransportNeed,
	room,
	roomAssignment,
	roomType,
	scheduleItem,
	team,
	user,
	vehicle,
	vehicleAssignment,
	workLocation,
} from "./schema"

const EVENT_CODE = "DEMO-S3"
const DEMO_PASSWORD = "Teamora!2026"
const now = new Date()

const teams = [
	{ id: "demo-team-engineering", name: "Demo - Kỹ thuật" },
	{ id: "demo-team-sales", name: "Demo - Kinh doanh" },
	{ id: "demo-team-operations", name: "Demo - Vận hành" },
	{ id: "demo-team-finance", name: "Demo - Tài chính" },
] as const

const people = [
	["Nguyễn Minh Anh", "demo01@teamora.local", "DEMO001", 0, "shift_1", true],
	["Trần Hoàng Nam", "demo02@teamora.local", "DEMO002", 0, "shift_1", false],
	["Lê Thu Hà", "demo03@teamora.local", "DEMO003", 0, "shift_1", false],
	["Phạm Đức Long", "demo04@teamora.local", "DEMO004", 0, "shift_2", false],
	["Vũ Ngọc Mai", "demo05@teamora.local", "DEMO005", 0, "shift_2", false],
	["Đỗ Quang Huy", "demo06@teamora.local", "DEMO006", 0, "shift_1", false],
	["Bùi Thanh Thảo", "demo07@teamora.local", "DEMO007", 1, "shift_2", true],
	["Hoàng Gia Bảo", "demo08@teamora.local", "DEMO008", 1, "shift_2", false],
	["Đặng Khánh Linh", "demo09@teamora.local", "DEMO009", 1, "shift_2", false],
	["Ngô Tuấn Kiệt", "demo10@teamora.local", "DEMO010", 1, "shift_1", false],
	["Dương Hải Yến", "demo11@teamora.local", "DEMO011", 1, "shift_2", false],
	["Lý Thành Công", "demo12@teamora.local", "DEMO012", 2, "shift_1", false],
	["Mai Phương Trang", "demo13@teamora.local", "DEMO013", 2, "shift_1", false],
	["Tạ Quốc Việt", "demo14@teamora.local", "DEMO014", 2, "shift_2", false],
	["Đinh Bảo Ngọc", "demo15@teamora.local", "DEMO015", 2, "shift_2", false],
	["Hồ Trung Hiếu", "demo16@teamora.local", "DEMO016", 3, "shift_1", false],
	["Chu Mỹ Duyên", "demo17@teamora.local", "DEMO017", 3, "shift_2", false],
	["Trịnh Anh Khoa", "demo18@teamora.local", "DEMO018", 3, "shift_2", false],
] as const

const flights = [
	[
		"demo-flight-out-1",
		"VN-D101",
		"outbound",
		"shift_1",
		5,
		"2026-10-16T01:00:00.000Z",
		"2026-10-16T02:25:00.000Z",
		"HAN",
		"DAD",
	],
	[
		"demo-flight-out-2",
		"VN-D102",
		"outbound",
		"shift_2",
		5,
		"2026-10-16T03:00:00.000Z",
		"2026-10-16T04:25:00.000Z",
		"HAN",
		"DAD",
	],
	[
		"demo-flight-out-3",
		"VJ-D103",
		"outbound",
		"shift_1",
		4,
		"2026-10-16T02:00:00.000Z",
		"2026-10-16T03:30:00.000Z",
		"SGN",
		"DAD",
	],
	[
		"demo-flight-out-4",
		"VJ-D104",
		"outbound",
		"shift_2",
		4,
		"2026-10-16T05:00:00.000Z",
		"2026-10-16T06:30:00.000Z",
		"SGN",
		"DAD",
	],
	[
		"demo-flight-return-1",
		"VN-V201",
		"return",
		"shift_1",
		7,
		"2026-10-19T08:00:00.000Z",
		"2026-10-19T09:25:00.000Z",
		"DAD",
		"HAN",
	],
	[
		"demo-flight-return-2",
		"VN-V202",
		"return",
		"shift_2",
		6,
		"2026-10-19T11:00:00.000Z",
		"2026-10-19T12:25:00.000Z",
		"DAD",
		"HAN",
	],
	[
		"demo-flight-return-3",
		"VJ-V203",
		"return",
		"shift_2",
		5,
		"2026-10-19T13:00:00.000Z",
		"2026-10-19T14:30:00.000Z",
		"DAD",
		"SGN",
	],
] as const

async function ensureEmployee(
	name: string,
	email: string,
	employeeCode: string,
	teamId: string,
	workLocationId: string,
) {
	const context = await auth.$context
	const existing = await context.internalAdapter.findUserByEmail(email, { includeAccounts: true })
	let person = existing?.user
	if (!person) {
		person = await context.internalAdapter.createUser(
			{ email, name, emailVerified: true, role: "employee" },
			{ method: "admin" },
		)
	}
	if (!existing?.accounts.some((account) => account.providerId === "credential")) {
		await context.internalAdapter.linkAccount({
			userId: person.id,
			providerId: "credential",
			issuer: createLocalAccountIssuer("credential"),
			accountId: person.id,
			password: await context.password.hash(DEMO_PASSWORD),
		})
	}
	await db
		.insert(employeeProfile)
		.values({
			id: `profile-${employeeCode.toLowerCase()}`,
			userId: person.id,
			employeeCode,
			phone: `090${employeeCode.slice(-3).padStart(7, "0")}`,
			workLocationId,
			defaultTeamId: teamId,
			gender: Number(employeeCode.slice(-1)) % 2 === 0 ? "male" : "female",
			active: true,
		})
		.onConflictDoNothing()
	return person
}

async function seedBaseData() {
	await db
		.insert(workLocation)
		.values([
			{ id: "demo-location-hn", name: "Demo - Hà Nội", sortOrder: 10 },
			{ id: "demo-location-hcm", name: "Demo - Hồ Chí Minh", sortOrder: 20 },
		])
		.onConflictDoNothing()

	await db
		.insert(team)
		.values(teams.map((item, index) => ({ ...item, eventId: null, sortOrder: index + 10 })))
		.onConflictDoNothing()

	const currentEvent = (await db.select().from(event).where(eq(event.code, EVENT_CODE)).limit(1))[0]
	const eventId = currentEvent?.id ?? "demo-s3-event"
	if (currentEvent) {
		// The smoke test deliberately republishes this one demo edition. Remove its
		// generated S5 mail before reseeding so repeated local acceptance runs do not
		// leave hundreds of duplicate rows in the admin notification screen.
		await db
			.delete(notification)
			.where(
				and(
					eq(notification.eventId, eventId),
					inArray(notification.template, ["information_published", "assignment_changed"]),
				),
			)
	}
	if (!currentEvent) {
		await db.insert(event).values({
			id: eventId,
			name: "Team Building Demo S3",
			code: EVENT_CODE,
			status: "allocation_processing",
			registrationOpenAt: new Date("2026-09-15T00:00:00.000Z"),
			registrationCloseAt: new Date("2026-10-10T16:59:59.000Z"),
			settings: {
				terms: {
					version: "demo-1",
					body: "Tôi xác nhận tham gia và tuân thủ quy định chương trình.",
				},
				shifts: [
					{ key: "shift_1", label: "Ca 1" },
					{ key: "shift_2", label: "Ca 2" },
				],
				allocationWeights: { teamTogetherWeight: 100, shiftPreferenceWeight: 10 },
			},
		})
	} else if (currentEvent.status !== "allocation_processing" || currentEvent.publishedAt) {
		// Demo seed deliberately returns the edition to the pre-publication state so
		// the S5 smoke test can prove both the 409 guard and the first-publication fan-out.
		await db
			.update(event)
			.set({ status: "allocation_processing", publishedAt: null })
			.where(eq(event.id, eventId))
	}

	await db
		.insert(pickupPoint)
		.values([
			{
				id: "demo-pickup-hn-office",
				eventId,
				workLocationId: "demo-location-hn",
				name: "Văn phòng Hà Nội",
				address: "Cầu Giấy, Hà Nội",
				sortOrder: 10,
			},
			{
				id: "demo-pickup-noi-bai",
				eventId,
				workLocationId: "demo-location-hn",
				name: "Sân bay Nội Bài",
				address: "Phú Minh, Sóc Sơn",
				sortOrder: 20,
			},
			{
				id: "demo-pickup-hcm-office",
				eventId,
				workLocationId: "demo-location-hcm",
				name: "Văn phòng Hồ Chí Minh",
				address: "Quận 1, TP.HCM",
				sortOrder: 30,
			},
			{
				id: "demo-pickup-tan-son-nhat",
				eventId,
				workLocationId: "demo-location-hcm",
				name: "Sân bay Tân Sơn Nhất",
				address: "Tân Bình, TP.HCM",
				sortOrder: 40,
			},
		])
		.onConflictDoNothing()

	for (let index = 0; index < people.length; index++) {
		const [name, email, employeeCode, teamIndex, shiftPreference, shiftLocked] = people[index]!
		const locationId = index % 3 === 0 ? "demo-location-hcm" : "demo-location-hn"
		const person = await ensureEmployee(name, email, employeeCode, teams[teamIndex]!.id, locationId)
		const registrationId = `demo-registration-${String(index + 1).padStart(2, "0")}`
		await db
			.insert(registration)
			.values({
				id: registrationId,
				eventId,
				userId: person.id,
				teamId: teams[teamIndex]!.id,
				participating: true,
				agreedTermsAt: new Date("2026-09-20T02:00:00.000Z"),
				termsVersion: "demo-1",
				shiftPreference,
				shiftLocked,
				wishNote: index % 5 === 0 ? "Ưu tiên ngồi gần đồng đội." : null,
				submittedAt: new Date(2026, 8, 20, 9, index),
				updatedAt: now,
			})
			.onConflictDoNothing()

		const originPoint =
			locationId === "demo-location-hn" ? "demo-pickup-hn-office" : "demo-pickup-hcm-office"
		const airportPoint =
			locationId === "demo-location-hn" ? "demo-pickup-noi-bai" : "demo-pickup-tan-son-nhat"
		const legs = [
			["origin_to_airport", originPoint],
			["airport_to_hotel", airportPoint],
			["hotel_to_airport", airportPoint],
			["airport_to_origin", originPoint],
		] as const
		await db
			.insert(registrationTransportNeed)
			.values(
				legs.map(([leg, pickupPointId]) => ({
					id: `demo-transport-${index + 1}-${leg}`,
					registrationId,
					leg,
					needed: index % 6 !== 0,
					pickupPointId: index % 6 !== 0 ? pickupPointId : null,
				})),
			)
			.onConflictDoNothing()

		await db
			.insert(notification)
			.values({
				id: `demo-notification-${String(index + 1).padStart(2, "0")}`,
				eventId,
				registrationId,
				channel: "email",
				template: "registration_confirmed",
				payload: { to: email, name, eventName: "Team Building Demo S3" },
				status: index === people.length - 1 ? "failed" : "sent",
				attempts: index === people.length - 1 ? 3 : 1,
				lastError: index === people.length - 1 ? "Demo: SMTP mailbox unavailable" : null,
				scheduledAt: new Date(2026, 8, 20, 9, index),
				sentAt: index === people.length - 1 ? null : new Date(2026, 8, 20, 9, index + 1),
			})
			.onConflictDoNothing()
	}

	await db
		.insert(flight)
		.values(
			flights.map(
				([id, code, direction, shift, capacity, departAt, arriveAt, fromAirport, toAirport]) => ({
					id,
					eventId,
					code,
					direction,
					shift,
					capacity,
					departAt: new Date(departAt),
					arriveAt: new Date(arriveAt),
					fromAirport,
					toAirport,
					note: "Dữ liệu demo S3",
				}),
			),
		)
		.onConflictDoNothing()

	return eventId
}

async function ensureCommittedAllocation(eventId: string) {
	const existing =
		(
			await db
				.select({ value: count() })
				.from(allocationRun)
				.where(
					and(
						eq(allocationRun.eventId, eventId),
						eq(allocationRun.type, "flight"),
						eq(allocationRun.status, "committed"),
					),
				)
		)[0]?.value ?? 0
	if (existing > 0) return

	const admin = (await db.select().from(user).where(eq(user.role, "super_admin")).limit(1))[0]
	if (!admin) throw new Error("Chưa có super_admin. Chạy pnpm seed:admin trước.")
	const actor = { id: admin.id, name: admin.name, email: admin.email }
	const preview = await allocationService.preview(eventId, { type: "flight" }, actor)
	await allocationService.commit(eventId, preview.id, actor)
}

async function seedS4Data(eventId: string) {
	const vehicles = [
		{
			id: "demo-bus-hn-out",
			code: "BUS-HN-01",
			name: "Xe Hà Nội 01",
			capacity: 12,
			leg: "origin_to_airport",
			pickupPointId: "demo-pickup-hn-office",
			gatherAt: "2026-10-16T00:00:00.000Z",
			departAt: "2026-10-16T00:20:00.000Z",
			destination: "Sân bay Nội Bài",
			leaderName: "Nguyễn Văn Hùng",
			leaderPhone: "0901000001",
		},
		{
			id: "demo-bus-hcm-out",
			code: "BUS-HCM-01",
			name: "Xe TP.HCM 01",
			capacity: 8,
			leg: "origin_to_airport",
			pickupPointId: "demo-pickup-hcm-office",
			gatherAt: "2026-10-16T01:00:00.000Z",
			departAt: "2026-10-16T01:20:00.000Z",
			destination: "Sân bay Tân Sơn Nhất",
			leaderName: "Trần Minh Tuấn",
			leaderPhone: "0901000002",
		},
		{
			id: "demo-bus-airport-hotel-1",
			code: "BUS-DN-01",
			name: "Xe Đà Nẵng 01",
			capacity: 10,
			leg: "airport_to_hotel",
			pickupPointId: null,
			gatherAt: "2026-10-16T03:00:00.000Z",
			departAt: "2026-10-16T03:20:00.000Z",
			destination: "Ocean View Resort",
			leaderName: "Lê Thanh Hải",
			leaderPhone: "0901000003",
		},
		{
			id: "demo-bus-airport-hotel-2",
			code: "BUS-DN-02",
			name: "Xe Đà Nẵng 02",
			capacity: 10,
			leg: "airport_to_hotel",
			pickupPointId: null,
			gatherAt: "2026-10-16T05:00:00.000Z",
			departAt: "2026-10-16T05:20:00.000Z",
			destination: "Ocean View Resort",
			leaderName: "Phạm Thu Trang",
			leaderPhone: "0901000004",
		},
		{
			id: "demo-bus-hotel-airport-1",
			code: "BUS-DN-03",
			name: "Xe Đà Nẵng 03",
			capacity: 10,
			leg: "hotel_to_airport",
			pickupPointId: null,
			gatherAt: "2026-10-19T06:00:00.000Z",
			departAt: "2026-10-19T06:20:00.000Z",
			destination: "Sân bay Đà Nẵng",
			leaderName: "Đỗ Quốc Anh",
			leaderPhone: "0901000005",
		},
		{
			id: "demo-bus-hotel-airport-2",
			code: "BUS-DN-04",
			name: "Xe Đà Nẵng 04",
			capacity: 10,
			leg: "hotel_to_airport",
			pickupPointId: null,
			gatherAt: "2026-10-19T09:00:00.000Z",
			departAt: "2026-10-19T09:20:00.000Z",
			destination: "Sân bay Đà Nẵng",
			leaderName: "Vũ Ngọc Hà",
			leaderPhone: "0901000006",
		},
		{
			id: "demo-bus-hn-return",
			code: "BUS-HN-02",
			name: "Xe Hà Nội 02",
			capacity: 12,
			leg: "airport_to_origin",
			pickupPointId: "demo-pickup-hn-office",
			gatherAt: "2026-10-19T09:30:00.000Z",
			departAt: "2026-10-19T09:50:00.000Z",
			destination: "Văn phòng Hà Nội",
			leaderName: "Bùi Đức Nam",
			leaderPhone: "0901000007",
		},
		{
			id: "demo-bus-hcm-return",
			code: "BUS-HCM-02",
			name: "Xe TP.HCM 02",
			capacity: 8,
			leg: "airport_to_origin",
			pickupPointId: "demo-pickup-hcm-office",
			gatherAt: "2026-10-19T14:30:00.000Z",
			departAt: "2026-10-19T14:50:00.000Z",
			destination: "Văn phòng TP.HCM",
			leaderName: "Hoàng Minh Long",
			leaderPhone: "0901000008",
		},
	] as const
	await db
		.insert(vehicle)
		.values(
			vehicles.map((item) => ({
				...item,
				eventId,
				gatherAt: new Date(item.gatherAt),
				departAt: new Date(item.departAt),
				note: "Dữ liệu demo S4",
			})),
		)
		.onConflictDoNothing()

	await db
		.insert(hotel)
		.values({
			id: "demo-hotel-ocean",
			eventId,
			name: "Ocean View Resort",
			address: "268 Võ Nguyên Giáp, Đà Nẵng",
		})
		.onConflictDoNothing()
	await db
		.insert(roomType)
		.values([
			{
				id: "demo-room-type-twin",
				eventId,
				hotelId: "demo-hotel-ocean",
				name: "Twin",
				capacity: 2,
			},
			{
				id: "demo-room-type-triple",
				eventId,
				hotelId: "demo-hotel-ocean",
				name: "Triple",
				capacity: 3,
			},
		])
		.onConflictDoNothing()
	const rooms = [
		["demo-room-a101", "A101", "demo-room-type-twin", 2],
		["demo-room-a102", "A102", "demo-room-type-twin", 2],
		["demo-room-a103", "A103", "demo-room-type-twin", 2],
		["demo-room-a104", "A104", "demo-room-type-twin", 2],
		["demo-room-b201", "B201", "demo-room-type-triple", 3],
		["demo-room-b202", "B202", "demo-room-type-triple", 3],
	] as const
	await db
		.insert(room)
		.values(
			rooms.map(([id, code, roomTypeId, capacity]) => ({
				id,
				eventId,
				hotelId: "demo-hotel-ocean",
				roomTypeId,
				code,
				capacity,
			})),
		)
		.onConflictDoNothing()

	const admin = (await db.select().from(user).where(eq(user.role, "super_admin")).limit(1))[0]
	if (!admin) throw new Error("Chưa có super_admin. Chạy pnpm seed:admin trước.")
	const roomIds = rooms.flatMap(([id, , , capacity]) => Array.from({ length: capacity }, () => id))
	await db
		.insert(roomAssignment)
		.values(
			roomIds.slice(0, 12).map((roomId, index) => ({
				id: `demo-room-assignment-${String(index + 1).padStart(2, "0")}`,
				eventId,
				roomId,
				registrationId: `demo-registration-${String(index + 1).padStart(2, "0")}`,
				source: "import" as const,
				locked: true,
				assignedBy: admin.id,
				assignedAt: now,
			})),
		)
		.onConflictDoNothing()
}

async function ensureCommittedVehicleAllocation(eventId: string) {
	const existing =
		(
			await db
				.select({ value: count() })
				.from(allocationRun)
				.where(
					and(
						eq(allocationRun.eventId, eventId),
						eq(allocationRun.type, "vehicle"),
						eq(allocationRun.status, "committed"),
					),
				)
		)[0]?.value ?? 0
	if (existing > 0) return
	const admin = (await db.select().from(user).where(eq(user.role, "super_admin")).limit(1))[0]
	if (!admin) throw new Error("Chưa có super_admin. Chạy pnpm seed:admin trước.")
	const actor = { id: admin.id, name: admin.name, email: admin.email }
	const preview = await allocationService.preview(eventId, { type: "vehicle" }, actor)
	await allocationService.commit(eventId, preview.id, actor)
}

async function seedS5Content(eventId: string) {
	await db
		.insert(scheduleItem)
		.values([
			{
				id: "demo-schedule-01",
				eventId,
				day: 1,
				startAt: new Date("2026-10-16T07:00:00.000Z"),
				endAt: new Date("2026-10-16T08:00:00.000Z"),
				title: "Nhận phòng và ăn trưa",
				description: "Nhận vòng tay, chìa khóa phòng và dùng bữa tại nhà hàng chính.",
				location: "Ocean View Resort",
				sortOrder: 10,
			},
			{
				id: "demo-schedule-02",
				eventId,
				day: 1,
				startAt: new Date("2026-10-16T09:00:00.000Z"),
				endAt: new Date("2026-10-16T11:00:00.000Z"),
				title: "Khai mạc & hoạt động Team",
				description: "Tập trung theo màu Team tại khu vực sân khấu.",
				location: "Bãi biển trung tâm",
				sortOrder: 20,
			},
			{
				id: "demo-schedule-03",
				eventId,
				day: 2,
				startAt: new Date("2026-10-17T01:00:00.000Z"),
				endAt: new Date("2026-10-17T04:00:00.000Z"),
				title: "Team Building",
				description: "Mang giày thể thao và có mặt trước 15 phút.",
				location: "Bãi biển trung tâm",
				sortOrder: 10,
			},
			{
				id: "demo-schedule-04",
				eventId,
				day: 2,
				startAt: new Date("2026-10-17T11:00:00.000Z"),
				endAt: new Date("2026-10-17T14:30:00.000Z"),
				title: "Gala Dinner",
				description: "Trang phục theo chủ đề của Team.",
				location: "Grand Ballroom",
				sortOrder: 20,
			},
			{
				id: "demo-schedule-05",
				eventId,
				day: 3,
				startAt: new Date("2026-10-18T01:00:00.000Z"),
				endAt: new Date("2026-10-18T05:00:00.000Z"),
				title: "Hoạt động tự do",
				description: "Tham quan thành phố theo nhóm.",
				location: "Đà Nẵng",
				sortOrder: 10,
			},
		])
		.onConflictDoNothing()
	await db
		.insert(announcement)
		.values([
			{
				id: "demo-announcement-01",
				eventId,
				title: "Lưu ý hành lý",
				body: "CBNV vui lòng mang giấy tờ tùy thân và có mặt tại điểm tập trung trước giờ khởi hành 20 phút.",
				audience: "participants",
				publishedAt: new Date("2026-10-10T02:00:00.000Z"),
			},
			{
				id: "demo-announcement-02",
				eventId,
				title: "Chuẩn bị trang phục Team",
				body: "Mỗi Team chủ động chuẩn bị trang phục theo màu đã thống nhất cho hoạt động ngày 2.",
				audience: "participants",
				publishedAt: null,
			},
		])
		.onConflictDoNothing()
}

async function printSummary(eventId: string) {
	const tableCounts = {
		teams: (
			await db
				.select({ value: count() })
				.from(team)
				.where(
					inArray(
						team.id,
						teams.map((item) => item.id),
					),
				)
		)[0]?.value,
		employees: (
			await db
				.select({ value: count() })
				.from(employeeProfile)
				.where(like(employeeProfile.employeeCode, "DEMO%"))
		)[0]?.value,
		registrations: (
			await db
				.select({ value: count() })
				.from(registration)
				.where(eq(registration.eventId, eventId))
		)[0]?.value,
		transportNeeds: (
			await db
				.select({ value: count() })
				.from(registrationTransportNeed)
				.leftJoin(registration, eq(registrationTransportNeed.registrationId, registration.id))
				.where(eq(registration.eventId, eventId))
		)[0]?.value,
		flights: (
			await db.select({ value: count() }).from(flight).where(eq(flight.eventId, eventId))
		)[0]?.value,
		assignments: (
			await db
				.select({ value: count() })
				.from(flightAssignment)
				.where(eq(flightAssignment.eventId, eventId))
		)[0]?.value,
		allocationRuns: (
			await db
				.select({ value: count() })
				.from(allocationRun)
				.where(eq(allocationRun.eventId, eventId))
		)[0]?.value,
		notifications: (
			await db
				.select({ value: count() })
				.from(notification)
				.where(eq(notification.eventId, eventId))
		)[0]?.value,
		vehicles: (
			await db.select({ value: count() }).from(vehicle).where(eq(vehicle.eventId, eventId))
		)[0]?.value,
		vehicleAssignments: (
			await db
				.select({ value: count() })
				.from(vehicleAssignment)
				.where(eq(vehicleAssignment.eventId, eventId))
		)[0]?.value,
		hotels: (await db.select({ value: count() }).from(hotel).where(eq(hotel.eventId, eventId)))[0]
			?.value,
		rooms: (await db.select({ value: count() }).from(room).where(eq(room.eventId, eventId)))[0]
			?.value,
		roomAssignments: (
			await db
				.select({ value: count() })
				.from(roomAssignment)
				.where(eq(roomAssignment.eventId, eventId))
		)[0]?.value,
		scheduleItems: (
			await db
				.select({ value: count() })
				.from(scheduleItem)
				.where(eq(scheduleItem.eventId, eventId))
		)[0]?.value,
		announcements: (
			await db
				.select({ value: count() })
				.from(announcement)
				.where(eq(announcement.eventId, eventId))
		)[0]?.value,
	}
	console.log(
		JSON.stringify(
			{ eventId, eventCode: EVENT_CODE, employeePassword: DEMO_PASSWORD, ...tableCounts },
			null,
			2,
		),
	)
}

async function main() {
	await openDatabase()
	const eventId = await seedBaseData()
	await ensureCommittedAllocation(eventId)
	await seedS4Data(eventId)
	await ensureCommittedVehicleAllocation(eventId)
	await seedS5Content(eventId)
	await printSummary(eventId)
}

main()
	.then(() => closeDatabase())
	.catch((error) => {
		console.error(error)
		closeDatabase()
		process.exit(1)
	})
