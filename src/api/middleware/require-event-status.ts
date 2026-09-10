import { createMiddleware } from "hono/factory"

import type { EventStatus } from "../../db/schema/event.schema"
import { ConflictError } from "../../shared/errors"
import { requireEventScope } from "../types"
import type { AppEnv } from "../types"

/**
 * The edition's status is an authorization layer, not a display flag (ADR-005).
 *
 * Disabling a button in the browser stops nobody who can open a terminal, and an
 * employee editing their shift after the flights are booked is a real person in
 * the wrong airport. This is where that is actually refused.
 *
 * 409 rather than 403: the caller is who they say they are and may normally do
 * this — the edition has simply moved past the point where it is allowed. The
 * message says which state it is in, because "forbidden" sends people to their
 * manager instead of to the notice saying registration closed.
 */
export function requireEventStatus(...allowed: EventStatus[]) {
	const permitted = new Set(allowed)

	return createMiddleware<AppEnv>(async (c, next) => {
		const event = requireEventScope(c)
		if (!permitted.has(event.status)) {
			throw new ConflictError(
				`Thao tác này chỉ thực hiện được khi kỳ ở trạng thái ${allowed.join(" hoặc ")}. Kỳ hiện đang ở ${event.status}.`,
				{ status: event.status, allowed },
			)
		}
		await next()
	})
}
