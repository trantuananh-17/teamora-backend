import type { AppContext } from "../../api/types"
import { auditActor, requireUser } from "../../api/types"
import { env } from "../../config/env"
import { ValidationError } from "../../shared/errors"
import { employeeService } from "./employee.service"

export const employeeController = {
  async mine(c: AppContext) {
    return c.json(await employeeService.getMine(requireUser(c).id))
  },

  async list(c: AppContext) {
    return c.json({ items: await employeeService.list() })
  },

  async import(c: AppContext) {
    const body = await c.req.parseBody()
    const file = body.file

    if (!(file instanceof File)) {
      throw new ValidationError("Thiếu file. Gửi dạng multipart/form-data với trường \"file\".")
    }

    // Checked before reading the stream into memory: this is untrusted input and
    // there is only one process to run out of memory (ADR-008).
    if (file.size > env.import.maxFileBytes) {
      throw new ValidationError(
        `File vượt quá ${Math.floor(env.import.maxFileBytes / 1024 / 1024)}MB.`,
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    return c.json(await employeeService.importFromExcel(file.name, buffer, auditActor(c)))
  },
}
