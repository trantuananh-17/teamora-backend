---
name: teamora-allocation
description: Viết hoặc sửa thuật toán phân bổ của Teamora — phân chuyến bay, phân xe, luồng preview/commit của allocation run, chỉnh tay và cảnh báo sức chứa. Dùng cho mọi thay đổi chạm vào allocator.ts hoặc module allocation; bắt buộc kèm unit test.
---

# Phân bổ

Đặc tả đầy đủ nằm ở `../.claude/docs/ALLOCATION.md` — thứ tự ưu tiên, pseudocode, bảng case biên,
khóa gom nhóm theo chặng. **Đọc nó trước.** Skill này nói cách viết code cho đúng đặc tả đó.

## Mọi lần chạy lại phải không phá chỉnh tay của BTC

Đây là bất biến số một (ADR-009). Nó chi phối toàn bộ thiết kế:

- Allocator nhận row `locked = true` như **chỗ đã bị chiếm**, và trừ vào sức chứa còn lại trước khi
  bắt đầu xếp.
- Cùng cơ chế "đặt trước" đó phục vụ luôn `registration.shiftLocked = true` (ADR-017): người có
  ràng buộc ca cứng được xếp ở **bước 0**, chỉ trong các chuyến đúng ca. Một cơ chế, hai nguồn —
  đừng viết nhánh thứ hai.
- Commit **bỏ qua** row `locked`, không ghi đè.
- Mọi file test có ít nhất một case cho điều này.

BTC bỏ nửa giờ chỉnh tay rồi bấm "chạy lại" và mất sạch là cách nhanh nhất khiến họ ngừng dùng
hệ thống. Không có gì trong module này quan trọng hơn điều đó.

## Allocator là hàm thuần

```ts
export function allocateFlights(input: FlightAllocationInput): AllocationPlan
```

Không đọc DB. Không ghi DB. Không gọi `Date.now()`, `Math.random()`, `fetch`. Không nhận
`AppContext`, không nhận `DbExecutor`.

Cần ngẫu nhiên thì nhận seed qua `input.params` và dùng PRNG deterministic. Một run không tái lập
được là một run không giải thích được cho BTC khi họ hỏi "sao người này lại ở chuyến kia".

Service lo phần bẩn: đọc snapshot, gọi allocator, lưu plan, ghi assignment.

## Bốn tầng, đừng trộn

| Tầng | Việc |
|---|---|
| `allocator.ts` | Hàm thuần: snapshot → plan. Có test |
| `<feature>.service.ts` | Đọc snapshot, gọi allocator, lưu `allocation_run`, commit trong transaction |
| `allocation/allocation-run.{service,repository}.ts` | Vòng đời preview → commit → discard, dùng chung cho mọi `type` |
| `<feature>.controller.ts` | Parse, gọi một service method, trả plan + stats |

Nếu thấy mình viết `await` bên trong `allocator.ts`, dừng lại — logic đó thuộc service.

## Preview không ghi assignment

```
POST   /v1/events/:eventId/allocations              → allocation_run, status = preview
GET    /v1/events/:eventId/allocations/:id          → plan + stats
POST   /v1/events/:eventId/allocations/:id/commit   → ghi thật, trong MỘT transaction
POST   /v1/events/:eventId/allocations/:id/discard
```

Commit **phải kiểm tra lại sức chứa** trước khi ghi: giữa preview và commit, BTC có thể đã chỉnh
tay ở tab khác. Vượt thì từ chối cả run và yêu cầu preview lại. Commit một nửa còn tệ hơn không
commit — nó để lại một trạng thái không ai mô tả được.

Commit ghi **một** entry `audit_log` cho cả run kèm `stats`, không phải một entry cho mỗi người.

## `stats` là hợp đồng với màn hình

§5.4 đòi hiển thị rõ số đã xếp, số slot còn lại và mức độ Team bị tách. Vì vậy `stats` có đúng năm
khóa và **không được đổi tên**:

```ts
{ assigned, unassigned, remainingSlots, teamsSplit, shiftUnmet }
```

`params` lưu trọng số đã dùng — nhờ đó mở lại một run cũ vẫn giải thích được kết quả.

## Flag, không im lặng

`team_split` · `shift_unmet` · `shift_locked_unmet` · `unassigned` · `over_capacity` (chỉ sinh từ
chỉnh tay).

`shift_unmet` và `shift_locked_unmet` khác nhau về mức độ, đừng gộp: cái đầu là "không chiều được
nguyện vọng", cái sau là "không xếp được người có ràng buộc công việc thật" (ADR-017). BTC phải
thấy cái sau trước, và UI tô nó `destructive` chứ không phải `warning`.

§5.3 yêu cầu bằng chữ: trường hợp không thể đáp ứng đồng thời các điều kiện **phải được đánh dấu**.
Một người bị xếp lệch ca mà không có flag là một người BTC sẽ không bao giờ biết để xử lý.

## Trọng số nằm trong `event.settings`

Thứ tự ưu tiên là quyết định của business (ADR-013), không phải hằng số trong code. Đọc từ
`event.settings`, có default trong `dto.ts`. Đảo ưu tiên là đổi cấu hình, **không sửa allocator**.

## Phân xe chạy sau phân chuyến bay

Input gồm `flight_assignment` đã commit. Bốn chặng chạy bốn lần độc lập. Khóa gom nhóm khác nhau
theo chặng — bảng đầy đủ ở `ALLOCATION.md`.

Hai chỗ hay sai:

- Chỉ nhận registration có `registration_transport_need.needed = true` ở **đúng chặng đó**.
- Người chưa có `flight_assignment` ở chiều tương ứng → flag `unassigned`, **không đoán bừa** họ đi
  chuyến nào.

## Test là bắt buộc

`allocator.test.ts` đặt cạnh `allocator.ts`. Không import service, không import repository, không
import `config/env.ts` — kéo theo bất cứ thứ nào trong đó là test fail ở CI dù pass ở máy.

Tối thiểu phải phủ:

- Team vừa khít một chuyến → không tách, không flag.
- Team lớn hơn mọi chuyến → tách, số mảnh là ít nhất, mọi thành viên có `team_split`.
- Tổng slot thiếu → phần dư `unassigned`.
- Nguyện vọng ca xung đột với giữ Team → Team thắng, người lệch ca có `shift_unmet`.
- Có row `locked` → chạy lại không đụng vào, sức chứa còn lại đã trừ đúng.
- `shiftLocked = true` → luôn đúng ca, kể cả khi điều đó làm Team bị tách.
- `shiftLocked = true` mà ca đó hết chỗ → `unassigned` + `shift_locked_unmet`, **không** rơi sang ca kia.
- Cùng input chạy hai lần → output giống hệt.
- Input rỗng, `capacity = 0`, Team một người, registration không có `teamId` → không văng lỗi.

**Assertion có mặt trong mọi test:** không chuyến nào, không xe nào vượt `capacity`.

## Trước khi kết thúc

- `allocator.ts` có còn thuần không? Có `await` nào lọt vào không?
- Case `locked` đã có test chưa?
- Mọi test có assert không vượt sức chứa chưa?
- `stats` có đủ năm khóa, đúng tên chưa?
- Trọng số có đọc từ `event.settings` chưa, hay còn hard-code?
- Commit có nằm trong một transaction và có kiểm tra lại sức chứa không?
- `ALLOCATION.md` có còn đúng sau thay đổi này không?
