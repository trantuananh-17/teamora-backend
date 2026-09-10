import { createMiddleware } from "hono/factory"

import { NotFoundError } from "../../shared/errors"
import { eventRepository } from "../../modules/event/event.repository"
import type { AppEnv } from "../types"

/**
 * Resolves `:eventId` once for the whole subtree and puts the row in the
 * context. Every route carrying `:eventId` mounts this (ADR-004).
 *
 * An edition that does not exist answers **404, not 403**. A 403 would confirm
 * that the id is real, which is a fact the caller is not entitled to.
 *
 * This resolves the edition; it does not decide who may touch it. That is
 * `requireOrganizer` and `requireEventStatus`, and for an employee's own data it
 * is the service deriving their `registration` from the session.
 */
export const eventScope = createMiddleware<AppEnv>(async (c, next) => {
	const eventId = c.req.param("eventId")
	if (!eventId) throw new NotFoundError("Event")

	const found = await eventRepository.findById(eventId)
	if (!found) throw new NotFoundError("Event")

	c.set("event", found)
	c.set("logger", c.get("logger").child({ eventId: found.id }))
	await next()
})
