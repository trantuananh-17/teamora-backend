import { ConflictError, NotFoundError } from "../../shared/errors"
import { eventRepository } from "../event/event.repository"
import { journeyRepository } from "./journey.repository"
import { canViewJourney } from "./journey.policy"

export const journeyService = {
	async mine(userId: string, requestedEventId?: string) {
		const event = requestedEventId
			? await eventRepository.findById(requestedEventId)
			: await eventRepository.findCurrent()
		if (!event) throw new NotFoundError("Event")
		if (!canViewJourney(event.status))
			throw new ConflictError("Hành trình chỉ hiển thị sau khi Ban Tổ chức công bố thông tin.", {
				status: event.status,
			})
		const person = await journeyRepository.registration(event.id, userId)
		if (!person) throw new NotFoundError("Registration")
		const [flights, vehicles, accommodation, schedule, announcements] = await Promise.all([
			journeyRepository.flights(event.id, person.registration.id),
			journeyRepository.vehicles(event.id, person.registration.id),
			journeyRepository.accommodation(event.id, person.registration.id),
			journeyRepository.schedule(event.id),
			journeyRepository.announcements(event.id, person.registration.participating),
		])
		return {
			event,
			participant: {
				...person.employee,
				...person.profile,
				team: person.team,
				participating: person.registration.participating,
			},
			flights,
			vehicles,
			accommodation,
			schedule,
			announcements,
		}
	},
	async dashboard(eventId: string) {
		const raw = await journeyRepository.dashboard(eventId)
		let registered = 0,
			participating = 0,
			declined = 0,
			shift1 = 0,
			shift2 = 0
		for (const row of raw.registrations) {
			registered += row.value
			if (row.participating) {
				participating += row.value
				if (row.shift === "shift_1") shift1 += row.value
				if (row.shift === "shift_2") shift2 += row.value
			} else declined += row.value
		}
		const transportNeeds = Object.fromEntries(
			["origin_to_airport", "airport_to_hotel", "hotel_to_airport", "airport_to_origin"].map(
				(leg) => [leg, raw.transport.find((row) => row.leg === leg && row.needed)?.value ?? 0],
			),
		)
		return {
			people: {
				totalEmployees: raw.employeeTotal,
				registered,
				unregistered: Math.max(0, raw.employeeTotal - registered),
				participating,
				declined,
				shift1,
				shift2,
			},
			transportNeeds,
			capacity: { flights: raw.flights, vehicles: raw.vehicles, rooms: raw.rooms },
			unassigned: {
				outboundFlight: Math.max(
					0,
					participating -
						raw.flights
							.filter((row) => row.direction === "outbound")
							.reduce((sum, row) => sum + row.assigned, 0),
				),
				returnFlight: Math.max(
					0,
					participating -
						raw.flights
							.filter((row) => row.direction === "return")
							.reduce((sum, row) => sum + row.assigned, 0),
				),
				room: Math.max(0, participating - raw.rooms.reduce((sum, row) => sum + row.assigned, 0)),
			},
		}
	},
}
