import { ConflictError, NotFoundError } from "../../shared/errors"
import { eventRepository, type EventRow } from "../event/event.repository"
import { journeyRepository } from "../journey/journey.repository"
import { canViewJourney } from "../journey/journey.policy"
import { journeyService } from "../journey/journey.service"
import type { ChatbotJourneyRequest, ChatbotTripQuery } from "./chatbot.dto"
import { presentChatbotJourney, presentChatbotTrip } from "./chatbot.presenter"
import { chatbotRepository } from "./chatbot.repository"

async function publishedEvent(eventCode?: string): Promise<EventRow> {
	const event = eventCode
		? await eventRepository.findByCode(eventCode)
		: await eventRepository.findCurrent()
	if (!event) throw new NotFoundError("Event")
	if (!canViewJourney(event.status)) {
		throw new ConflictError("Trip information has not been published.", {
			status: event.status,
		})
	}
	return event
}

export const chatbotService = {
	async trip(input: ChatbotTripQuery) {
		const event = await publishedEvent(input.eventCode)
		const [schedule, announcements] = await Promise.all([
			journeyRepository.schedule(event.id),
			// General context can only see announcements addressed to everyone.
			journeyRepository.announcements(event.id, false),
		])
		return presentChatbotTrip(event, schedule, announcements)
	},

	async journey(input: ChatbotJourneyRequest) {
		const event = await publishedEvent(input.eventCode)
		const userId = await chatbotRepository.findActiveUserId(input)
		if (!userId) throw new NotFoundError("Journey")
		let journey: Awaited<ReturnType<typeof journeyService.mine>>
		try {
			journey = await journeyService.mine(userId, event.id)
		} catch (error) {
			// Do not let callers distinguish "known employee without a registration"
			// from an unknown employee by comparing resource names in a 404 body.
			if (error instanceof NotFoundError) throw new NotFoundError("Journey")
			throw error
		}
		return presentChatbotJourney(journey)
	},
}
