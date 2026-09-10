import { defineConfig } from "tsup"

// One image, two entrypoints: the API process and the migration runner the
// deploy step executes before it starts.
export default defineConfig({
	entry: ["src/main.api.ts", "src/db/migrate.ts"],
	format: "esm",
	outDir: "dist",
	target: "node22",
	clean: true,
	dts: false,
	sourcemap: true,
})
