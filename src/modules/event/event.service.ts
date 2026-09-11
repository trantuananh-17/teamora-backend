import { db } from "../../db/client"
import type { EventStatus } from "../../db/schema/event.schema"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors"
import { newId } from "../../shared/id"
import type { Page, PaginationQuery } from "../../shared/pagination"
import { page } from "../../shared/pagination"
import { auditService, type AuditActor } from "../audit/audit.service"
import type { ChangeStatusInput, CreateEventInput, UpdateEventInput } from "./event.dto"
import { eventRepository, type EventRow } from "./event.repository"
import { canAdvance, canRevert } from "./event.state"

const ENTITY = "event"

/**
 * Owns the rules, the transactions and the audit writes. Imports no Hono and
 * takes no `Context` — that is what lets the Excel import and a seed script call
 * the same methods the HTTP layer does.
 */
export const eventService = {
	async getCurrent(): Promise<EventRow | null> {
		return (await eventRepository.findCurrent()) ?? null
	},

	async list(query: PaginationQuery): Promise<Page<EventRow>> {
		const { items, total } = await eventRepository.list(query)
		return page(items, total, query)
	},

	async getById(eventId: string): Promise<EventRow> {
		const found = await eventRepository.findById(eventId)
		if (!found) throw new NotFoundError("Event")
		return found
	},

	async create(input: CreateEventInput, actor: AuditActor): Promise<EventRow> {
		assertRegistrationWindow(input.registrationOpenAt, input.registrationCloseAt)

		// Checked here for a readable message; the unique index is what actually
		// holds under two concurrent creates, and its failure surfaces as a 500 we
		// would rather never show. One organiser at a time makes that vanishingly
		// rare, so this is not worth a retry loop.
		if (await eventRepository.findByCode(input.code)) {
			throw new ConflictError(`Đã có kỳ mang mã "${input.code}".`)
		}

		return db.transaction(async (tx) => {
			const created = await eventRepository.insert(
				{
					id: newId(),
					name: input.name,
					code: input.code,
					registrationOpenAt: input.registrationOpenAt ?? null,
					registrationCloseAt: input.registrationCloseAt ?? null,
					settings: input.settings,
				},
				tx,
			)

			await auditService.record(
				{
					eventId: created.id,
					actor,
					entity: ENTITY,
					entityId: created.id,
					action: "create",
					after: created,
				},
				tx,
			)

			return created
		})
	},

	async update(eventId: string, input: UpdateEventInput, actor: AuditActor): Promise<EventRow> {
		const before = await this.getById(eventId)

		assertRegistrationWindow(
			input.registrationOpenAt === undefined ? before.registrationOpenAt : input.registrationOpenAt,
			input.registrationCloseAt === undefined
				? before.registrationCloseAt
				: input.registrationCloseAt,
		)

		return db.transaction(async (tx) => {
			const after = await eventRepository.update(eventId, input, tx)
			if (!after) throw new NotFoundError("Event")

			await auditService.record(
				{ eventId, actor, entity: ENTITY, entityId: eventId, action: "update", before, after },
				tx,
			)

			return after
		})
	},

	/**
	 * §12. Forward is one step at a time and any organiser may do it; backwards is
	 * `super_admin` only, which the route enforces, and always needs a reason.
	 *
	 * Both directions are audited. "Who reopened registration, and why" is a
	 * question that gets asked after something has already gone wrong.
	 */
	async changeStatus(
		eventId: string,
		input: ChangeStatusInput,
		actor: AuditActor,
		options: { allowRevert: boolean },
	): Promise<EventRow> {
		const before = await this.getById(eventId)
		const target: EventStatus = input.status

		if (target === before.status) {
			throw new ConflictError(`Kỳ đã ở trạng thái ${target}.`)
		}

		const reverting = canRevert(before.status, target)

		// A capability the route grants, not a role this service knows about. It is
		// what stops an organiser reverting an edition by posting a backwards status
		// to the advance endpoint, which `requireSuperAdmin` on the other route
		// would otherwise never see.
		if (reverting && !options.allowRevert) {
			throw new ForbiddenError("Lùi trạng thái kỳ là thao tác của super_admin.")
		}

		if (!reverting && !canAdvance(before.status, target)) {
			throw new ConflictError(
				`Không thể chuyển thẳng từ ${before.status} sang ${target}. Trạng thái đi tiến từng bước một.`,
				{ from: before.status, to: target },
			)
		}

		if (reverting && !input.reason) {
			throw new ValidationError("Lùi trạng thái kỳ phải kèm lý do.", {
				field: "reason",
			})
		}

		return db.transaction(async (tx) => {
			// `publishedAt` records the first publication and is never cleared: the
			// emails that went out at that moment cannot be unsent, so the timestamp
			// stays true even if an organiser later steps the edition back.
			const publishAt =
				target === "information_published" && !before.publishedAt ? new Date() : null

			const after = await eventRepository.updateStatus(eventId, target, publishAt, tx)
			if (!after) throw new NotFoundError("Event")

			await auditService.record(
				{
					eventId,
					actor,
					entity: ENTITY,
					entityId: eventId,
					action: reverting ? "status_revert" : "status_advance",
					before: { status: before.status },
					after: { status: after.status },
					reason: input.reason,
				},
				tx,
			)

			return after
		})
	},
}

/**
 * A window that closes before it opens silently disables registration for
 * everyone, and the screen that would show it is the one nobody looks at until
 * an employee reports they cannot sign up.
 */
function assertRegistrationWindow(open: Date | null | undefined, close: Date | null | undefined) {
	if (open && close && close.getTime() <= open.getTime()) {
		throw new ValidationError("Thời điểm đóng đăng ký phải sau thời điểm mở.", {
			registrationOpenAt: open,
			registrationCloseAt: close,
		})
	}
}
