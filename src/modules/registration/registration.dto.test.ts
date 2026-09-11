import { describe, expect, it } from "vitest"

import { createRegistrationSchema } from "./registration.dto"

const fourLegs = [
  { leg: "origin_to_airport", needed: false, pickupPointId: null },
  { leg: "airport_to_hotel", needed: false, pickupPointId: null },
  { leg: "hotel_to_airport", needed: false, pickupPointId: null },
  { leg: "airport_to_origin", needed: false, pickupPointId: null },
] as const

describe("createRegistrationSchema", () => {
  it("accepts a complete participating registration", () => {
    const parsed = createRegistrationSchema.parse({
      participating: true,
      teamId: "team-1",
      agreedTerms: true,
      shiftPreference: "shift_1",
      transportNeeds: fourLegs,
      wishNote: "Ăn chay",
    })

    expect(parsed.transportNeeds).toHaveLength(4)
  })

  it("requires terms, a shift and all four distinct transport legs", () => {
    const result = createRegistrationSchema.safeParse({
      participating: true,
      teamId: "team-1",
      agreedTerms: false,
      transportNeeds: [fourLegs[0], fourLegs[0], fourLegs[1], fourLegs[2]],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("agreedTerms")
      expect(paths).toContain("shiftPreference")
      expect(paths).toContain("transportNeeds")
    }
  })

  it("requires a pickup point exactly when a transport leg is needed", () => {
    const missingPoint = createRegistrationSchema.safeParse({
      participating: true,
      teamId: "team-1",
      agreedTerms: true,
      shiftPreference: "shift_2",
      transportNeeds: [
        { ...fourLegs[0], needed: true },
        fourLegs[1],
        fourLegs[2],
        fourLegs[3],
      ],
    })
    const stalePoint = createRegistrationSchema.safeParse({
      participating: true,
      teamId: "team-1",
      agreedTerms: true,
      shiftPreference: "shift_2",
      transportNeeds: [
        { ...fourLegs[0], pickupPointId: "point-1" },
        fourLegs[1],
        fourLegs[2],
        fourLegs[3],
      ],
    })

    expect(missingPoint.success).toBe(false)
    expect(stalePoint.success).toBe(false)
  })

  it("allows a non-participating response without terms, shift or transport", () => {
    expect(
      createRegistrationSchema.parse({ participating: false, teamId: "team-1" }),
    ).toEqual({ participating: false, teamId: "team-1" })
  })
})
