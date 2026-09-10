---
name: teamora-backend
description: Làm việc trong teamora-backend — Hono API, better-auth, SQLite/Drizzle, một process duy nhất. Dùng khi thêm hoặc sửa endpoint, module, domain service, phân quyền, middleware, xử lý lỗi, gửi email qua outbox, hoặc khi cần biết một tầng phải được tổ chức thế nào.
---

# teamora-backend

Luật tầng và danh sách chỗ dễ sai nằm ở `CLAUDE.md` của repo này. Kiến trúc tổng nằm ở
`../.claude/docs/ARCHITECTURE.md`. Skill này là thủ tục, không lặp lại hai file đó.

## Naming

Mỗi module là `src/modules/<feature>/` với các file `<feature>.<layer>.ts`:
`<feature>.routes.ts` · `.controller.ts` · `.service.ts` · `.repository.ts` · `.dto.ts`.
Logic phụ trợ nằm cạnh dưới tên riêng: `allocator.ts`, `import.ts`.

Module chỉ có service, không có route, là hợp lệ khi nó không có endpoint — `audit/` là ví dụ.

## Idiom bắt buộc

Bốn thứ này lấy từ Ragenta và cố ý giữ nguyên. Đừng "cải tiến" chúng:

1. **Service, controller, repository là object literal export**, không phải class.
   ```ts
   export const flightService = {
     async create(eventId: string, input: CreateFlightInput, actorId: string) { ... },
   }
   ```
2. **Validate bằng `schema.parse()` trong controller.** Không dùng `@hono/zod-validator`.
   `ZodError` do `app.onError` bắt và map sang 422 kèm danh sách issue.
3. **Mọi method repository nhận `executor: DbExecutor = db` làm tham số cuối.** Đó là thứ cho phép
   cùng một method chạy trong hoặc ngoài transaction — service quyết định, repository không biết.
4. **Response thành công là JSON trần, không envelope.** Thường là một khóa có tên: `{ flight }`,
   `{ flights }`, hoặc `Page<T> = { items, total, limit, offset }`. `201` khi tạo,
   `c.body(null, 204)` khi xóa. Chỉ **lỗi** mới có envelope:
   `{ error: { code, message, details? }, requestId }`.

## Guard trên route

Ghép từ trái sang phải trên từng dòng route:

| Guard | Khi nào |
|---|---|
| `requireAuth` | `.use("*", ...)` đầu file, mọi module |
| `eventScope` | **Mọi** route có `:eventId`. Không có ngoại lệ |
| `requireOrganizer` | Route BTC dùng: cấu hình, phân bổ, import, export |
| `requireSuperAdmin` | Lùi trạng thái kỳ, xóa event, quản lý role |
| `requireEventStatus(...)` | Route CBNV đổi dữ liệu, và route công bố thông tin |

```ts
export const registrationRoutes = new Hono<AppEnv>()
registrationRoutes.use("*", requireAuth)

registrationRoutes.get("/:eventId/me/registration", eventScope, registrationController.mine)
registrationRoutes.put(
  "/:eventId/me/registration",
  eventScope,
  requireEventStatus("registration_open"),
  registrationController.upsert,
)
registrationRoutes.get(
  "/:eventId/registrations",
  eventScope,
  requireOrganizer,
  registrationController.list,
)
```

Route đầu và route thứ hai khác nhau đúng một guard, và đó là toàn bộ khác biệt giữa "xem đăng ký
của mình" và "sửa đăng ký của mình khi kỳ còn mở".

## Thêm một endpoint

Sáu bước ở `CLAUDE.md`. Ba câu hỏi hay bị bỏ qua:

- Endpoint này có phải ghi `audit_log` không? Mọi thứ đổi dữ liệu người khác nhìn thấy thì có.
- Nó có phải sinh `notification` không? §11 liệt kê năm trigger — đối chiếu.
- Nó trả dữ liệu phân bổ cho CBNV? Vậy phải chặn trước `information_published`.

## Outbox

Service **không gửi email trực tiếp**. Nó insert một row `notification` với `status = 'pending'`
trong **cùng transaction** với thay đổi nghiệp vụ.

```ts
await db.transaction(async (tx) => {
  const updated = await flightAssignmentRepository.update(..., tx)
  await auditService.record({ ... }, tx)
  await notificationService.enqueue({
    eventId, registrationId, channel: "email",
    template: "flight_changed", payload: { ... },
  }, tx)
})
```

Cùng transaction là điều quan trọng: đổi chuyến bay thành công mà email không được xếp hàng thì
CBNV bay nhầm chuyến. Xếp hàng email cho một thay đổi bị rollback thì gửi tin sai.

Vòng lặp gửi nằm ở `startOutboxWorker()` trong `main.api.ts` — không phải `node-cron`, không phải
process riêng (ADR-008).

## Lỗi

Ném `AppError` subclass từ service, không bao giờ ném `HTTPException`, không bao giờ trả
`c.json({ error })` tay trong controller.

| Lớp | Status | Dùng khi |
|---|---|---|
| `UnauthorizedError` | 401 | Chưa đăng nhập |
| `ForbiddenError` | 403 | Đã đăng nhập, sai role |
| `NotFoundError(resource)` | 404 | Không có, **và cả khi sai event scope** |
| `ConflictError` | 409 | Trùng mã chuyến, đăng ký hai lần |
| `ValidationError` | 422 | Luật nghiệp vụ, không phải sai kiểu |

Vượt sức chứa **không phải lỗi** khi BTC chỉnh tay — §5.5 nói "cảnh báo". Trả cảnh báo trong
response, đừng ném.

## Trước khi kết thúc

- Route mới có đủ `eventScope` và guard chưa?
- Repository method mới có `eventId` trong `where` và `executor` ở cuối chưa?
- Service có lỡ import `hono` không?
- Có ghi `audit_log` chỗ cần không?
- `pnpm typecheck` và `pnpm test` xanh chưa?
- Đụng schema thì đã `pnpm db:generate` và **đọc file SQL** chưa?
