# 12. Quyết định còn mở

[← Trang chủ](README.md)

Những điều cần chốt trước khi viết code. Khi chốt xong một mục: ghi câu trả lời và ngày vào cột "Kết luận", rồi cập nhật các trang liên quan.

Mức độ: **Chặn** = không bắt đầu được nếu chưa chốt · **Sớm** = cần trước giai đoạn tương ứng · **Sau** = có thể hoãn.

## Sản phẩm

| # | Câu hỏi | Lựa chọn | Đề xuất | Mức | Kết luận |
|---|---|---|---|---|---|
| S1 | Làm phần nào trước? | A. Thu âm và ghi chú trước · B. Ba tính năng mới trước, nhận phiên âm dán vào | B, lý do ở [Roadmap](11-roadmap.md#chiến-lược) | Chặn | **B** (2026-11-14) |
| S2 | Người dùng đầu tiên là ai? | Nhóm của chính mình · Một vài nhóm quen · Mở công khai | Nhóm của chính mình, để có dữ liệu họp thật | Chặn | Chưa chốt |
| S3 | Ngôn ngữ cuộc họp cần hỗ trợ? | Chỉ tiếng Việt · Chỉ tiếng Anh · Cả hai và trộn lẫn | Cả hai; ảnh hưởng lớn đến việc chọn dịch vụ phiên âm | Sớm | Chưa chốt |
| S4 | "Người quản lý" nhận cảnh báo blocker là ai? | Người chủ trì cuộc họp · Người được chỉ định theo nhóm · Lấy từ sơ đồ tổ chức | Người chủ trì, cho phép đổi | Sớm | Chưa chốt |
| S5 | Người chủ trì có duyệt task trước khi gửi cho mọi người không? | Luôn duyệt · Chỉ khi AI không chắc · Không bao giờ | Chỉ khi AI không chắc | Sớm | **Chỉ khi AI không chắc**, và người chủ trì có thể tắt tự gửi cho từng cuộc họp (2026-11-14) |
| S6 | Tên sản phẩm? | | | Sau | Chưa chốt |
| S7 | Mô hình thu phí? | Theo người dùng · Theo workspace · Miễn phí cho người chỉ xác nhận task | Người chỉ nhận và xác nhận task không mất phí, để lan tỏa | Sau | Chưa chốt |

## Nền tảng và công nghệ

| # | Câu hỏi | Lựa chọn | Đề xuất | Mức | Kết luận |
|---|---|---|---|---|---|
| K1 | Nền tảng cho client? | Web · Desktop (Electron) · macOS native (Swift) | Nếu đi S1-B: web trước cho giai đoạn 1–3, desktop ở giai đoạn 4 | Chặn | **Web trước** (2026-11-14) |
| K2 | Hệ điều hành desktop đầu tiên? | macOS · Windows · Cả hai | Theo máy của nhóm người dùng đầu tiên | Sớm | Chưa chốt |
| K3 | Ngôn ngữ backend? | TypeScript (Node.js) · Python | TypeScript, dùng chung kiểu dữ liệu với client | Chặn | **TypeScript trên Node.js** (2026-11-14) |
| K4 | Dịch vụ phiên âm? | Các dịch vụ streaming thương mại · Mô hình mã nguồn mở tự chạy | Thử trên âm thanh họp tiếng Việt thật rồi chọn | Sớm (trước giai đoạn 4) | Chưa chốt |
| K5 | Hạ tầng triển khai? | Một nền tảng PaaS · Cloud tự quản | PaaS cho giai đoạn đầu | Sớm | Chưa chốt |
| K6 | Hàng đợi job? | Chạy trên PostgreSQL · Redis riêng | Trên PostgreSQL cho đến khi tải đòi hỏi khác | Sau | **Trên PostgreSQL**, ở dạng đơn giản nhất: bảng `nudges` là lịch hẹn, một bộ hẹn giờ trong tiến trình quét mỗi phút (2026-11-14). Xem lại khi chạy nhiều tiến trình |

Ghi chú về môi trường phát triển hiện tại: máy đã có Node.js và Python, chưa có Xcode đầy đủ (chỉ Command Line Tools). Lựa chọn macOS native hoặc module thu âm native sẽ cần cài Xcode.

## Tích hợp

| # | Câu hỏi | Lựa chọn | Đề xuất | Mức | Kết luận |
|---|---|---|---|---|---|
| T1 | Lịch nào trước? | Google Calendar · Outlook | Theo nhóm người dùng đầu tiên; mặc định Google | Sớm (trước khi nối lịch thật) | Chưa chốt. Giai đoạn 2 chạy bằng lịch nhập tay sau interface `CalendarSource`; nối Google cần OAuth client của người vận hành |
| T2 | Kênh thông báo đầu tiên? | Email · Slack · Thông báo desktop · Zalo / kênh khác | Email (ai cũng có, không cần cài gì), sau đó Slack | Chặn | **Email** (2026-11-14) |
| T3 | Cách lấy quyền đọc lịch? | Từng người tự kết nối · Quản trị viên cấp cho cả tổ chức | Từng người tự kết nối; minh bạch hơn | Sớm | Chưa chốt |

## Tham số cần kiểm chứng bằng dữ liệu

Các con số dưới đây đang là phỏng đoán hợp lý, cần điều chỉnh khi có người dùng thật.

| Tham số | Giá trị ban đầu | Trang |
|---|---|---|
| Thời gian báo trước của nhắc chuẩn bị | 2 tiếng, hoặc 2 × công sức nếu lớn hơn | [Nudging](04-context-aware-nudging.md) |
| Độ dài tối thiểu của một khoảng trống | 15 phút | [Nudging](04-context-aware-nudging.md) |
| Số nudge tối đa mỗi người mỗi ngày | 3 | [Nudging](04-context-aware-nudging.md) |
| Khoảng cách tối thiểu giữa hai nudge | 90 phút | [Nudging](04-context-aware-nudging.md) |
| Hệ số đệm khi so thời gian rảnh với công sức | 1,5 | [Blocker Detection](05-blocker-detection.md) |
| Ngưỡng "chưa bắt đầu" | 75% thời gian đã trôi | [Blocker Detection](05-blocker-detection.md) |
| Thời hạn task `proposed` chuyển `expired` | 72 giờ | [Commitment](03-one-click-commitment.md) |
| Khoảng đệm sau cuộc họp trước khi tính là khoảng trống | 5 phút | [Nudging](04-context-aware-nudging.md) |
| Nhắc khoảng trống chỉ trong N giờ trước hạn | 48 giờ | [Nudging](04-context-aware-nudging.md) |
| Điểm khoảng trống: làm xong được / chỉ đủ bắt đầu / gần hạn | 100 / 30 / tối đa +40 | [Nudging](04-context-aware-nudging.md#bản-đang-chạy-khác-gì-thiết-kế) |
| Khoảng lặng sau khi vừa xác nhận task | 30 phút | [Nudging](04-context-aware-nudging.md#bản-đang-chạy-khác-gì-thiết-kế) |
| Giờ làm việc mặc định (người chưa có lịch) | 08:30–17:30, thứ Hai đến thứ Sáu | [Nudging](04-context-aware-nudging.md) |

Các tham số của Nudging đổi được bằng biến môi trường `NUDGE_*` (xem `.env.example`) để thử giá trị khác mà không sửa code.
| Ngưỡng độ tin cậy của AI | Chưa đặt | [AI pipeline](08-ai-pipeline.md) |

## Nhật ký quyết định

Ghi các quyết định đã chốt ở đây, mới nhất ở trên.

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-11-14 | Giai đoạn 2 làm trước phần thuật toán và gửi nudge với lịch nhập tay (trang "Lịch thử"); Google Calendar để sau, đứng sau interface `CalendarSource` | Kết nối Google cần OAuth client của người vận hành. Phần chọn giờ là phần cần kiểm chứng trước, và test được hoàn toàn không cần lịch thật |
| 2026-11-14 | Chưa có tài khoản nên lịch và giờ làm việc gắn với email (`calendar_people`, `busy_blocks.person_email`) | Người tham gia đang là bản ghi theo từng cuộc họp; email là thứ duy nhất nối một người qua nhiều cuộc họp. Đổi sang `user_id` khi có tài khoản |
| 2026-11-14 | Chốt K6: không thêm hàng đợi job; bảng `nudges` là lịch hẹn, việc định kỳ chạy mỗi phút (trước là 5 phút) và kiểm tra lại từng lời nhắc trước khi gửi | Hủy và dời một lời nhắc chỉ là sửa một dòng; chạy lại bao nhiêu lần cũng cho cùng kết quả. Đủ cho một tiến trình; cần khóa hoặc hàng đợi thật khi chạy nhiều tiến trình |
| 2026-11-14 | Mốc của lời nhắc là mốc đến trước giữa cuộc họp liên quan và hạn. Cuộc họp liên quan do người chủ trì gắn cho task, hoặc là "buổi họp kế tiếp" khai khi tạo cuộc họp | Chưa có chuỗi họp từ lịch và AI chưa trích cuộc họp được nhắc trong lời nói. Con người quyết định, đúng nguyên tắc AI đề xuất |
| 2026-11-14 | Khi chạm giới hạn (3 lần/ngày, 90 phút): nhắc chuẩn bị bị bỏ chứ không dời muộn; nhắc khoảng trống và nhắc xác nhận được dời sang khoảng trống sau | Giữ quy tắc "chỉ dịch sớm" của nhắc chuẩn bị; thà bỏ một lần nhắc còn hơn làm người dùng tắt thông báo |
| 2026-11-14 | Người chủ trì không thấy giờ nhắc của người khác, chỉ thấy số lời nhắc đang chờ và đã gửi | Giờ nhắc là đầu một khoảng trống, tức là để lộ lịch của người làm |
| 2026-11-14 | Thêm khoảng lặng 30 phút sau khi người làm vừa xác nhận task | Nếu không, người xác nhận lúc đang rảnh và gần hạn sẽ nhận nhắc ngay sau cú bấm Xác nhận |
| 2026-11-14 | Giao diện giai đoạn 1 là HTML dựng ở server (Hono), không dùng React | Chỉ có vài form; trang xác nhận cần nhẹ và mở nhanh trên điện thoại. Xem lại khi làm app desktop |
| 2026-11-14 | Database khi phát triển là PGlite (Postgres chạy trong tiến trình Node) | Máy phát triển không có Postgres hay Docker. SQL vẫn là SQL Postgres, đổi sang server thật chỉ sửa `src/db.ts` |
| 2026-11-14 | Giai đoạn 1 chưa có hàng đợi job: trích xuất chạy ngay trong tiến trình, việc định kỳ chạy bằng bộ hẹn giờ 5 phút | Đủ cho một nhóm dùng thử. Hàng đợi (K6) cần có từ giai đoạn 2, khi nudge phải hẹn giờ và dời được |
| 2026-11-14 | Giai đoạn 1 chưa có tài khoản: trang của người chủ trì dùng chung một mật khẩu (`APP_PASSWORD`), người nhận dùng liên kết ký | Chưa cần đăng nhập để kiểm chứng One-Click Commitment |
| 2026-11-14 | Mô hình trích xuất mặc định là `claude-opus-5-5`, đổi được bằng `ANTHROPIC_MODEL` | Trích xuất cần chính xác trên hết và chỉ chạy một lần mỗi cuộc họp |
| 2026-11-14 | Chốt S1 = B, K1 = web trước, K3 = TypeScript, T2 = email, S5 = duyệt khi AI không chắc | Theo đề xuất trong wiki, để bắt đầu giai đoạn 1 |
| 2026-11-14 | Tài liệu dự án viết dạng wiki Markdown trong thư mục `wiki/` | Đơn giản, đọc được ở mọi nơi, đi cùng mã nguồn |
