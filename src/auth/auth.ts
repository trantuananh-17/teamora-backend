import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin as adminPlugin } from "better-auth/plugins"

import { env } from "../config/env"
import { db } from "../db/client"
import { account, session, user, verification } from "../db/schema"
import { sendEmail } from "../mail/mailer"
import { renderPasswordReset } from "../mail/templates"
import { logger } from "../shared/logger"
import { ac, roles } from "./permissions"

/** Localhost only, for the same reason as DEFAULT_ORIGINS in src/api/app.ts. */
const DEFAULT_TRUSTED_ORIGINS = ["http://localhost:*", "https://localhost:*"]

/**
 * Better Auth owns identity only: users, sessions, password credentials.
 *
 * Teamora's own authorization — who may act on which event, and which
 * `event.status` allows it — lives in src/api/middleware and src/modules, not in
 * a plugin. Product endpoints do not go inside Better Auth.
 */
export const auth = betterAuth({
	appName: "Teamora",
	baseURL: env.apiBaseUrl,
	basePath: "/v1/auth",
	secret: env.auth.secret,
	trustedOrigins: [...DEFAULT_TRUSTED_ORIGINS, ...env.trustedOrigins],

	database: drizzleAdapter(db, {
		provider: "sqlite",
		// Off by default in 1.7.2, which is the setting for stores that cannot do
		// transactions. Without it a failed multi-step write leaves a user without
		// an account row (ADR-019). This is also the reason the driver is libsql
		// and not better-sqlite3, whose drizzle session is sync and rejects the
		// async callback the adapter passes — see STATUS.md.
		transaction: true,
		// The adapter only sees what is listed here.
		schema: { user, session, account, verification },
	}),

	advanced: {
		trustedProxyHeaders: true,
		ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
	},

	rateLimit: {
		window: 10,
		max: 100,
	},

	emailAndPassword: {
		enabled: true,
		minPasswordLength: 12,
		maxPasswordLength: 128,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user: resetUser, token }) => {
			const resetUrl = new URL("/reset-password", env.appBaseUrl)
			resetUrl.searchParams.set("token", token)
			const rendered = renderPasswordReset(resetUser.name, resetUrl.toString())

			// Better Auth deliberately returns the same response whether the address
			// exists. Keep SMTP work in the background so relay timing/failures cannot
			// turn that generic response into an account-enumeration side channel.
			void sendEmail({
				to: resetUser.email,
				subject: rendered.subject,
				html: rendered.html,
			}).catch((error: unknown) => {
				logger.error("auth.password_reset_email_failed", {
					userId: resetUser.id,
					error: error instanceof Error ? error.message : String(error),
				})
			})
		},
		/**
		 * Accounts come from the BTC's employee import, never from a form — there
		 * is no /signup route in the frontend either (ADR-016). Bootstrap the first
		 * `super_admin` with `pnpm seed:admin`.
		 */
		disableSignUp: true,
		/**
		 * Nothing to prove: the address is the one the BTC imported from the company
		 * roster, and no stranger can reach signup to claim it.
		 */
		requireEmailVerification: false,
	},

	user: {
		additionalFields: {
			role: { type: "string", required: false, input: false },
		},
	},

	plugins: [
		adminPlugin({
			ac,
			roles,
			defaultRole: "employee",
			adminRoles: ["super_admin"],
		}),
	],
})

export type Auth = typeof auth
export type AuthSession = typeof auth.$Infer.Session
export type AuthUser = AuthSession["user"]
