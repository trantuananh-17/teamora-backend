import { serve } from "@hono/node-server"

import { createApp } from "./api/app"
import { env } from "./config/env"
import { closeDatabase, openDatabase } from "./db/client"
import { logger } from "./shared/logger"

const log = logger.child({ process: "api" })

// Before the first request, so the connection pragmas are in force rather than
// racing the traffic that depends on them.
await openDatabase()

const server = serve({ fetch: createApp().fetch, port: env.port }, (info) => {
	log.info("api.started", { port: info.port, env: env.nodeEnv })
})

function shutdown(signal: string) {
	log.info("api.shutdown", { signal })
	server.close()
	closeDatabase()
	process.exit(0)
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
