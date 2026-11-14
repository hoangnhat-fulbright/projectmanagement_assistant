# Cam kết sau họp

App biến phiên âm cuộc họp thành các task được từng người xác nhận bằng một cú bấm, rồi nhắc việc vào lúc người đó rảnh. Đây là **giai đoạn 1 và 2** của dự án mô tả trong [wiki](wiki/README.md): trích xuất task từ phiên âm, One-Click Commitment và Context-Aware Nudging. Chưa có thu âm, phát hiện điểm nghẽn, và chưa kết nối Google Calendar thật (lịch đang nhập tay ở trang **Lịch thử**).

## Chạy thử

Cần Node.js 24 trở lên.

```bash
npm install
```

```bash
npm start
```

Mở http://localhost:3000, chọn **Cuộc họp mới** → **Điền ví dụ mẫu** → **Trích xuất task**. Lần khởi động đầu mất khoảng 10 giây để tạo database.

Không cần cấu hình gì để thử, nhưng mặc định app chạy ở hai chế độ thử:

| Chế độ thử | Vì sao | Cách chuyển sang thật |
|---|---|---|
| Trích xuất **demo** (luật từ khóa) | Chưa có khóa Claude | Đặt `ANTHROPIC_API_KEY` trong `.env` |
| Email nằm ở **/outbox**, không gửi đi | Chưa có SMTP | Đặt `SMTP_URL` và `MAIL_FROM` trong `.env` |

Sao chép `.env.example` thành `.env` để cấu hình. Khi đưa app lên mạng, bắt buộc đặt `APP_PASSWORD` và `BASE_URL`.

## Luồng

1. Người chủ trì dán phiên âm và danh sách người tham gia.
2. AI trích ra các task, mỗi task kèm câu trích dẫn nguyên văn. Task có trích dẫn không tìm thấy trong phiên âm bị loại.
3. Mỗi người nhận **một** email gom mọi task của họ, mỗi task có ba nút: Xác nhận, Sửa, Không phải của tôi.
4. Bấm nút mở một trang; hành động chỉ xảy ra khi bấm tiếp trên trang đó, nên bộ quét email không vô tình xác nhận thay.
5. Người chủ trì theo dõi ở bảng tổng hợp: task chưa có người nhận, bị từ chối, hết hạn chờ đều quay về đây.
6. Chưa phản hồi sau 4 giờ thì nhắc lại một lần; sau 72 giờ thì hết hạn chờ. Người đã có dữ liệu lịch được nhắc ở khoảng trống đầu tiên sau mốc 4 giờ.
7. Task đã cam kết được nhắc theo lịch của người làm (xem dưới).

## Nhắc việc theo lịch (giai đoạn 2)

Thiết kế ở [wiki/04-context-aware-nudging.md](wiki/04-context-aware-nudging.md). Tóm tắt những gì đang chạy:

| Loại nhắc | Khi nào |
|---|---|
| Nhắc chuẩn bị | 2 tiếng trước cuộc họp liên quan hoặc hạn (2 lần công sức nếu lớn hơn). Lúc đó bận thì dịch **sớm** lên đầu khoảng trống gần nhất, không bao giờ dịch muộn |
| Nhắc khoảng trống | Task chưa bắt đầu, còn dưới 48 giờ đến hạn: gửi vào đầu khoảng trống điểm cao nhất (đủ dài để làm xong, gần hạn) |
| Nhắc theo hạn | Người chưa có dữ liệu lịch: 2 tiếng trước hạn, trong giờ làm việc mặc định |

- Mỗi người tối đa 3 lần nhắc mỗi ngày, cách nhau ít nhất 90 phút; nhiều task đến giờ cùng lúc gom vào một email.
- Email nhắc có các nút **Xong rồi**, **Đang làm**, **Nhắc ở khoảng trống sau**, **Dời hạn**. Hoãn hai lần thì app hỏi dời hạn thay vì nhắc tiếp.
- Lịch nhắc được tính lại khi task hoặc lịch thay đổi, và được kiểm tra lại ngay trước khi gửi (task còn mở không, người đó có đang bận không).
- Người chủ trì chỉ thấy số lời nhắc của một task, không thấy giờ nhắc: giờ nhắc để lộ lịch của người làm.

### Thử nhanh

1. Tạo một cuộc họp từ ví dụ mẫu, mở **Hộp thư thử** và xác nhận một task thay người nhận.
2. Vào **Lịch thử**, chọn người đó, lưu giờ làm việc (tích cả T7, CN nếu đang thử cuối tuần) và thêm vài khung giờ bận. Từ lúc này người đó được nhắc theo lịch; phần **Lời nhắc** ở cuối trang cho biết sẽ nhắc lúc nào và vì sao.
3. Ở trang cuộc họp, mở **Nhắc việc** trên thẻ task để gắn cuộc họp liên quan và công sức ước tính.
4. Đến giờ, email nhắc xuất hiện ở **Hộp thư thử** (app kiểm tra mỗi phút; nút **Chạy lượt nhắc ngay** ở trang Lịch thử để khỏi chờ).

App không nhắc trong 30 phút đầu sau khi người làm vừa xác nhận task. Khi thử, đặt `NUDGE_QUIET_AFTER_COMMIT_MINUTES=0` trong `.env` để bỏ khoảng lặng này.

**Lịch thử** là nguồn lịch nhập tay, đứng sau cùng một interface (`CalendarSource` trong `src/calendar/source.ts`) mà Google Calendar sẽ dùng. Kết nối Google Calendar thật cần một OAuth client và chưa được làm.

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `npm start` | Chạy app |
| `npm run dev` | Chạy và tự khởi động lại khi sửa mã |
| `npm test` | Chạy test (database trong bộ nhớ, không gọi mạng) |
| `npm run try:claude` | Chạy bộ trích xuất Claude trên ví dụ mẫu và in kết quả. Thêm `-- phien-am.txt nguoi-tham-gia.txt` để thử phiên âm của bạn. Mỗi lần chạy là một lần gọi API có tính phí |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |

## Cấu trúc mã

| Đường dẫn | Nội dung |
|---|---|
| `src/main.ts` | Khởi động server và việc định kỳ (mỗi phút) |
| `src/app.ts` | Các route: trang của người chủ trì, trang Lịch thử, và trang hành động `/a/:token` |
| `src/pipeline.ts` | Trích xuất → kiểm tra → lưu task → gửi yêu cầu xác nhận |
| `src/ai/` | Bộ trích xuất Claude, bộ demo, và bước kiểm tra kết quả |
| `src/domain/tasks.ts` | Máy trạng thái của task và nhật ký sự kiện |
| `src/domain/tokens.ts` | Token dùng một lần cho liên kết trong email |
| `src/domain/notify.ts` | Gom task theo người và gửi email |
| `src/sweeper.ts` | Hết hạn chờ, và nhắc xác nhận sau 4 giờ cho người chưa có lịch |
| `src/nudge/gaps.ts` | Tính khoảng trống trong lịch (thuần, không I/O; giai đoạn 3 sẽ dùng lại) |
| `src/nudge/timing.ts` | Chọn thời điểm nhắc: nhắc chuẩn bị, nhắc khoảng trống, nhắc xác nhận (thuần) |
| `src/domain/nudges.ts` | Lập lịch lại, kiểm tra trước khi gửi, giới hạn chống làm phiền, gửi email nhắc |
| `src/domain/calendar.ts` | Bản sao lịch bận/rảnh và giờ làm việc trong database |
| `src/calendar/source.ts` | Interface nguồn lịch, đồng bộ vào bản sao, nguồn giả lập |
| `src/schema.sql` | Schema database |
| `src/views.ts`, `src/email.ts` | Giao diện web và nội dung email |

Mã chạy thẳng bằng Node, không có bước build. Database là PGlite (Postgres chạy trong tiến trình Node), dữ liệu nằm ở `data/pg`. SQL là SQL Postgres chuẩn; đổi sang server Postgres thật chỉ cần viết lại `src/db.ts`.
