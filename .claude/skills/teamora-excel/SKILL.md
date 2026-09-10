---
name: teamora-excel
description: Import và export Excel/CSV trong Teamora — đọc file CBNV, chuyến bay, phân phòng; xuất mọi danh sách quản trị. Dùng khi thêm một luồng import hoặc export mới, hoặc khi sửa cách validate và báo lỗi của chúng.
---

# Import / Export Excel

§10 yêu cầu mọi danh sách phải export được, và §15 đưa "Import/Export Excel/CSV" vào MVP.
Thư viện: `exceljs` (Ragenta đã dùng, không thêm thư viện thứ hai).

Code dùng chung nằm ở `src/excel/`: `reader.ts`, `writer.ts`, và một file map cho mỗi domain
(`employee.map.ts`, `flight.map.ts`, `room-assignment.map.ts`).

## Không bao giờ import một nửa

Đây là luật quan trọng nhất ở đây.

```
đọc toàn bộ file → validate TỪNG dòng, gom hết lỗi
   ├─ có lỗi  → trả 422 kèm danh sách lỗi theo dòng, KHÔNG ghi gì cả
   └─ sạch    → ghi toàn bộ trong MỘT transaction
```

Một file 800 dòng sai ở dòng 500 mà đã ghi 499 dòng đầu để lại một trạng thái không ai mô tả được:
BTC không biết phải sửa file rồi import lại từ đầu hay chỉ import phần còn thiếu. Từ chối trọn vẹn
thì câu trả lời luôn là "sửa rồi import lại".

## Báo lỗi theo dòng

Người dùng là BTC ngồi trước một file Excel, không phải lập trình viên đọc log.

```ts
type RowError = { row: number; column?: string; message: string }
```

- `row` là **số dòng trong file Excel** (tính cả dòng tiêu đề), không phải index mảng. BTC sẽ nhấn
  Ctrl+G và nhảy tới đúng dòng đó.
- `column` là **tên cột người dùng thấy** ("Mã nhân viên"), không phải tên field (`employeeCode`).
- `message` bằng tiếng Việt, nói phải sửa thế nào: *"Team 'Kinh doanh 1' không có trong danh sách
  Team. Thêm Team này ở màn hình Master Data trước khi import."*

Trả tối đa ~100 lỗi rồi kèm tổng số — một file hỏng định dạng sẽ sinh vài nghìn lỗi và không ai đọc hết.

## File map

Mỗi luồng import khai báo cột ở một chỗ, dùng cho cả đọc lẫn ghi:

```ts
export const employeeColumns = [
  { key: "employeeCode", header: "Mã nhân viên", required: true },
  { key: "fullName",     header: "Họ và tên",    required: true },
  { key: "email",        header: "Email",        required: true },
  { key: "teamName",     header: "Bộ phận/Team", required: true },
  { key: "workLocation", header: "Địa điểm làm việc", required: true },
  { key: "phone",        header: "Số điện thoại", required: false },
  { key: "gender",       header: "Giới tính",     required: false },
] as const
```

Một nguồn cho template tải về, cho validate lúc đọc, và cho export. Ba chỗ khai báo riêng là ba chỗ
lệch nhau.

## Validate

Thứ tự, dừng ở lỗi đầu tiên của mỗi dòng:

1. **Header khớp map.** Thiếu cột bắt buộc → từ chối cả file ngay, không cần đọc dòng nào.
2. **Kiểu và định dạng** qua zod schema của domain.
3. **Master data tồn tại.** Tên Team, địa điểm làm việc, điểm đón phải khớp bản ghi đang có. §4.2
   cấm nhập tự do tên Team — import cũng là một dạng nhập.
4. **Trùng trong chính file.** Hai dòng cùng mã nhân viên là lỗi của file, không phải lỗi của DB.
5. **Xung đột với dữ liệu đang có.** Trùng mã, vượt sức chứa phòng, người đã có phòng khác (§13).

Excel hay gây ba chuyện, xử lý sẵn ở `reader.ts`:

- **Số điện thoại mất số 0 đầu** vì Excel coi là số. Đọc mọi thứ dạng text, không ép kiểu số.
- **Ngày giờ là serial number**, không phải chuỗi. Chuẩn hóa ở một chỗ duy nhất.
- **Khoảng trắng thừa và ký tự vô hình** cuối ô. `trim()` mọi ô trước khi validate.

## Giới hạn

File Excel là đầu vào không tin cậy. Chặn kích thước file và số dòng trước khi parse — một file
nén nhỏ có thể bung ra hàng triệu dòng và làm hết RAM của process. Giới hạn đọc từ `config/env.ts`.

## Import là hành động cần audit

Ghi **một** `audit_log` cho cả lần import, kèm tên file, số dòng tạo mới, số dòng cập nhật, actor.
Không ghi một entry cho mỗi dòng — 800 entry cho một thao tác làm trôi mất mọi thứ khác trong trail.

## Export

- Chỉ role `organizer` trở lên. Ghi audit (dữ liệu nhân sự đang rời khỏi hệ thống).
- Dùng đúng file map để tên cột giống hệt template import — file export sửa xong phải import lại được.
- Tôn trọng bộ lọc đang áp ở màn hình. BTC lọc "chưa đăng ký" rồi bấm export thì phải nhận đúng
  danh sách đó, không phải toàn bộ.
- **Không stream ra response trước khi biết query thành công.** Lỗi giữa chừng để lại một file
  `.xlsx` hỏng mà trình duyệt vẫn tải về như bình thường.

## Trước khi kết thúc

- Validate toàn bộ trước khi ghi dòng đầu tiên chưa?
- Ghi có nằm trong một transaction không?
- Lỗi có kèm số dòng Excel và tên cột tiếng Việt không?
- Có giới hạn kích thước và số dòng chưa?
- Đã ghi một `audit_log` cho cả lần import/export chưa?
- Cột export có khớp template import không?
