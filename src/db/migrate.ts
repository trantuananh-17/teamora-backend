import { migrate } from "drizzle-orm/libsql/migrator"

import { logger } from "../shared/logger"
import { closeDatabase, db, openDatabase } from "./client"

/**
 * Explicit migration step. Run as `pnpm db:migrate` locally and as
 * `node dist/db/migrate.js` in a deploy, BEFORE the API container starts —
 * never as a boot side effect (ADR-012).
 */
async function main() {
	await openDatabase()
	logger.info("migrate.start")
	await migrate(db, { migrationsFolder: "./drizzle" })
	logger.info("migrate.done")
}

main()
	.then(() => closeDatabase())
	.catch((error) => {
		logger.error("migrate.failed", error)
		closeDatabase()
		process.exit(1)
	})
