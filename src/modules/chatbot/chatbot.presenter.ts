import type { EventRow } from "../event/event.repository"
import type { journeyRepository } from "../journey/journey.repository"
import type { journeyService } from "../journey/journey.service"

type JourneyResult = Awaited<ReturnType<typeof journeyService.mine>>
type Schedule = Awaited<ReturnType<typeof journeyRepository.schedule>>
type Announcements = Awaited<ReturnType<typeof journeyRepository.announcements>>

function eventView(event: EventRow) {
	return {
		code: event.code,
		name: event.name,
		status: event.status,
		registrationOpenAt: event.registrationOpenAt,
		registrationCloseAt: event.registrationCloseAt,
		publishedAt: event.publishedAt,
	}
}

function scheduleView(schedule: Schedule) {
	return schedule.map((item) => ({
		day: item.day,
		startAt: item.startAt,
		endAt: item.endAt,
		title: item.title,
		description: item.description,
		location: item.location,
	}))
}

function announcementView(announcements: Announcements) {
	return announcements.map((item) => ({
		title: item.title,
		body: item.body,
		publishedAt: item.publishedAt,
	}))
}

export function presentChatbotTrip(
	event: EventRow,
	schedule: Schedule,
	announcements: Announcements,
) {
	return {
		event: eventView(event),
		schedule: scheduleView(schedule),
		announcements: announcementView(announcements),
	}
}

export function presentChatbotJourney(journey: JourneyResult) {
	return {
		event: eventView(journey.event),
		participant: {
			name: journey.participant.name,
			employeeCode: journey.participant.employeeCode,
			team: journey.participant.team.name,
			participating: journey.participant.participating,
		},
		flights: journey.flights.map(({ assignment, flight }) => ({
			direction: assignment.direction,
			code: flight.code,
			departAt: flight.departAt,
			arriveAt: flight.arriveAt,
			fromAirport: flight.fromAirport,
			toAirport: flight.toAirport,
			shift: flight.shift,
			note: flight.note,
		})),
		vehicles: journey.vehicles.map(({ assignment, vehicle, pickupPoint }) => ({
			leg: assignment.leg,
			code: vehicle.code,
			name: vehicle.name,
			gatherAt: vehicle.gatherAt,
			departAt: vehicle.departAt,
			destination: vehicle.destination,
			pickupPoint: pickupPoint ? { name: pickupPoint.name, address: pickupPoint.address } : null,
			leader: vehicle.leaderName ? { name: vehicle.leaderName, phone: vehicle.leaderPhone } : null,
			note: vehicle.note,
		})),
		accommodation: journey.accommodation
			? {
					hotel: {
						name: journey.accommodation.hotel.name,
						address: journey.accommodation.hotel.address,
					},
					room: {
						code: journey.accommodation.room.code,
						type: journey.accommodation.roomType.name,
					},
				}
			: null,
		schedule: scheduleView(journey.schedule),
		announcements: announcementView(journey.announcements),
	}
}
