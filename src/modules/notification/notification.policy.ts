export const MAX_NOTIFICATION_ATTEMPTS = 3

export type NotificationStatus = "pending" | "sent" | "failed"

export function failureTransition(attempts: number): {
	attempts: number
	status: "pending" | "failed"
} {
	const nextAttempts = attempts + 1
	return {
		attempts: nextAttempts,
		status: nextAttempts >= MAX_NOTIFICATION_ATTEMPTS ? "failed" : "pending",
	}
}

export function canRetryNotification(status: NotificationStatus): boolean {
	return status === "failed"
}
