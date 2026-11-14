# 4. Context-Aware Nudging

[← Trang chủ](README.md)

> Không nhắc lúc 9h sáng khi mọi người đang bận. Nhắc vào khoảng trống giữa hai cuộc họp, hoặc 2 tiếng trước cuộc họp mà người đó cần báo cáo.

## Nguyên tắc

1. **Nhắc khi người đó có thể hành động.** Một lời nhắc đến giữa cuộc họp là lời nhắc bị bỏ qua.
2. **Nhắc kèm lý do về thời điểm.** "Bạn trống 45 phút đến 14:00, việc này ước tính 30 phút" thuyết phục hơn "Đừng quên việc X".
3. **Ít mà trúng.** Có giới hạn số lần nhắc mỗi ngày; thà bỏ một lần nhắc còn hơn làm người dùng tắt thông báo.

## Ba loại nhắc

| Loại | Khi nào | Ví dụ nội dung |
|---|---|---|
| **Nhắc chuẩn bị** (prep nudge) | Trước cuộc họp liên quan một khoảng thời gian (mặc định 2 tiếng) | "Weekly Sales bắt đầu lúc 15:00. Bạn đã nhận gửi báo cáo Q4 trước buổi này." |
| **Nhắc khoảng trống** (gap nudge) | Đầu một khoảng trống đủ dài để làm xong việc | "Bạn trống đến 14:00 (45 phút). Rà soát hợp đồng ước tính 30 phút." |
| **Nhắc theo hạn** (deadline nudge) | Phương án dự phòng khi không có dữ liệu lịch | "Hạn gửi báo cáo Q4 là 17:00 hôm nay." |

## Dữ liệu đầu vào

| Dữ liệu | Nguồn | Dùng để |
|---|---|---|
| Lịch bận/rảnh của người làm | Google Calendar / Outlook ([Tích hợp](09-tich-hop.md)) | Tìm khoảng trống |
| Giờ làm việc, múi giờ | Cài đặt lịch hoặc người dùng tự đặt | Không nhắc ngoài giờ |
| Sự kiện nghỉ phép, focus time | Lịch | Không nhắc khi đang nghỉ hoặc tập trung |
| Hạn của task | Task đã cam kết | Độ khẩn |
| Công sức ước tính | [AI pipeline](08-ai-pipeline.md), người dùng sửa được | Khoảng trống cần dài bao nhiêu |
| Cuộc họp liên quan | Xem bên dưới | Nhắc chuẩn bị |

### Xác định "cuộc họp liên quan"

Theo thứ tự ưu tiên:

1. Cuộc họp được nhắc trực tiếp trong lời nói: "trước buổi họp ban giám đốc thứ Hai".
2. Lần kế tiếp của **chuỗi họp định kỳ** nơi task được sinh ra (task từ Weekly tuần này → Weekly tuần sau).
3. Không có: chỉ dùng hạn của task.

## Thuật toán chọn thời điểm

### Bước 1: Tìm các khoảng trống

Lấy lịch của người làm từ bây giờ đến hạn của task. Một **khoảng trống** là đoạn thời gian thỏa cả các điều kiện:

- nằm trong giờ làm việc;
- không trùng sự kiện nào đánh dấu bận, nghỉ phép hay focus time;
- dài ít nhất 15 phút;
- bắt đầu sau khi cuộc họp trước kết thúc 5 phút (để người ta kịp thở).

### Bước 2: Đặt lịch nhắc chuẩn bị

```
T = giờ bắt đầu cuộc họp liên quan − thời gian báo trước (mặc định 2 tiếng)

nếu T rơi vào khoảng trống:
    gửi lúc T
ngược lại (T rơi vào lúc đang họp):
    gửi vào đầu khoảng trống gần nhất TRƯỚC T
nếu trong ngày không còn khoảng trống nào trước T:
    gửi vào khoảng trống cuối cùng của ngày làm việc trước đó
```

Luôn dịch **sớm lên**, không dịch muộn đi: nhắc muộn hơn 2 tiếng thì không còn đủ thời gian chuẩn bị.

Thời gian báo trước nên tỷ lệ với công sức: `max(2 tiếng, công sức ước tính × 2)`. Việc cần 3 tiếng mà nhắc trước 2 tiếng thì vô ích.

### Bước 3: Chọn khoảng trống cho nhắc khoảng trống

Chỉ áp dụng cho task chưa bắt đầu và còn dưới 48 giờ đến hạn. Mỗi khoảng trống được chấm điểm:

| Yếu tố | Tác động |
|---|---|
| Khoảng trống ≥ công sức ước tính + 5 phút | Cộng nhiều: có thể làm xong ngay |
| Khoảng trống ngắn hơn công sức nhưng ≥ 15 phút | Cộng ít: đủ để bắt đầu |
| Càng gần hạn | Cộng |
| Ngay sau một chuỗi họp dài trên 2 tiếng | Trừ: người ta cần nghỉ |
| Đã nhắc người này trong 90 phút qua | Loại |
| Khung giờ mà người này thường phản hồi nudge | Cộng (học dần từ lịch sử) |

Chọn khoảng trống điểm cao nhất, gửi vào **đầu** khoảng trống.

### Bước 4: Lập lịch lại khi có thay đổi

Lịch nhắc được tính lại khi:

- lịch của người đó thay đổi (thêm, dời, hủy cuộc họp);
- task đổi hạn, đổi người làm, đổi trạng thái;
- cuộc họp liên quan bị dời hoặc hủy.

Ngay trước khi gửi, kiểm tra lại lần cuối: task còn mở không, người đó có đang trong cuộc họp vừa được thêm không.

## Giới hạn chống làm phiền

| Quy tắc | Mặc định |
|---|---|
| Số lần nhắc tối đa mỗi người mỗi ngày | 3 |
| Khoảng cách tối thiểu giữa hai lần nhắc | 90 phút |
| Nhiều task đến hạn nhắc cùng lúc | Gom thành một thông báo |
| Ngoài giờ làm việc, cuối tuần, nghỉ phép | Không nhắc |
| Người dùng bấm "Tạm hoãn" hai lần cho cùng một task | Hỏi xem có muốn dời hạn không, thay vì nhắc tiếp |

Khi vượt giới hạn, ưu tiên task gần hạn nhất và task đang có việc khác phụ thuộc vào (xem [Blocker Detection](05-blocker-detection.md)).

## Hành động ngay trên lời nhắc

| Nút | Kết quả |
|---|---|
| **Xong rồi** | Task chuyển `done` |
| **Đang làm** | Task chuyển `in_progress`, hủy các lần nhắc khoảng trống còn lại |
| **Nhắc ở khoảng trống sau** | Dời sang khoảng trống kế tiếp |
| **Dời hạn** | Chọn hạn mới; nếu có việc khác phụ thuộc thì cảnh báo ngay tác động |

## Ví dụ

Lan nhận task "Gửi báo cáo Q4" (ước tính 45 phút), cần cho buổi Weekly Sales lúc 15:00 thứ Sáu. Lịch thứ Sáu của Lan:

```
09:00–10:30  Họp khách hàng
10:30–11:00  (trống 30 phút)
11:00–12:00  Sprint review
12:00–13:00  Nghỉ trưa
13:00–14:00  1:1 với quản lý        ← 13:00 = 15:00 − 2 tiếng, đang bận
14:00–15:00  (trống 60 phút)
15:00–16:00  Weekly Sales
```

- Thời điểm lý tưởng 13:00 rơi vào cuộc 1:1 → dịch sớm lên khoảng trống trước đó.
- Khoảng 10:30–11:00 chỉ dài 30 phút, ngắn hơn 45 phút công sức, nhưng là khoảng trống gần nhất trước 13:00 → gửi nhắc chuẩn bị lúc **10:35**: "Weekly Sales lúc 15:00. Bạn có 25 phút bây giờ và 55 phút lúc 14:05 để làm báo cáo Q4." (Khoảng trống tính từ 5 phút sau cuộc họp trước, nên 14:00–15:00 thành 14:05–15:00.)
- Nếu đến 14:05 task vẫn chưa bắt đầu → nhắc khoảng trống: "Bạn trống đến 15:00, báo cáo Q4 ước tính 45 phút."

## Quyền riêng tư của lịch

Nudging chỉ cần biết **bận hay rảnh** và tiêu đề của các cuộc họp do app ghi lại. Không đọc mô tả, tệp đính kèm hay danh sách khách của các sự kiện khác. Xem [Bảo mật](10-bao-mat-quyen-rieng-tu.md).

## Phạm vi MVP

| Có | Để sau |
|---|---|
| Nhắc chuẩn bị với quy tắc dịch sớm | Học khung giờ phản hồi tốt của từng người |
| Nhắc khoảng trống với chấm điểm đơn giản (đủ dài, gần hạn) | Chấm điểm đầy đủ theo bảng trên |
| Giới hạn 3 lần mỗi ngày, cách nhau 90 phút, gom thông báo | Tự đặt khối thời gian vào lịch để làm việc |
| Google Calendar | Outlook |

### Bản đang chạy khác gì thiết kế

Ví dụ của Lan ở trên là test tự động (`test/nudge-timing.test.ts`, `test/nudge-flow.test.ts`). Những chỗ bản code cụ thể hóa hoặc chưa làm:

- **Chưa kết nối Google Calendar.** Lịch bận/rảnh nhập tay ở trang "Lịch thử", đứng sau interface `CalendarSource`. Người chưa có dữ liệu lịch nhận nhắc theo hạn.
- **Cuộc họp liên quan** do người chủ trì gắn cho từng task, hoặc lấy "buổi họp kế tiếp" khai khi tạo cuộc họp. AI chưa trích cuộc họp được nhắc trong lời nói; chưa có chuỗi họp định kỳ từ lịch.
- **Mốc của lời nhắc** là mốc đến trước trong hai mốc: cuộc họp liên quan và hạn của task.
- **Khoảng trống** phải dài ít nhất 15 phút *sau khi* trừ 5 phút đệm sau cuộc họp trước.
- **Điểm khoảng trống** = 100 nếu đủ dài để làm xong (≥ công sức + 5 phút), 30 nếu chỉ đủ để bắt đầu, cộng tối đa 40 theo độ gần hạn. Tức là ưu tiên khoảng làm xong được, rồi mới đến khoảng gần hạn.
- **Không còn khoảng trống nào từ bây giờ đến thời điểm lý tưởng** thì không gửi nhắc chuẩn bị (không dời muộn); nhắc khoảng trống lo phần còn lại.
- **Chạm giới hạn 3 lần/ngày hoặc 90 phút**: nhắc chuẩn bị và nhắc theo hạn bị bỏ, nhắc khoảng trống và nhắc xác nhận được dời sang khoảng trống sau.
- **Mỗi mốc một lần nhắc chuẩn bị; mỗi lần nhắc khoảng trống phải được phản hồi (hoãn) mới có lần kế tiếp**, tối đa hai lần hoãn.
- **Không nhắc trong 30 phút sau khi vừa xác nhận** (thêm so với thiết kế, để không nhắc ngay sau cú bấm Xác nhận).
- **Dời hạn chưa cảnh báo tác động** lên việc phụ thuộc: chờ Blocker Detection.
