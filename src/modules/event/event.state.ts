import { EVENT_STATUSES, type EventStatus } from "../../db/schema/event.schema"

/**
 * The §12 state machine, as a pure function of two statuses.
 *
 * It lives apart from the service because it is the one piece of this module
 * worth testing on its own: getting it wrong does not throw, it lets an
 * organiser publish an edition nobody has been allocated to, or reopen
 * registration after flights are booked.
 *
 * No database, no clock, no Hono.
 */

/** Index in EVENT_STATUSES is the forward order. §12 lists them in sequence. */
const ORDER = new Map<EventStatus, number>(EVENT_STATUSES.map((status, i) => [status, i]))

export function statusOrder(status: EventStatus): number {
	const order = ORDER.get(status)
	// Only reachable if a row carries a value the check constraint should have
	// refused — a hand-run UPDATE, say. Loud beats silently sorting it first.
	if (order === undefined) throw new Error(`Unknown event status: ${status}`)
	return order
}

/**
 * Forward moves are one step at a time (§12). Skipping a step is how an edition
 * reaches `information_published` without anyone having run an allocation.
 */
export function canAdvance(from: EventStatus, to: EventStatus): boolean {
	return statusOrder(to) === statusOrder(from) + 1
}

/**
 * Going backwards is a real operation — an organiser who closed registration a
 * day early needs it — but it is `super_admin` only and always audited, which
 * the service enforces. Here it is simply "is this a step back".
 */
export function canRevert(from: EventStatus, to: EventStatus): boolean {
	return statusOrder(to) < statusOrder(from)
}

/**
 * What an employee is allowed to do is a function of this, not of their role
 * (ADR-005). Both helpers below are the questions the guards actually ask.
 */

/** §4 — the only window in which an employee may create or edit a registration. */
export function allowsRegistrationEdit(status: EventStatus): boolean {
	return status === "registration_open"
}

/**
 * §13 and the security rules: flights, coaches, rooms and seats must not reach
 * an employee before the organisers publish. Unpublished allocations leaking out
 * produce real complaints from real people who then have to be told the plan
 * changed.
 */
export function allowsAllocationVisibility(status: EventStatus): boolean {
	return statusOrder(status) >= statusOrder("information_published")
}

/** The next status, or undefined at the end of the line. */
export function nextStatus(status: EventStatus): EventStatus | undefined {
	return EVENT_STATUSES[statusOrder(status) + 1]
}
