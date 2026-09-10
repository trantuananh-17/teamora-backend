import { defineConfig } from "vitest/config"

/**
 * Unit tests only, and deliberately so.
 *
 * Nothing here opens the SQLite file. The suite runs in the same `check` job as
 * the compiler, and `src/config/env.ts` validates at import — so a test that
 * pulls in a repository passes locally with a `.env` present and fails in CI
 * with "Invalid environment configuration".
 *
 * What belongs here is the logic that is pure: the allocators, Excel import
 * validation, the event state machine.
 */
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		// S0 has no pure logic worth a test yet. The allocators arrive in S3 and
		// this can go then.
		passWithNoTests: true,
	},
})
