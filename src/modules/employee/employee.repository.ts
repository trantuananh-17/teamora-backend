import { asc, eq, inArray, isNotNull } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { employeeProfile, user } from "../../db/schema"
import type { Gender } from "../../db/schema/employee.schema"

export type EmployeeProfileRow = typeof employeeProfile.$inferSelect

export interface EmployeeListRow {
	userId: string
	email: string
	name: string
	role: string | null
	profileId: string | null
	employeeCode: string | null
	phone: string | null
	workLocationId: string | null
	defaultTeamId: string | null
	gender: string | null
	active: boolean | null
}

/**
 * SQLite binds each element of an `in (...)` separately and has a ceiling on how
 * many. A five-thousand-row import would blow past it in one statement, so every
 * lookup here goes in chunks.
 */
const CHUNK = 400

function chunked<T>(values: T[]): T[][] {
	const out: T[][] = []
	for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK))
	return out
}

export interface UserInsert {
	id: string
	name: string
	email: string
	role: string
}

export interface ProfileInsert {
	id: string
	userId: string
	employeeCode: string | null
	phone: string | null
	workLocationId: string | null
	defaultTeamId: string | null
	gender: Gender
}

export const employeeRepository = {
	/**
	 * Rows are written into Better Auth's `user` table directly rather than
	 * through its API, because the import has to be one transaction (§13, and the
	 * Excel rules): Better Auth's adapter owns its own handle and cannot join one.
	 *
	 * That is safe because the shape is not guessed — `auth.schema.ts` is derived
	 * from `getAuthTables()` in the installed version. What is deliberately *not*
	 * written is an `account` row: an imported person has no password until they
	 * are given one, and `admin/set-user-password` creates the credential account
	 * when it is missing.
	 */
	async insertUser(row: UserInsert, executor: DbExecutor = db) {
		const now = new Date()
		await executor
			.insert(user)
			.values({ ...row, emailVerified: true, createdAt: now, updatedAt: now })
	},

	async updateUserName(userId: string, name: string, executor: DbExecutor = db) {
		await executor.update(user).set({ name }).where(eq(user.id, userId))
	},

	async insertProfile(row: ProfileInsert, executor: DbExecutor = db) {
		await executor.insert(employeeProfile).values(row)
	},

	async updateProfile(
		userId: string,
		input: Omit<ProfileInsert, "id" | "userId">,
		executor: DbExecutor = db,
	) {
		await executor.update(employeeProfile).set(input).where(eq(employeeProfile.userId, userId))
	},

	/** email (lower-case) → user id, for every address the sheet mentions. */
	async findUserIdsByEmails(
		emails: string[],
		executor: DbExecutor = db,
	): Promise<Map<string, string>> {
		const found = new Map<string, string>()
		for (const batch of chunked(emails)) {
			const rows = await executor
				.select({ id: user.id, email: user.email })
				.from(user)
				.where(inArray(user.email, batch))
			for (const row of rows) found.set(row.email.toLowerCase(), row.id)
		}
		return found
	},

	/** user ids that already have a profile, so the import knows insert from update. */
	async findProfileUserIds(
		userIds: string[],
		executor: DbExecutor = db,
	): Promise<Set<string>> {
		const found = new Set<string>()
		for (const batch of chunked(userIds)) {
			const rows = await executor
				.select({ userId: employeeProfile.userId })
				.from(employeeProfile)
				.where(inArray(employeeProfile.userId, batch))
			for (const row of rows) found.add(row.userId)
		}
		return found
	},

	/** employee code → the user who already holds it. Used to catch a stolen code. */
	async findUserIdsByEmployeeCodes(
		codes: string[],
		executor: DbExecutor = db,
	): Promise<Map<string, string>> {
		const found = new Map<string, string>()
		for (const batch of chunked(codes)) {
			const rows = await executor
				.select({ code: employeeProfile.employeeCode, userId: employeeProfile.userId })
				.from(employeeProfile)
				.where(inArray(employeeProfile.employeeCode, batch))
			for (const row of rows) if (row.code) found.set(row.code, row.userId)
		}
		return found
	},

	/** The admin list. A left join, so a user without a profile still appears. */
	async list(executor: DbExecutor = db): Promise<EmployeeListRow[]> {
		return executor
			.select({
				userId: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
				profileId: employeeProfile.id,
				employeeCode: employeeProfile.employeeCode,
				phone: employeeProfile.phone,
				workLocationId: employeeProfile.workLocationId,
				defaultTeamId: employeeProfile.defaultTeamId,
				gender: employeeProfile.gender,
				active: employeeProfile.active,
			})
			.from(user)
			.leftJoin(employeeProfile, eq(employeeProfile.userId, user.id))
			.orderBy(asc(user.name))
	},

	async countProfiles(executor: DbExecutor = db): Promise<number> {
		const rows = await executor
			.select({ userId: employeeProfile.userId })
			.from(employeeProfile)
			.where(isNotNull(employeeProfile.userId))
		return rows.length
	},
}
