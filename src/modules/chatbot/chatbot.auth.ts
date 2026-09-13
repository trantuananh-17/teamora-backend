import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Compare fixed-size digests so a wrong token never takes a visibly different
 * branch based on the first mismatching character or the supplied length.
 */
export function matchesBearerCredential(
	authorization: string | undefined,
	expected: string,
): boolean {
	const match = authorization?.match(/^Bearer\s+(.+)$/i)
	if (!match?.[1]) return false
	const actualDigest = createHash("sha256").update(match[1]).digest()
	const expectedDigest = createHash("sha256").update(expected).digest()
	return timingSafeEqual(actualDigest, expectedDigest)
}
