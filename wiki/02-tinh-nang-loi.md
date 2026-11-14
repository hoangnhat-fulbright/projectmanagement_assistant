# 2. Tính năng lõi (phần giống Granola)

[← Trang chủ](README.md)

Đây là nền để ba tính năng mới đứng lên. Mục tiêu: đủ tốt để dùng hằng ngày, không cần vượt Granola.

## 2.1 Ghi âm không cần bot

- App chạy trên máy người dùng, thu **âm thanh hệ thống** (tiếng người khác trong Zoom/Meet/Teams) và **micro** (tiếng của mình) thành hai luồng riêng.
- Không có "bot" nào xuất hiện trong danh sách người tham gia cuộc họp.
- Hai luồng riêng giúp phân biệt "tôi" và "người khác" ngay cả khi chưa nhận diện giọng nói.
- Tự phát hiện cuộc họp sắp bắt đầu từ lịch và gợi ý bấm ghi.

Chi tiết kỹ thuật theo nền tảng: xem [Kiến trúc hệ thống](06-kien-truc-he-thong.md#thu-âm).

## 2.2 Phiên âm

- Phiên âm theo thời gian thực (streaming) để người dùng thấy chữ chạy trong lúc họp.
- Hỗ trợ **tiếng Việt và tiếng Anh**, kể cả cuộc họp trộn hai ngôn ngữ.
- Mỗi đoạn có mốc thời gian và nhãn người nói (tối thiểu: "Tôi" / "Người khác"; nâng cao: tách từng người).
- Âm thanh gốc không lưu lâu dài theo mặc định, chỉ giữ bản phiên âm. Xem [Bảo mật](10-bao-mat-quyen-rieng-tu.md).

## 2.3 Ghi chú thô + AI hoàn thiện

Luồng đặc trưng của Granola:

1. Trong lúc họp, người dùng gõ vài dòng ghi chú thô, chỉ những gì họ thấy quan trọng.
2. Khi họp xong, AI kết hợp ghi chú thô với bản phiên âm để viết biên bản hoàn chỉnh.
3. Phần người dùng tự gõ và phần AI bổ sung hiển thị khác màu, để biết câu nào đến từ đâu.
4. Mỗi ý trong biên bản liên kết ngược về đoạn phiên âm gốc.

Ghi chú thô là tín hiệu về **điều người dùng coi trọng**; AI ưu tiên mở rộng những ý đó thay vì tóm tắt đều mọi thứ.

## 2.4 Mẫu biên bản (templates)

| Mẫu | Các mục |
|---|---|
| Standup | Hôm qua, hôm nay, vướng mắc |
| Weekly / họp nhóm | Cập nhật, quyết định, action items |
| 1:1 | Chủ đề, phản hồi, việc tiếp theo |
| Họp khách hàng | Nhu cầu, phản đối, bước tiếp theo |
| Tùy chỉnh | Người dùng tự định nghĩa các mục |

Mọi mẫu đều có mục **Action items**, là đầu vào cho [One-Click Commitment](03-one-click-commitment.md).

## 2.5 Tìm kiếm và hỏi đáp

- Tìm toàn văn trên ghi chú và phiên âm.
- Hỏi AI trên một cuộc họp ("Khách hàng nói gì về giá?") hoặc nhiều cuộc họp ("Tháng này đã quyết những gì về tính năng X?").
- Câu trả lời luôn kèm trích dẫn về cuộc họp và mốc thời gian.

## 2.6 Chia sẻ

- Chia sẻ biên bản qua liên kết cho người tham gia.
- Người nhận không cần cài app vẫn đọc được biên bản và **vẫn xác nhận task được** (qua liên kết trong email, xem [One-Click Commitment](03-one-click-commitment.md#người-nhận-chưa-dùng-app)).

## 2.7 Gắn với lịch

- Kết nối Google Calendar / Outlook để lấy tiêu đề, người tham gia, chuỗi họp định kỳ.
- Dữ liệu lịch này dùng lại cho [Context-Aware Nudging](04-context-aware-nudging.md), nên việc kết nối lịch là bước thiết lập bắt buộc, không phải tùy chọn.

## Phạm vi MVP của phần lõi

| Có trong MVP | Để sau |
|---|---|
| Ghi âm hệ thống + micro trên một nền tảng | Đa nền tảng, mobile |
| Phiên âm Việt + Anh, nhãn Tôi / Người khác | Tách từng người nói |
| Ghi chú thô + AI hoàn thiện, 3 mẫu có sẵn | Mẫu tùy chỉnh |
| Tìm toàn văn | Hỏi đáp xuyên nhiều cuộc họp |
| Chia sẻ qua liên kết | Thư mục nhóm, phân quyền chi tiết |
