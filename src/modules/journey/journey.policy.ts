import type { EventStatus } from "../../db/schema/event.schema"

export function canViewJourney(status: EventStatus): boolean {
	return (
		status === "information_published" || status === "event_started" || status === "event_completed"
	)
}

export function shouldNotifyPublishedChange(status: EventStatus): boolean {
	return status === "information_published" || status === "event_started"
}
