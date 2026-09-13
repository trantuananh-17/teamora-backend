import { and, eq, sql } from "drizzle-orm"

import { db, type DbExecutor } from "../../db/client"
import { employeeProfile, user } from "../../db/schema"
import type { ChatbotJourneyRequest } from "./chatbot.dto"

export const chatbotRepository = {
	async findActiveUserId(
		identity: Pick<ChatbotJourneyRequest, "employeeCode" | "email">,
		executor: DbExecutor = db,
	): Promise<string | undefined> {
		const identityCondition = identity.employeeCode
			? sql`lower(${employeeProfile.employeeCode}) = lower(${identity.employeeCode})`
			: sql`lower(${user.email}) = lower(${identity.email!})`
		const rows = await executor
			.select({ userId: user.id })
			.from(employeeProfile)
			.innerJoin(user, eq(employeeProfile.userId, user.id))
			.where(and(eq(employeeProfile.active, true), identityCondition))
			.limit(1)
		return rows[0]?.userId
	},
}
