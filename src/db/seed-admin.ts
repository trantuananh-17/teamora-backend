import { createLocalAccountIssuer } from "@better-auth/core/db"

import { auth } from "../auth/auth"
import { closeDatabase } from "./client"
import { logger } from "../shared/logger"

/**
 * Bootstraps the first `super_admin`. Every other account is created by the BTC's
 * employee import, and signup is closed (ADR-016) — so without this step a fresh
 * database has nobody who can sign in to run that import.
 *
 * Usage: pnpm seed:admin <email> <password> [name]
 */
async function main() {
	const [email, password, name = "Super Admin"] = process.argv.slice(2)
	if (!email || !password) {
		throw new Error("Usage: pnpm seed:admin <email> <password> [name]")
	}

	const ctx = await auth.$context

	const existing = await ctx.internalAdapter.findUserByEmail(email, {
		includeAccounts: false,
	})
	if (existing) {
		logger.info("seed.admin.exists", { userId: existing.user.id })
		return
	}

	const user = await ctx.internalAdapter.createUser(
		{
			email,
			name,
			emailVerified: true,
			role: "super_admin",
		},
		{ method: "admin" },
	)

	await ctx.internalAdapter.linkAccount({
		userId: user.id,
		providerId: "credential",
		// Better Auth 1.7 scopes account identity on (issuer, accountId); its own
		// sign-up path stamps local credentials with this exact value, and sign-in
		// looks the account up by it.
		issuer: createLocalAccountIssuer("credential"),
		accountId: user.id,
		password: await ctx.password.hash(password),
	})

	logger.info("seed.admin.created", { userId: user.id })
}

main()
	.then(() => closeDatabase())
	.catch((error) => {
		logger.error("seed.admin.failed", error)
		closeDatabase()
		process.exit(1)
	})
