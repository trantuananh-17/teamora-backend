---
name: teamora-database
description: Thiết kế và thay đổi schema SQLite của Teamora — bảng, cột, index, ràng buộc, migration, seed và thiết kế transaction với Drizzle. Dùng cho mọi thay đổi mô hình dữ liệu; teamora-backend sở hữu lịch sử migration duy nhất.
---

# Database

Mô hình dữ liệu đầy đủ nằm ở `../.claude/docs/DATA-MODEL.md`. Skill này là quy trình thay đổi.

## Trước khi thêm một bảng

Ba câu, theo thứ tự:

1. **Có `eventId` không?** Mặc định là có (ADR-004). Không có thì phải giải thích được — chỉ
   `employee_profile` và bốn bảng better-auth được miễn.
2. **Có thật sự cần một bảng không?** Nếu đây là cấu hình BTC đổi theo từng kỳ, chỗ của nó là một
   khóa trong `event.settings` JSON. Không cột mới, không migration.
3. **Nó nối vào `registration` hay vào `user`?** Bất cứ thứ gì thuộc "người này trong kỳ này" đều
   nối vào `registration`. Chỉ danh tính mới nối vào `user`.

## Viết schema

```ts
export const flight = sqliteTable(
  "flight",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    direction: text("direction").$type<"outbound" | "return">().notNull(),
    capacity: integer("capacity").notNull(),
    departAt: integer("depart_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("flight_eventId_code_direction_uidx").on(table.eventId, table.code, table.direction),
    index("flight_eventId_direction_idx").on(table.eventId, table.direction),
  ],
)
```

Điểm hay sai với SQLite, khác Postgres:

- **Không có `timestamp` type.** Dùng `integer(..., { mode: "timestamp_ms" })` — **`timestamp_ms`,
  không phải `timestamp`**. better-auth sinh cột date của nó ở mili-giây; trộn hai đơn vị trong một
  database làm mọi phép so sánh giữa bảng của mình và bảng auth lệch 1000 lần **mà không báo lỗi**
  (ADR-018). Lưu chuỗi ISO thì so sánh và sắp xếp sẽ sai lúc đổi timezone.
- **Không có `boolean`.** Dùng `integer(..., { mode: "boolean" })`.
- **Không có enum.** Dùng `text().$type<...>()` cộng `check` constraint. `$type` chỉ là kiểu ở phía
  TypeScript — nó **không** chặn giá trị rác đi vào từ import Excel hay từ seed.
- **Không có `jsonb`.** Dùng `text(..., { mode: "json" }).$type<Shape>()`.
- **`defaultNow()` không tồn tại.** Dùng `$defaultFn(() => new Date())`.
- Bật `PRAGMA journal_mode = WAL` và `PRAGMA busy_timeout` trong `db/client.ts`. Thiếu chúng, hai
  request ghi cùng lúc sẽ ném `SQLITE_BUSY` ngay lập tức thay vì chờ.

## Index

Mọi cột dùng để lọc trong repository đều cần index. Cụ thể ở Teamora:

- `(eventId, <thứ gì đó>)` trên **mọi** bảng nghiệp vụ — vì mọi query đều có `eventId`.
- `unique(eventId, userId)` trên `registration`.
- `unique(registrationId, direction)` trên `flight_assignment`;
  `unique(registrationId, leg)` trên `vehicle_assignment` và `registration_transport_need`.
- `(status, scheduledAt)` trên `notification` — vòng lặp outbox quét bằng nó mỗi vài giây.
- `(eventId, entity, entityId)` trên `audit_log`.

Unique index không chỉ để nhanh. `unique(registrationId, direction)` là thứ duy nhất ngăn một người
có hai ghế trên cùng một chiều khi hai request commit chạy đua nhau.

## `onDelete`

| Quan hệ | Chọn | Vì sao |
|---|---|---|
| Hầu hết → `event` | `cascade` | Xóa kỳ thử nghiệm phải dọn sạch |
| `audit_log` → `event` | **`restrict`** | Trail sống lâu hơn thứ nó ghi lại (ADR-010) |
| assignment → `registration` | `cascade` | Rút đăng ký thì phân bổ mất theo |
| assignment → `flight`/`vehicle`/`room` | **`restrict`** | Xóa một chuyến còn người ngồi phải bị chặn, không im lặng bỏ họ ra |

## Transaction

Service sở hữu transaction, repository không biết nó tồn tại.

```ts
await db.transaction(async (tx) => {
  await flightAssignmentRepository.replaceForRun(eventId, plan, tx)
  await allocationRunRepository.markCommitted(eventId, runId, tx)
  await auditService.record({ ... }, tx)
})
```

Ba thứ **bắt buộc** nằm trong một transaction:

1. Commit một allocation run + đánh dấu run + ghi audit.
2. Import Excel — toàn bộ file hoặc không dòng nào.
3. Đổi dữ liệu nghiệp vụ + enqueue `notification` cho thay đổi đó.

SQLite chỉ có một writer. Giữ transaction **ngắn**: không gọi SMTP, không đọc file, không gọi HTTP
bên trong. Tính toán trước, mở transaction, ghi, đóng.

## Migration

```powershell
pnpm db:generate     # sinh SQL vào ./drizzle
# ĐỌC file SQL vừa sinh
pnpm db:migrate      # áp dụng
```

- File trong `./drizzle` **được commit**. `check.yml` chạy lại `db:generate` và fail nếu có diff —
  schema và migration lệch nhau là lỗi CI hay gặp nhất.
- Áp dụng bằng `node dist/db/migrate.js` như một bước deploy tường minh, **không bao giờ lúc boot**
  (ADR-012).
- **Mở rộng trước, thu hẹp sau.** Thêm cột nullable ở release này, bỏ cột cũ ở release sau. Nhờ vậy
  rollback một version vẫn chạy được trên schema mới.
- SQLite không `ALTER COLUMN` được. Đổi kiểu hay đổi ràng buộc nghĩa là drizzle-kit sinh ra một
  bảng mới, copy dữ liệu, rồi đổi tên. **Phải đọc SQL** để biết điều đó đang xảy ra và nó có làm
  mất dữ liệu không.

## Seed

`db/migrate.ts` chạy `migrate()` rồi `seedMasterData()`. Seed phải **idempotent** — nó chạy lại ở
mọi lần deploy. Chỉ seed những thứ hệ thống không chạy được nếu thiếu (danh sách chặng, các trạng
thái). Dữ liệu demo thuộc về một script riêng, không thuộc `migrate.ts`.

## Checklist thay đổi schema

1. Bảng mới có `eventId` chưa? Không có thì lý do là gì?
2. Index nào cần? Mọi cột lọc trong repository.
3. `onDelete` đúng chưa? `audit_log` phải là `restrict`.
4. Thay đổi này có phải ghi audit không?
5. Có phá dữ liệu đang có không? Mở rộng trước, thu hẹp sau.
6. Đã `pnpm db:generate` và **đọc file SQL sinh ra** chưa?
7. `DATA-MODEL.md` đã cập nhật **trong cùng change** chưa?
