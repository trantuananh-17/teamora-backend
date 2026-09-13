import { describe, expect, it } from "vitest"

import { matchesBearerCredential } from "./chatbot.auth"

const key = "chatbot-test-key-with-at-least-32-characters"

describe("chatbot bearer authentication", () => {
	it("accepts the configured bearer credential", () => {
		expect(matchesBearerCredential(`Bearer ${key}`, key)).toBe(true)
		expect(matchesBearerCredential(`bearer ${key}`, key)).toBe(true)
	})

	it.each([undefined, "", "Basic abc", "Bearer wrong", "Bearer"])(
		"rejects an invalid authorization header: %s",
		(header) => expect(matchesBearerCredential(header, key)).toBe(false),
	)
})
