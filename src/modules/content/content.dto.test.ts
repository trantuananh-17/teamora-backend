import { describe, expect, it } from "vitest"
import { createAnnouncementSchema, createScheduleItemSchema } from "./content.dto"

describe("S5 content validation", () => {
	it("rejects a schedule item ending before it starts", () => {
		const result = createScheduleItemSchema.safeParse({ day: 1, startAt: "2026-10-16T10:00:00Z", endAt: "2026-10-16T09:00:00Z", title: "Sai giờ" })
		expect(result.success).toBe(false)
	})
	it("keeps announcements as drafts unless explicitly published", () => {
		const value = createAnnouncementSchema.parse({ title: "Thông báo", body: "Nội dung" })
		expect(value).toMatchObject({ audience: "participants", published: false })
	})
})
