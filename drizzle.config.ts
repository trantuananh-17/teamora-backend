import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
	out: "./drizzle",
	schema: "./src/db/schema/index.ts",
	dialect: "turso",
	dbCredentials: {
		// `turso` is drizzle-kit's name for the libsql driver; a `file:` URL keeps
		// it on the local database rather than a remote one.
		url: `file:${process.env.DATABASE_PATH!}`,
	},
})
