import { defineConfig } from "tsup"

// One image, three entrypoints: the API process, the migration runner the
// deploy step executes before it starts, and the admin bootstrap.
//
// seed-admin is here because it has to run on the VM. Sign-up is closed
// (ADR-016), so a freshly provisioned environment has nobody who can sign in to
// import the employee list — and `pnpm seed:admin` is tsx, which the runtime
// image does not carry.
export default defineConfig({
	entry: ["src/main.api.ts", "src/db/migrate.ts", "src/db/seed-admin.ts"],
	format: "esm",
	outDir: "dist",
	target: "node22",
	clean: true,
	dts: false,
	sourcemap: true,
})
