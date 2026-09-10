import "dotenv/config"
import { z } from "zod"

/**
 * The only place in the codebase that reads `process.env`. Everything else
 * imports `env` from here, so a missing or malformed variable fails at startup
 * with a readable message instead of surfacing as a null deref hours later
 * inside a request.
 *
 * The variable set is the one `.claude/docs/DEPLOYMENT.md` publishes as the
 * backend's deploy contract — adding one here means adding it there too.
 */
const envSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: z.coerce.number().int().positive().default(8080),

	API_BASE_URL: z.url(),
	/** Base for links inside employee email. Never taken from a request header. */
	APP_BASE_URL: z.url(),
	TRUSTED_ORIGINS: z.string().default(""),

	BETTER_AUTH_SECRET: z.string().min(32),

	/** Path to the SQLite file. It is production data — see `.claude/rules/security.md`. */
	DATABASE_PATH: z.string().min(1),

	/**
	 * Limits on the Excel import, which is untrusted input. A small compressed
	 * file can expand into millions of rows and exhaust this process, and there is
	 * only one process (ADR-008) — so the whole system goes with it.
	 *
	 * Both are checked before parsing begins, not while reading rows.
	 */
	IMPORT_MAX_FILE_BYTES: z.coerce
		.number()
		.int()
		.positive()
		.default(5 * 1024 * 1024),
	IMPORT_MAX_ROWS: z.coerce.number().int().positive().default(5_000),

	/**
	 * Mail is off entirely when SMTP_HOST is unset, which is what lets tests and
	 * a bare `pnpm dev:api` run without a relay. Half-configured is off, not
	 * half-on.
	 */
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().positive().default(1025),
	SMTP_USER: z.string().optional(),
	SMTP_PASS: z.string().optional(),
	MAIL_FROM: z.string().default("Teamora <no-reply@teamora.local>"),
})

function parseEnv() {
	const parsed = envSchema.safeParse(process.env)
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
			.join("\n")
		throw new Error(`Invalid environment configuration:\n${issues}`)
	}
	return parsed.data
}

const raw = parseEnv()

function splitList(value: string) {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
}

export const env = {
	nodeEnv: raw.NODE_ENV,
	isProduction: raw.NODE_ENV === "production",
	port: raw.PORT,

	apiBaseUrl: raw.API_BASE_URL,
	appBaseUrl: raw.APP_BASE_URL,
	trustedOrigins: splitList(raw.TRUSTED_ORIGINS),

	auth: { secret: raw.BETTER_AUTH_SECRET },

	databasePath: raw.DATABASE_PATH,

	import: {
		maxFileBytes: raw.IMPORT_MAX_FILE_BYTES,
		maxRows: raw.IMPORT_MAX_ROWS,
	},

	smtp: raw.SMTP_HOST
		? {
				host: raw.SMTP_HOST,
				port: raw.SMTP_PORT,
				user: raw.SMTP_USER,
				password: raw.SMTP_PASS,
				from: raw.MAIL_FROM,
			}
		: undefined,
} as const

export type Env = typeof env
