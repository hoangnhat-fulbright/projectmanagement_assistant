# Thuật ngữ

[← Trang chủ](README.md)

| Thuật ngữ | Nghĩa trong dự án này | Xem thêm |
|---|---|---|
| **Action item** | Một việc cần làm được nhắc đến trong cuộc họp. Trước khi được xác nhận, nó chỉ là đề xuất của AI. | [AI pipeline](08-ai-pipeline.md) |
| **Task** | Action item đã được đưa vào hệ thống thành một đối tượng có người làm, hạn và trạng thái. | [Mô hình dữ liệu](07-mo-hinh-du-lieu.md) |
| **Cam kết (commitment)** | Task đã được chính người làm xác nhận. Chỉ task đã cam kết mới được nhắc và theo dõi rủi ro. | [One-Click Commitment](03-one-click-commitment.md) |
| **Người làm (owner)** | Người chịu trách nhiệm hoàn thành một task. Mỗi task có đúng một người làm. | |
| **Người chủ trì (organizer)** | Người tổ chức cuộc họp. Mặc định là người nhận bảng tổng hợp và cảnh báo blocker. | |
| **Người quản lý** | Người nhận cảnh báo blocker để điều chỉnh kế hoạch. Mặc định là người chủ trì. | [Quyết định còn mở](12-quyet-dinh-mo.md) |
| **Nudge** | Một lời nhắc về task, gửi vào thời điểm được chọn theo lịch của người nhận. | [Nudging](04-context-aware-nudging.md) |
| **Nhắc chuẩn bị (prep nudge)** | Nudge gửi trước cuộc họp liên quan, mặc định 2 tiếng. | [Nudging](04-context-aware-nudging.md) |
| **Nhắc khoảng trống (gap nudge)** | Nudge gửi vào đầu một khoảng trống đủ dài để làm việc đó. | [Nudging](04-context-aware-nudging.md) |
| **Khoảng trống (gap)** | Đoạn thời gian trong giờ làm việc, không có sự kiện bận, dài ít nhất 15 phút. | [Nudging](04-context-aware-nudging.md#bước-1-tìm-các-khoảng-trống) |
| **Cuộc họp liên quan** | Cuộc họp mà kết quả của task cần có trước: cuộc họp được nhắc tên, hoặc lần kế tiếp của chuỗi họp định kỳ. | [Nudging](04-context-aware-nudging.md#xác-định-cuộc-họp-liên-quan) |
| **Công sức ước tính (effort)** | Số phút AI ước tính cần để làm xong task; người dùng sửa được. | [AI pipeline](08-ai-pipeline.md) |
| **Phụ thuộc (dependency)** | Quan hệ "việc B cần việc A xong trước". | [Blocker Detection](05-blocker-detection.md) |
| **Việc đi trước / việc bị chặn** | Trong cặp A → B: A là việc đi trước (blocking), B là việc bị chặn (blocked). | [Blocker Detection](05-blocker-detection.md) |
| **Blocker** | Tình huống việc đi trước có nguy cơ trễ đến mức việc bị chặn không kịp hạn. | [Blocker Detection](05-blocker-detection.md) |
| **Mức rủi ro** | `on_track`, `at_risk` hoặc `late`, tính cho từng task đang mở. | [Blocker Detection](05-blocker-detection.md#đánh-giá-rủi-ro-của-một-task) |
| **Thời điểm dự kiến xong** | Ước tính lúc task hoàn thành, dựa trên công sức còn lại và khoảng trống trong lịch người làm. | [Blocker Detection](05-blocker-detection.md) |
| **Bản sao lịch** | Bản lưu bận/rảnh của người dùng trong database, cập nhật qua webhook. | [Kiến trúc](06-kien-truc-he-thong.md#bản-sao-lịch) |
| **Ghi chú thô** | Những dòng người dùng tự gõ trong lúc họp, trước khi AI hoàn thiện. | [Tính năng lõi](02-tinh-nang-loi.md) |
| **Biên bản** | Ghi chú hoàn chỉnh do AI viết từ ghi chú thô và phiên âm. | [Tính năng lõi](02-tinh-nang-loi.md) |
| **Phiên âm (transcript)** | Văn bản chuyển từ lời nói trong cuộc họp, có mốc thời gian và nhãn người nói. | [Tính năng lõi](02-tinh-nang-loi.md) |
| **Liên kết ký (signed link)** | Liên kết trong email chứa token dùng một lần, cho phép thực hiện đúng một hành động trên đúng một task mà không cần đăng nhập. | [Bảo mật](10-bao-mat-quyen-rieng-tu.md#liên-kết-hành-động-trong-email) |
| **Workspace** | Không gian của một tổ chức hoặc nhóm; dữ liệu tách biệt giữa các workspace. | |
