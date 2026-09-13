# Teamora Backend

## Chạy bằng Docker

Repository này tự chứa API, migration SQLite và Maildev:

```bash
docker compose up --build -d
docker compose ps
```

- API health: <http://localhost:8080/health>
- Maildev: <http://localhost:1080>
- Database: named volume `teamora-backend_teamora-data`

Lệnh `up` chạy migration one-shot trước khi API khởi động. Dừng và giữ dữ liệu:

```bash
docker compose down
```

Chỉ dùng `docker compose down --volumes` khi thực sự muốn xóa database local.

Trên native Linux, nếu frontend cũng chạy bằng Docker Compose từ repo riêng, cho
phép container frontend truy cập port API của host:

```bash
TEAMORA_API_BIND=0.0.0.0 docker compose up --build -d
```

Production không dùng file này; xem repository `teamora-deployment`.

## Chatbot server-to-server

Đặt `CHATBOT_API_KEY` tối thiểu 32 ký tự để bật hai endpoint read-only:

```text
GET /v1/integrations/chatbot/trip
GET /v1/integrations/chatbot/journey
```

Request phải mang `Authorization: Bearer <key>`. Journey nhận đúng một trong
`X-Teamora-Employee-Code` hoặc `X-Teamora-User-Email`; API key và identity chỉ được gửi từ backend
của website tích hợp, không gửi từ browser.
