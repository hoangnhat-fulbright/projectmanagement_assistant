# 1. Tổng quan sản phẩm

[← Trang chủ](README.md)

## Vấn đề

Các công cụ ghi chú họp bằng AI hiện nay làm tốt phần **ghi lại**: phiên âm, tóm tắt, liệt kê action items. Nhưng chúng dừng ở đó. Sau cuộc họp:

- Action items nằm trong biên bản, không ai chính thức nhận. Tuần sau họp lại mới phát hiện "tôi tưởng anh làm".
- Nhắc việc gửi vào giờ cố định (9h sáng) đúng lúc mọi người đang họp, nên bị bỏ qua.
- Việc này chờ việc kia, nhưng không ai thấy chuỗi phụ thuộc. Việc đầu trễ, cả chuỗi trễ, và đến sát giờ họp mới biết.

## Giải pháp

Một app ghi chú họp mà đầu ra không phải là biên bản, mà là **các cam kết được theo dõi đến khi xong**.

1. **Ghi lại** — như Granola: ghi âm trên máy, phiên âm, AI viết biên bản từ ghi chú thô. Xem [Tính năng lõi](02-tinh-nang-loi.md).
2. **Cam kết** — mỗi task được gửi đến đúng người và xác nhận bằng một cú bấm. Xem [One-Click Commitment](03-one-click-commitment.md).
3. **Nhắc đúng lúc** — dựa vào lịch của từng người. Xem [Context-Aware Nudging](04-context-aware-nudging.md).
4. **Cảnh báo sớm** — phát hiện chuỗi phụ thuộc sắp vỡ. Xem [Blocker Detection](05-blocker-detection.md).

## Người dùng mục tiêu

| Vai trò | Nhu cầu chính | Tính năng chạm nhiều nhất |
|---|---|---|
| Người chủ trì họp / quản lý nhóm | Biết ai nhận việc gì, việc nào đang nguy cơ trễ, không phải đi hỏi từng người | Commitment, Blocker Detection |
| Thành viên nhóm | Không quên việc đã hứa, được nhắc lúc rảnh chứ không phải lúc bận | Commitment, Nudging |
| Người phụ thuộc vào việc của người khác | Biết sớm khi việc mình đang chờ có nguy cơ trễ | Blocker Detection |

Quy mô nhắm đến lúc đầu: nhóm 5–30 người họp định kỳ (standup, weekly, sprint review), dùng Google Calendar hoặc Outlook.

## So với Granola

| | Granola | App này |
|---|---|---|
| Ghi âm không cần bot | Có | Có |
| Ghi chú thô + AI hoàn thiện | Có | Có |
| Action items | Liệt kê trong biên bản | Là đối tượng riêng: có người làm, hạn, trạng thái, phụ thuộc |
| Xác nhận nhận việc | Không | Một cú bấm từ thông báo |
| Nhắc việc | Không phải trọng tâm | Theo lịch từng người |
| Phụ thuộc giữa các việc | Không | Đồ thị phụ thuộc + cảnh báo rủi ro |

Điểm khác biệt nằm ở nửa sau: **từ biên bản đến hành động**. Phần ghi chú chỉ cần đủ tốt; phần theo dõi cam kết phải xuất sắc.

## Không làm (ít nhất ở giai đoạn đầu)

- Không thay thế công cụ quản lý dự án (Jira, Linear, Asana). App chỉ theo dõi các cam kết sinh ra từ cuộc họp, và có thể đồng bộ sang các công cụ đó sau.
- Không tự động chấm điểm hay xếp hạng nhân viên theo tỷ lệ hoàn thành.
- Không gửi bot vào cuộc họp.

## Thước đo thành công

| Chỉ số | Ý nghĩa | Mục tiêu ban đầu |
|---|---|---|
| Tỷ lệ xác nhận | Số task được xác nhận / số task AI đề xuất | ≥ 70% trong 24 giờ |
| Thời gian đến lúc xác nhận | Từ lúc họp xong đến lúc bấm xác nhận | Trung vị < 2 giờ |
| Tỷ lệ hoàn thành đúng hạn | Task đã cam kết xong trước hạn | Cao hơn nhóm chưa dùng app |
| Tỷ lệ nudge có phản hồi | Nudge dẫn tới hành động (xong, dời hạn, hẹn lại) | ≥ 40% |
| Thời gian cảnh báo sớm | Khoảng cách từ lúc cảnh báo blocker đến hạn của việc bị chặn | Trung vị ≥ 24 giờ |

Các mục tiêu trên là giả định ban đầu để định hướng, chưa có dữ liệu thực tế kiểm chứng.
