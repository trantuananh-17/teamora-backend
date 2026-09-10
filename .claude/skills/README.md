# Skills — teamora-backend

Hai nhóm, đối xử khác nhau.

## Skill của Teamora

| Skill | Bao gồm |
|---|---|
| `teamora-backend` | Tầng, naming module, idiom bắt buộc, guard trên route, outbox, lỗi |
| `teamora-database` | Schema SQLite/Drizzle, index, `onDelete`, transaction, migration |
| `teamora-allocation` | Allocator phân chuyến bay và phân xe, preview→commit, test bắt buộc |
| `teamora-excel` | Import/export Excel: validate, báo lỗi theo dòng, không import một nửa |

Sửa thoải mái khi thực tế đổi. Chúng dẫn chiếu về `../../.claude/docs/` cho phần sự thật, và không
lặp lại nội dung ở đó.

## Skill vendor — **không sửa tại chỗ**

| Skill | Nguồn |
|---|---|
| `better-auth-best-practices` | `github.com/better-auth/skills` |
| `better-auth-security-best-practices` | như trên |
| `email-and-password-best-practices` | như trên |
| `create-auth-skill` | như trên |

Copy nguyên văn từ `D:\Learn_code\Ragenta\ragenta-backend\.claude\skills\` ngày 2026-09-10.

**Không phải của chúng ta.** Sửa tại chỗ là mất lặng lẽ ở lần refresh tiếp theo từ upstream, và làm
nguồn gốc của chúng thành một lời nói dối. Teamora cần hướng dẫn khác thì **viết một skill Teamora
bên cạnh** và nói rõ nó khác ở đâu, vì sao.

Hai skill của upstream **cố ý không lấy**: `organization-best-practices` (Teamora không dùng
organization plugin — không có multi-tenant, xem ADR-004) và `two-factor-authentication-best-practices`
(chưa có yêu cầu).
