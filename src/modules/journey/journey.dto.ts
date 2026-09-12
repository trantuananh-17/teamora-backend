import { z } from "zod"

export const journeyQuerySchema = z.object({ eventId: z.string().min(1).optional() })
