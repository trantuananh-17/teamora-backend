import { Hono } from "hono"
import { createMiddleware } from "hono/factory"

import type { AppEnv } from "../../api/types"
import { env } from "../../config/env"
import { NotFoundError, UnauthorizedError } from "../../shared/errors"
import { matchesBearerCredential } from "./chatbot.auth"
import { chatbotController } from "./chatbot.controller"

const requireChatbotApiKey = createMiddleware<AppEnv>(async (c, next) => {
	const expected = env.chatbot.apiKey
	// Disabled integrations are indistinguishable from routes that do not exist.
	if (!expected) throw new NotFoundError("Integration")
	if (!matchesBearerCredential(c.req.header("authorization"), expected)) {
		throw new UnauthorizedError("Invalid integration credentials.")
	}
	await next()
})

export const chatbotRoutes = new Hono<AppEnv>()
chatbotRoutes.use("*", requireChatbotApiKey)
chatbotRoutes.get("/trip", (c) => chatbotController.trip(c))
chatbotRoutes.get("/journey", (c) => chatbotController.journey(c))
