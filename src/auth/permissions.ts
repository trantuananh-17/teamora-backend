import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"

/**
 * Access control for Better Auth's `admin` plugin only — the endpoints that ban,
 * impersonate and list accounts.
 *
 * This is NOT Teamora's authorization. Who may run an allocation, publish an
 * event or read another person's flight is decided in the API middleware at the
 * resource boundary (ADR-006), because those rules depend on `event.status` and
 * on ownership, neither of which a static role table can express.
 *
 * The four role names come from REQUIREMENTS §2 and are what `user.role` holds.
 * Declaring them here is what lets the plugin accept them at all.
 */
export const ac = createAccessControl(defaultStatements)

export const roles = {
	employee: ac.newRole({}),
	/**
	 * The BTC runs the event but does not administer accounts — account lifecycle
	 * follows the employee import, so handing out ban and impersonate here would
	 * be power nobody's job needs.
	 */
	organizer: ac.newRole({}),
	team_leader: ac.newRole({}),
	super_admin: ac.newRole(adminAc.statements),
} as const

export type TeamoraRole = keyof typeof roles
