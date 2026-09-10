import { randomUUID } from "node:crypto"

/**
 * All primary keys are text so they stay compatible with the ids Better Auth
 * generates for its own tables.
 */
export function newId(): string {
	return randomUUID()
}
