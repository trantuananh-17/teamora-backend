# teamora-backend

Hono API + better-auth + SQLite, **một process duy nhất**. Việc nền chạy bằng outbox table cộng
`setInterval` trong chính process này (ADR-008).

Context cấp workspace nằm ở `../CLAUDE.md` và `../.claude/docs/`.

## Commands

```powershell
pnpm dev:api        # tsx watch src/main.api.ts
pnpm build          # tsup → dist/
pnpm start:api      # node dist/main.api.js
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm db:generate    # drizzle-kit generate → ./drizzle  (đọc SQL sinh ra trước khi commit)
pnpm db:migrate     # tsx src/db/migrate.ts
pnpm db:studio      # drizzle-kit studio
```

## Skill vendor

`.claude/skills/better-auth-*` và `create-auth-skill` **không phải của chúng ta** — lấy nguyên văn
từ `github.com/better-auth/skills`. Không sửa tại chỗ: sửa xong là mất lặng lẽ ở lần refresh sau,
và làm nguồn gốc của chúng thành một lời nói dối. Cần hướng dẫn khác cho Teamora thì viết một skill
Teamora bên cạnh và nói rõ nó khác ở đâu.

## Layer rules

```
routes → controller → service → repository → db
```

- **Routes** là **bản đồ phân quyền**. Mọi route có `:eventId` mang `eventScope`. Route đổi dữ liệu
  mang thêm `requireOrganizer` và/hoặc `requireEventStatus(...)`. Đọc một route file phải trả lời
  được ai gọi được nó.
- **Controllers** parse DTO bằng `schema.parse()`, gọi **đúng một** service method, định hình
  response. Không query, không kiểm tra quyền, không rẽ nhánh nghiệp vụ.
- **Services** giữ luật, sở hữu transaction, ghi audit. **Không import `hono`, không nhận
  `Context`** — đó là điều cho phép outbox worker, script seed và luồng import Excel gọi lại cùng
  một method.
- **Repositories** là nơi duy nhất có SQL. Mọi method scope theo `eventId` và nhận
  `executor: DbExecutor = db` làm tham số cuối, để service quyết định nó chạy trong hay ngoài
  transaction.
- Lỗi là subclass của `AppError` trong `src/shared/errors.ts`.
  `api/middleware/error-handler.ts` là file **duy nhất** map lỗi sang HTTP.
- `src/config/env.ts` là nơi **duy nhất** đọc `process.env`.

Ba tầng nằm **cạnh** stack vì cả HTTP lẫn worker đều dùng và chúng không scope theo event:
`src/excel/`, `src/mail/`, `src/shared/`.

## Thêm một endpoint

1. DTO zod trong `<module>.dto.ts`, export cả `z.infer` type.
2. Service method: luật, transaction, audit. Signature `(eventId, ...ids, input, actorId)`.
3. Repository method nếu cần SQL mới — nhớ `eventId` trong `where` và `executor` ở cuối.
4. Controller method: parse → gọi service → trả response.
5. Dòng route, kèm `eventScope` và guard phù hợp. Route đổi dữ liệu của CBNV phải khai báo trạng
   thái kỳ nó chấp nhận.
6. Đụng schema thì `pnpm db:generate` và **đọc file SQL** trước khi commit.

## Những chỗ dễ sai ở đây

- **Không bao giờ tin một id do client gửi.** Actor lấy từ session, event lấy từ `eventScope`.
  Endpoint của CBNV không nhận `registrationId` — nó suy ra từ session cộng `eventId`.
- **Sai event trả 404, không phải 403.** 403 xác nhận sự tồn tại của thứ người ta không được thấy.
- **Handler gọi `requireUser(c)` / `requireEventScope(c)`, không ép kiểu `c.get(...)`.** Route quên
  middleware sẽ hỏng với 401/403 thay vì lặng lẽ chạy tiếp với `undefined`.
- **`event.status` là phân quyền, không phải cờ hiển thị.** CBNV gọi thẳng API vẫn phải bị chặn.
  Thông tin phân bổ không được rời khỏi backend trước `information_published`.
- **`capacity` không có cột đếm song song.** Số đã xếp luôn `COUNT` từ bảng assignment. Một cột
  `booked` sẽ lệch, và khi lệch thì không ai biết bên nào đúng.
- **Chạy lại allocator không được đụng row `locked`.** BTC đã chỉnh tay nghĩa là con người đã
  quyết. Allocator trừ chúng vào sức chứa còn lại và bỏ qua khi commit (ADR-009).
- **Allocator là hàm thuần.** Không đọc DB, không ghi DB, không gọi `Date.now()`. Cần ngẫu nhiên
  thì nhận seed qua `params`. Đó là điều cho phép nó có unit test thật.
- **Commit allocation kiểm tra lại sức chứa.** Giữa preview và commit, BTC có thể đã chỉnh tay ở
  tab khác. Vượt thì từ chối cả run — commit một nửa còn tệ hơn không commit.
- **Import Excel không bao giờ import một nửa.** Validate toàn bộ file trước khi ghi dòng đầu tiên,
  và ghi trong một transaction. Một file sai định dạng phải bị từ chối trọn vẹn.
- **`audit_log` lưu ảnh chụp tên và email của actor**, không chỉ `actorId` — trail phải đọc được
  sau khi tài khoản bị xóa. Xóa event không xóa audit log.
- **Email chỉ chứa dữ liệu của chính người nhận.** Không CC danh sách CBNV, không gộp nhiều người
  vào một email có thông tin cá nhân.
- **Một unit test không được chạm database, kể cả qua import.** `src/config/env.ts` validate lúc
  import và `db/client.ts` import nó — một test kéo theo repository sẽ pass ở máy (có `.env`) và
  fail ở CI với "Invalid environment configuration". Tái hiện CI bằng
  `$env:DOTENV_CONFIG_PATH="/nonexistent.env"; pnpm test`.
- **Migration là bước deploy tường minh**, không chạy lúc boot. Mở rộng trước, thu hẹp ở release
  sau, để rollback một version vẫn chạy được (ADR-012).
- **Không đặt endpoint sản phẩm bên trong plugin của better-auth.** Auth lo danh tính; nghiệp vụ ở
  `modules/`.
