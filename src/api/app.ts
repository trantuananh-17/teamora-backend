import { Hono } from "hono"
import { cors } from "hono/cors"

import { auth } from "../auth/auth"
import { env } from "../config/env"
import { checkDatabaseConnection } from "../db/client"
import { employeeRoutes } from "../modules/employee/employee.routes"
import { eventRoutes } from "../modules/event/event.routes"
import { pickupPointRoutes } from "../modules/pickup-point/pickup-point.routes"
import { teamRoutes } from "../modules/team/team.routes"
import { workLocationRoutes } from "../modules/work-location/work-location.routes"
import { errorHandler } from "./middleware/error-handler"
import { requestContext } from "./middleware/request-context"
import { attachSession } from "./middleware/session"
import type { AppEnv } from "./types"

/**
 * Deliberately localhost only. Every deployed origin is listed explicitly in
 * TRUSTED_ORIGINS, so staging can never make credentialed calls to production.
 */
const DEFAULT_ORIGINS = ["http://localhost:*", "https://localhost:*"]

function wildcardToRegex(pattern: string) {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
	return new RegExp(`^${escaped.replace(/\*/g, "[^/]*")}$`)
}

const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...env.trustedOrigins])].map(
	wildcardToRegex,
)

export function createApp() {
	const app = new Hono<AppEnv>()

	app.onError(errorHandler)
	app.use("*", requestContext)
	app.use(
		"*",
		cors({
			origin: (origin) =>
				ALLOWED_ORIGINS.some((pattern) => pattern.test(origin)) ? origin : null,
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization", "x-request-id"],
			credentials: true,
		}),
	)

	app.get("/health", async (c) => {
		const database = await checkDatabaseConnection()
		return c.json(
			{
				status: database ? "ok" : "degraded",
				database,
				time: new Date().toISOString(),
			},
			database ? 200 : 503,
		)
	})

	// Better Auth owns everything under its own base path and manages its own
	// session handling, so it is mounted before our session middleware.
	app.on(["GET", "POST"], "/v1/auth/*", (c) => auth.handler(c.req.raw))

	// Registered before the module routers, which is what makes it run for them:
	// Hono applies middleware only to handlers added after it.
	app.use("/v1/*", attachSession)

	app.route("/v1/work-locations", workLocationRoutes)
	app.route("/v1/employees", employeeRoutes)
	app.route("/v1/events", eventRoutes)
	// Both mount under the same prefix and carry their own `:eventId` segment,
	// the same way Ragenta layers several routers under /v1/workspaces.
	app.route("/v1/events", teamRoutes)
	app.route("/v1/events", pickupPointRoutes)

	app.notFound((c) =>
		c.json(
			{
				error: { code: "NOT_FOUND", message: "No route matches this request." },
				requestId: c.get("requestId") ?? "unknown",
			},
			404,
		),
	)

	return app
}
