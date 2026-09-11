import { describe, expect, it } from "vitest"

import {
  canRetryNotification,
  failureTransition,
  MAX_NOTIFICATION_ATTEMPTS,
} from "./notification.policy"

describe("notification delivery policy", () => {
  it("keeps a notification pending before the final attempt", () => {
    expect(failureTransition(0)).toEqual({ attempts: 1, status: "pending" })
    expect(failureTransition(1)).toEqual({ attempts: 2, status: "pending" })
  })

  it("marks the notification failed at the retry ceiling", () => {
    expect(failureTransition(MAX_NOTIFICATION_ATTEMPTS - 1)).toEqual({
      attempts: MAX_NOTIFICATION_ATTEMPTS,
      status: "failed",
    })
  })

  it("only lets an organizer retry a terminal failure", () => {
    expect(canRetryNotification("failed")).toBe(true)
    expect(canRetryNotification("pending")).toBe(false)
    expect(canRetryNotification("sent")).toBe(false)
  })
})
