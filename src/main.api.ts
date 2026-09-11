import { serve } from "@hono/node-server"

import { createApp } from "./api/app"
import { env } from "./config/env"
import { closeDatabase, openDatabase } from "./db/client"
import { logger } from "./shared/logger"
import { startOutboxWorker, stopOutboxWorker } from "./modules/notification/notification.worker"

const log = logger.child({ process: "api" })

// Before the first request, so the connection pragmas are in force rather than
// racing the traffic that depends on them.
await openDatabase()

const server = serve({ fetch: createApp().fetch, port: env.port }, (info) => {
	log.info("api.started", { port: info.port, env: env.nodeEnv })
	// Start outbox worker after server is up. ADR-008: một process duy nhất
	startOutboxWorker()
})

function shutdown(signal: string) {
	log.info("api.shutdown", { signal })
	stopOutboxWorker()
	server.close()
	closeDatabase()
	process.exit(0)
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
