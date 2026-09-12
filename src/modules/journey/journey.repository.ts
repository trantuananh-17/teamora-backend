import { and, asc, count, eq, inArray, sql } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import {
	announcement, employeeProfile, event, flight, flightAssignment, hotel, pickupPoint,
	registration, registrationTransportNeed, room, roomAssignment, roomType, scheduleItem, team,
	user, vehicle, vehicleAssignment,
} from "../../db/schema"

export const journeyRepository = {
	async registration(eventId: string, userId: string, executor: DbExecutor = db) {
		return (await executor.select({ registration, employee: { id: user.id, name: user.name, email: user.email }, profile: { employeeCode: employeeProfile.employeeCode, phone: employeeProfile.phone }, team: { id: team.id, name: team.name } })
			.from(registration).innerJoin(user, eq(registration.userId, user.id)).innerJoin(team, eq(registration.teamId, team.id))
			.leftJoin(employeeProfile, eq(user.id, employeeProfile.userId))
			.where(and(eq(registration.eventId, eventId), eq(registration.userId, userId))).limit(1))[0]
	},
	flights(eventId: string, registrationId: string, executor: DbExecutor = db) {
		return executor.select({ assignment: flightAssignment, flight }).from(flightAssignment).innerJoin(flight, eq(flightAssignment.flightId, flight.id))
			.where(and(eq(flightAssignment.eventId, eventId), eq(flightAssignment.registrationId, registrationId))).orderBy(asc(flight.departAt))
	},
	vehicles(eventId: string, registrationId: string, executor: DbExecutor = db) {
		return executor.select({ assignment: vehicleAssignment, vehicle, pickupPoint: { id: pickupPoint.id, name: pickupPoint.name, address: pickupPoint.address } })
			.from(vehicleAssignment).innerJoin(vehicle, eq(vehicleAssignment.vehicleId, vehicle.id)).leftJoin(pickupPoint, eq(vehicle.pickupPointId, pickupPoint.id))
			.where(and(eq(vehicleAssignment.eventId, eventId), eq(vehicleAssignment.registrationId, registrationId))).orderBy(asc(vehicle.departAt))
	},
	async accommodation(eventId: string, registrationId: string, executor: DbExecutor = db) {
		return (await executor.select({ assignment: roomAssignment, room, roomType, hotel }).from(roomAssignment)
			.innerJoin(room, eq(roomAssignment.roomId, room.id)).innerJoin(roomType, eq(room.roomTypeId, roomType.id)).innerJoin(hotel, eq(room.hotelId, hotel.id))
			.where(and(eq(roomAssignment.eventId, eventId), eq(roomAssignment.registrationId, registrationId))).limit(1))[0] ?? null
	},
	schedule(eventId: string, executor: DbExecutor = db) {
		return executor.select().from(scheduleItem).where(eq(scheduleItem.eventId, eventId)).orderBy(asc(scheduleItem.day), asc(scheduleItem.startAt), asc(scheduleItem.sortOrder))
	},
	announcements(eventId: string, participating: boolean, executor: DbExecutor = db) {
		const audiences = participating ? ["all", "participants"] as const : ["all"] as const
		return executor.select().from(announcement).where(and(eq(announcement.eventId, eventId), inArray(announcement.audience, [...audiences]), sql`${announcement.publishedAt} is not null`)).orderBy(sql`${announcement.publishedAt} desc`)
	},
	async dashboard(eventId: string, executor: DbExecutor = db) {
		const [employeeTotal, registrations, transport, flights, vehicles, rooms] = await Promise.all([
			executor.select({ value: count() }).from(employeeProfile).where(eq(employeeProfile.active, true)),
			executor.select({ participating: registration.participating, shift: registration.shiftPreference, value: count() }).from(registration).where(eq(registration.eventId, eventId)).groupBy(registration.participating, registration.shiftPreference),
			executor.select({ leg: registrationTransportNeed.leg, needed: registrationTransportNeed.needed, value: count() }).from(registrationTransportNeed).innerJoin(registration, eq(registrationTransportNeed.registrationId, registration.id)).where(eq(registration.eventId, eventId)).groupBy(registrationTransportNeed.leg, registrationTransportNeed.needed),
			executor.select({ id: flight.id, code: flight.code, direction: flight.direction, capacity: flight.capacity, assigned: count(flightAssignment.id) }).from(flight).leftJoin(flightAssignment, eq(flight.id, flightAssignment.flightId)).where(eq(flight.eventId, eventId)).groupBy(flight.id).orderBy(asc(flight.departAt)),
			executor.select({ id: vehicle.id, code: vehicle.code, leg: vehicle.leg, capacity: vehicle.capacity, assigned: count(vehicleAssignment.id) }).from(vehicle).leftJoin(vehicleAssignment, eq(vehicle.id, vehicleAssignment.vehicleId)).where(eq(vehicle.eventId, eventId)).groupBy(vehicle.id).orderBy(asc(vehicle.leg), asc(vehicle.departAt)),
			executor.select({ id: room.id, code: room.code, hotel: hotel.name, capacity: room.capacity, assigned: count(roomAssignment.id) }).from(room).innerJoin(hotel, eq(room.hotelId, hotel.id)).leftJoin(roomAssignment, eq(room.id, roomAssignment.roomId)).where(eq(room.eventId, eventId)).groupBy(room.id).orderBy(asc(hotel.name), asc(room.code)),
		])
		return { employeeTotal: employeeTotal[0]?.value ?? 0, registrations, transport, flights, vehicles, rooms }
	},
}
