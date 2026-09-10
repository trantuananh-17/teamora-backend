import { z } from "zod"

import { EVENT_STATUSES } from "../../db/schema/event.schema"

/**
 * Parsed in the controller with `schema.parse()`. A ZodError from here is turned
 * into a 422 by `api/middleware/error-handler.ts` and nowhere else.
 */

const eventSettingsSchema = z
	.object({
		terms: z.object({ version: z.string().min(1), body: z.string().min(1) }).optional(),
		shifts: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).optional(),
		allocationWeights: z.record(z.string(), z.number()).optional(),
	})
	// Unknown keys pass through: §13 has the organisers configuring knobs that do
	// not exist yet, and stripping one would silently lose a setting a later
	// release added and a rollback then read back.
	.loose()

/**
 * `code` is what appears in exports and email subjects, so it stays to a shape a
 * person can type and a spreadsheet will not reformat.
 */
const eventCodeSchema = z
	.string()
	.trim()
	.min(2)
	.max(32)
	.regex(/^[A-Za-z0-9_-]+$/, "Mã kỳ chỉ gồm chữ, số, gạch ngang và gạch dưới.")

export const createEventSchema = z.object({
	name: z.string().trim().min(1).max(200),
	code: eventCodeSchema,
	registrationOpenAt: z.coerce.date().nullish(),
	registrationCloseAt: z.coerce.date().nullish(),
	settings: eventSettingsSchema.default({}),
})

export type CreateEventInput = z.infer<typeof createEventSchema>

/**
 * `code` is absent on purpose. It is the human-facing identifier of an edition
 * and it travels in exports and emails that have already been sent; renaming it
 * afterwards makes those unmatchable.
 */
export const updateEventSchema = z
	.object({
		name: z.string().trim().min(1).max(200).optional(),
		registrationOpenAt: z.coerce.date().nullish(),
		registrationCloseAt: z.coerce.date().nullish(),
		settings: eventSettingsSchema.optional(),
	})
	.refine((input) => Object.keys(input).length > 0, "Không có trường nào để cập nhật.")

export type UpdateEventInput = z.infer<typeof updateEventSchema>

export const changeStatusSchema = z.object({
	status: z.enum(EVENT_STATUSES),
	/**
	 * Required by the service for a move backwards, optional going forward. The
	 * check lives there rather than here because it depends on the edition's
	 * current status, which a DTO cannot see.
	 */
	reason: z.string().trim().min(1).max(500).optional(),
})

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>
