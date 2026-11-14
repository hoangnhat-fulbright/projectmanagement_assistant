# 10. Bảo mật và quyền riêng tư

[← Trang chủ](README.md)

App này chạm vào ba loại dữ liệu nhạy cảm: **lời nói trong cuộc họp**, **lịch cá nhân**, và **thông tin về việc ai làm chậm**. Mỗi loại cần cách xử lý riêng.

## Ghi âm cuộc họp

### Sự đồng ý

Vì không có bot hiện diện, những người khác trong cuộc họp **không tự thấy** là đang bị ghi. Đây là rủi ro pháp lý và đạo đức lớn nhất của mô hình này.

- Nhiều nơi yêu cầu mọi bên đồng ý trước khi ghi âm. Quy định khác nhau theo quốc gia và theo bang.
- App nhắc người dùng thông báo cho mọi người khi bắt đầu ghi, và có sẵn câu mẫu để dán vào chat cuộc họp.
- Người nhận email xác nhận task sẽ biết cuộc họp đã được ghi và phiên âm; email phải nói rõ điều đó và có cách yêu cầu xóa.
- Cần tư vấn pháp lý trước khi ra mắt, cho cả quy định bảo vệ dữ liệu cá nhân của Việt Nam và của thị trường mục tiêu (ví dụ GDPR nếu có người dùng ở châu Âu).

### Lưu trữ

| Dữ liệu | Mặc định |
|---|---|
| Âm thanh gốc | Không lưu sau khi phiên âm xong |
| Bản phiên âm | Lưu, mã hóa; người chủ cuộc họp xóa được |
| Biên bản, task | Lưu đến khi người dùng xóa |
| Câu trích dẫn trên thẻ task | Chỉ một câu, đủ làm bằng chứng |

Xóa cuộc họp phải xóa cả phiên âm, biên bản và câu trích dẫn trong các task liên quan.

## Lịch

Nguyên tắc: **lấy ít nhất có thể**.

- Chỉ xin quyền đọc, không bao giờ xin quyền ghi ở giai đoạn đầu.
- Bản sao lịch chỉ lưu khung giờ bận và loại (họp, tập trung, nghỉ phép). Không lưu tiêu đề, mô tả, người tham gia của sự kiện không do app ghi.
- Lịch của một người **không hiển thị cho người khác**. Cảnh báo blocker chỉ nói "còn 40 phút trống trước hạn", không nói người đó bận việc gì.
- Token OAuth mã hóa khi lưu; người dùng ngắt kết nối thì xóa token và bản sao lịch.

## Dữ liệu về hiệu suất cá nhân

Blocker Detection tạo ra thông tin kiểu "việc của Lan có nguy cơ trễ" và gửi cho người quản lý. Dùng sai, nó thành công cụ giám sát.

- **Người làm luôn biết trước hoặc cùng lúc với quản lý.** Không có cảnh báo nào về một người mà người đó không thấy.
- **Không có bảng xếp hạng, không có điểm cá nhân.** Chỉ số tổng hợp (tỷ lệ đúng hạn) chỉ hiển thị ở cấp nhóm.
- Cảnh báo viết theo hướng **việc** đang gặp rủi ro, không phải **người** đang làm kém.
- Lý do rủi ro hiển thị cho quản lý giới hạn ở mức cần thiết: "chưa bắt đầu, thiếu thời gian trống", không kèm chi tiết lịch.
- Nhật ký `task_events` có giới hạn thời gian lưu.

## Liên kết hành động trong email

Liên kết một cú bấm là một dạng xác thực không cần mật khẩu, nên phải chặt:

| Biện pháp | Chống lại |
|---|---|
| Token ngẫu nhiên đủ dài, chỉ lưu mã băm ở server | Lộ database không lộ token |
| Mỗi token gắn với đúng một task và một hành động | Dùng token cho việc khác |
| Dùng một lần, hết hạn sau 7 ngày | Dùng lại liên kết cũ |
| Mở liên kết chỉ hiện trang; hành động cần một cú bấm (POST) | Bộ quét email tự mở liên kết và vô tình "xác nhận" |
| Trang xác nhận chỉ hiện thông tin của task đó | Email bị chuyển tiếp làm lộ cả biên bản |
| Giới hạn tốc độ theo IP và theo token | Dò token |

Hành động có tác động lớn hơn (xem toàn bộ biên bản, đổi người làm) yêu cầu đăng nhập.

## Dữ liệu gửi cho bên thứ ba

| Bên | Dữ liệu gửi đi | Yêu cầu |
|---|---|---|
| Dịch vụ phiên âm | Âm thanh | Không lưu lại, không dùng để huấn luyện |
| Nhà cung cấp LLM | Phiên âm, ghi chú, tên người tham gia | Không dùng để huấn luyện; thời gian lưu ngắn nhất có thể |
| Dịch vụ email, Slack | Tiêu đề task, câu trích dẫn | Giữ nội dung trong thông báo ở mức tối thiểu |

Chọn nhà cung cấp có cam kết hợp đồng về các điểm trên, và công bố danh sách bên xử lý dữ liệu cho khách hàng.

## Phân quyền

| Đối tượng | Ai xem được |
|---|---|
| Biên bản, phiên âm | Người tham gia cuộc họp, và người được chia sẻ |
| Task | Người làm, người chủ trì, người tham gia cuộc họp đó |
| Phụ thuộc | Người làm của hai task ở hai đầu, và người quản lý |
| Lịch bận/rảnh | Chỉ hệ thống; không ai xem trực tiếp |
| Cảnh báo blocker | Người làm hai task liên quan, người quản lý |

## Cơ bản khác

- Mã hóa khi truyền và khi lưu.
- Tách dữ liệu theo workspace ở mọi truy vấn.
- Ghi nhật ký truy cập với dữ liệu nhạy cảm.
- Có quy trình xuất và xóa toàn bộ dữ liệu của một người dùng hoặc một workspace.
