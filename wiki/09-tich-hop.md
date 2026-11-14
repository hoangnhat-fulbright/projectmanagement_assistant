# 9. Tích hợp

[← Trang chủ](README.md)

## Tổng quan

| Tích hợp | Dùng cho | Giai đoạn |
|---|---|---|
| Google Calendar | Phát hiện cuộc họp, lịch bận/rảnh, chuỗi họp định kỳ | MVP |
| Email | Gửi yêu cầu xác nhận cho người chưa dùng app, bản tổng hợp | MVP |
| Thông báo desktop | Xác nhận, nudge, cảnh báo cho người dùng app | MVP |
| Slack | Kênh thông báo có nút bấm | Sau MVP |
| Microsoft Outlook / Teams | Lịch và thông báo cho nhóm dùng Microsoft 365 | Sau MVP |
| Jira / Linear / Asana | Đồng bộ task đã cam kết | Sau |

## Lịch

### Google Calendar

- Đăng nhập OAuth, xin quyền **chỉ đọc**.
- Hai loại dữ liệu cần đọc:
  - Sự kiện của chính người dùng (tiêu đề, người tham gia, chuỗi định kỳ) để gắn với cuộc họp được ghi.
  - Bận/rảnh để tính khoảng trống.
- Đăng ký nhận thông báo thay đổi (watch channel) để biết ngay khi lịch đổi. Kênh này có thời hạn nên cần gia hạn định kỳ, và vẫn cần đồng bộ dự phòng theo chu kỳ.

### Microsoft 365

- Microsoft Graph, quyền đọc lịch.
- Thông báo thay đổi qua subscription, cũng có thời hạn và cần gia hạn.

### Điều cần lưu ý

- **Mỗi người phải tự kết nối lịch của mình.** Nudging chỉ thông minh với người đã kết nối; người chưa kết nối nhận nhắc theo hạn. Phương án thay thế là quản trị viên cấp quyền cho cả tổ chức, xem [Quyết định còn mở](12-quyet-dinh-mo.md).
- Sự kiện đánh dấu "rảnh" (free) không tính là bận. Sự kiện cả ngày thường là ghi chú, không phải bận, trừ khi là nghỉ phép.
- Sự kiện chưa trả lời hoặc đã từ chối: không tính là bận.

## Kênh thông báo

Mỗi thông báo có thể hành động được ngay trên kênh, không bắt mở app.

### Thông báo desktop

- Thông báo hệ điều hành có nút hành động.
- Số nút hiển thị được trên thông báo hệ điều hành bị giới hạn, nên thông báo gom nhiều task chỉ có nút "Xác nhận tất cả" và "Xem chi tiết".

### Email

- Dùng cho người chưa cài app và cho bản tổng hợp.
- Nút trong email là liên kết chứa token ký, mở [trang xác nhận](03-one-click-commitment.md#người-nhận-chưa-dùng-app).
- Cần cấu hình xác thực tên miền gửi (SPF, DKIM, DMARC) để không rơi vào thư rác.

### Slack

- Tin nhắn riêng từ bot, dùng nút bấm tương tác.
- Khớp người dùng Slack với người tham gia họp qua email.
- Sau khi bấm, tin nhắn tự cập nhật thành trạng thái mới ("Đã xác nhận ✓") để không bấm lại được.

### Chọn kênh

1. Dùng kênh người dùng đã chọn trong cài đặt.
2. Nếu chưa chọn: app desktop đang chạy → thông báo desktop; ngược lại → Slack nếu đã kết nối; ngược lại → email.
3. Không gửi cùng một thông báo qua nhiều kênh. Ngoại lệ: cảnh báo mức `late` chưa được mở sau 2 giờ làm việc thì gửi lại qua kênh kế tiếp.

## Webhook nhận vào

| Nguồn | Sự kiện | Xử lý |
|---|---|---|
| Nhà cung cấp lịch | Lịch thay đổi | Đồng bộ lại, lập lịch lại nudge, đánh giá lại rủi ro |
| Slack | Người dùng bấm nút | Chuyển trạng thái task, cập nhật tin nhắn |
| Dịch vụ email | Thư bị trả lại, bị báo spam | Đánh dấu kênh email không dùng được cho người đó |

Mọi webhook phải kiểm tra chữ ký của bên gửi và xử lý lặp lại an toàn (cùng một sự kiện đến hai lần không gây hai lần tác động).

## Đồng bộ sang công cụ quản lý dự án (sau MVP)

Một chiều trước: task đã cam kết → tạo issue ở Jira/Linear/Asana, kèm liên kết về biên bản. Hai chiều (trạng thái issue đổi → task đổi) để sau vì phức tạp hơn nhiều.
