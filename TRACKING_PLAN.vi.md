# Tracking plan

_Bản tiếng Việt. English version: [TRACKING_PLAN.md](TRACKING_PLAN.md)._

Tài liệu này liệt kê các sự kiện app **Cam kết sau họp** ghi lại, mỗi sự kiện đo điều gì, và vì sao điều đó quan trọng với sản phẩm.

Cột "Tình trạng" phân biệt rõ hai loại: **Đang ghi** là sự kiện code hiện tại đã lưu vào database; **Chưa ghi** là sự kiện cần thêm trước khi có người dùng thật. Chưa có số liệu thật nào: sản phẩm chưa có người dùng.

## Câu hỏi cần trả lời

Sản phẩm đặt cược vào ba giả thuyết. Mọi sự kiện dưới đây tồn tại để kiểm một trong ba.

| # | Giả thuyết | Chỉ số chính | Mục tiêu ban đầu |
|---|---|---|---|
| 1 | Người ta chịu nhận việc nếu chỉ mất một cú bấm | Tỷ lệ task được xác nhận trong 24 giờ | ≥ 70% |
| 2 | Nhắc vào lúc rảnh thì được phản hồi, nhắc giờ cố định thì không | Tỷ lệ nudge có phản hồi | ≥ 40% |
| 3 | Việc đã cam kết và được nhắc đúng lúc thì xong đúng hạn hơn | Tỷ lệ task cam kết xong trước hạn | Cao hơn nhóm chưa dùng app |

Chỉ số số 1 quyết định có đi tiếp hay không: nếu người nhận không bấm xác nhận thì hai tính năng sau không có gì để chạy.

**Chỉ số ngôi sao bắc đẩu:** số task được cam kết và hoàn thành đúng hạn mỗi tuần. Nó chỉ tăng khi cả ba giả thuyết cùng đúng.

Các mục tiêu là giả định để định hướng, lấy từ [wiki/01-tong-quan-san-pham.md](wiki/01-tong-quan-san-pham.md#thước-đo-thành-công).

## Phễu

```
Cuộc họp được tạo
  → task được AI đề xuất        (proposed)
  → task được gửi cho người làm (sent)
  → task được xác nhận          (confirmed)      ← giả thuyết 1
  → người làm được nhắc         (nudged)
  → người làm phản hồi lời nhắc (started / snoozed / due_changed / completed)  ← giả thuyết 2
  → task xong trước hạn         (completed)      ← giả thuyết 3
```

## Sự kiện được lưu ở đâu

App không dùng dịch vụ phân tích bên ngoài. Sự kiện nằm trong chính database của app, ở ba bảng:

| Bảng | Vai trò | Cột chính |
|---|---|---|
| `task_events` | Nhật ký chỉ ghi thêm cho mọi thay đổi trên task | `task_id`, `type`, `actor_participant_id`, `channel`, `payload`, `created_at` |
| `notifications` | Mọi email đã gửi | `kind`, `recipient_participant_id`, `sent_at`, `error` |
| `nudges` | Mỗi lời nhắc: hẹn lúc nào, vì sao, kết cục ra sao | `kind`, `scheduled_for`, `status`, `reason`, `response`, `sent_at` |

Thuộc tính chung của mọi dòng trong `task_events`:

| Thuộc tính | Giá trị | Dùng để |
|---|---|---|
| `channel` | `email_link` (người làm bấm từ email), `app` (người chủ trì thao tác trên web), `system` (app tự làm) | Tách hành động của người khỏi hành động của hệ thống |
| `actor_participant_id` | Người thực hiện; rỗng nếu là người chủ trì hoặc hệ thống | Biết ai làm, không cần tài khoản |
| `created_at` | Thời điểm xảy ra | Tính mọi khoảng thời gian trong phễu |

## Sự kiện

### A. Trích xuất và gửi

| Sự kiện | Xảy ra khi | Thuộc tính | Đo điều gì | Vì sao quan trọng | Tình trạng |
|---|---|---|---|---|---|
| `meeting_created` | Người chủ trì tạo cuộc họp từ phiên âm | Số người tham gia, có khai buổi họp kế tiếp không | Mức sử dụng: số cuộc họp mỗi tuần, số người chủ trì quay lại | Đầu phễu. Người chủ trì quay lại tuần sau là tín hiệu giữ chân rõ nhất | Đang ghi dưới dạng dòng trong bảng `meetings` (`created_at`), chưa phải sự kiện riêng |
| `proposed` | AI trích ra một task | `extractor` (claude hay demo), `confidence` | Số task mỗi cuộc họp; phân bố độ tin cậy của AI | Mẫu số của tỷ lệ xác nhận. Độ tin cậy dùng để đặt ngưỡng "cần người chủ trì duyệt" | Đang ghi |
| `extraction_rejected` | Code loại một task AI đưa ra (trích dẫn không có trong phiên âm, trùng, thiếu tiêu đề) | Lý do loại | AI bịa hoặc trích sai thường xuyên đến đâu | Một task bịa đến tay người nhận là mất niềm tin ngay. Cần biết hàng rào chặn được bao nhiêu | **Chưa ghi.** Hiện chỉ in ra log của server |
| `extraction_failed` | Gọi AI lỗi, cuộc họp chuyển `failed` | Thông báo lỗi | Độ ổn định của bước trích xuất | Người chủ trì gặp lỗi ở lần đầu thường không thử lại | Đang ghi ở `meetings.status` và `meetings.error`, không giữ lịch sử |
| `sent` | Yêu cầu xác nhận được gửi cho người làm | `to` (người nhận) | Số task thực sự đến tay người làm; thời gian từ lúc họp xong đến lúc gửi | Mốc bắt đầu của đồng hồ xác nhận | Đang ghi |
| `reminded` | Nhắc xác nhận lần duy nhất | `to` | Bao nhiêu task cần nhắc mới được xác nhận | Nếu phần lớn xác nhận đến sau lời nhắc thì email đầu chưa đủ rõ | Đang ghi |

### B. Cam kết (giả thuyết 1)

| Sự kiện | Xảy ra khi | Thuộc tính | Đo điều gì | Vì sao quan trọng | Tình trạng |
|---|---|---|---|---|---|
| `link_opened` | Người nhận mở liên kết trong email (trang hiện ra, chưa bấm gì) | Hành động của liên kết | Bước giữa "nhận email" và "bấm": người ta mở rồi bỏ, hay không mở | Phân biệt email không ai đọc với trang xác nhận gây ngại. Hai vấn đề có cách sửa khác nhau | **Chưa ghi.** Cần lọc bộ quét email tự mở liên kết, nếu không số liệu sẽ sai |
| `confirmed` | Người làm bấm Xác nhận | `channel` | Tỷ lệ xác nhận; thời gian đến lúc xác nhận | Chỉ số chính của giả thuyết 1 | Đang ghi |
| `amended` | Người làm sửa nội dung hoặc hạn rồi mới xác nhận; hoặc người chủ trì sửa task | Giá trị cũ và mới của tiêu đề và hạn | AI trích sai nội dung hoặc sai hạn thường xuyên đến đâu | Đo chất lượng AI bằng hành vi thật, không cần ai chấm tay | Đang ghi |
| `declined` | Người làm bấm "Không phải của tôi" | `note` (ghi chú tự do) | AI gán sai người thường xuyên đến đâu | Gán sai người là lỗi tệ nhất của AI: nó làm phiền người không liên quan | Đang ghi |
| `reassigned` | Task chuyển sang người khác (do người từ chối chọn, hoặc người chủ trì gán) | Người cũ, người mới | Bao nhiêu task phải đổi người mới có chủ | Cùng với `declined`, cho biết có nên để người chủ trì duyệt trước khi gửi | Đang ghi |
| `reopened` | Người chủ trì mở lại task bị từ chối hoặc hết hạn chờ | Trạng thái trước đó | Người chủ trì có xử lý các task "rơi" hay bỏ mặc | Bảng tổng hợp chỉ có giá trị nếu người chủ trì thật sự dùng nó | Đang ghi |
| `expired` | 72 giờ không ai phản hồi | Trạng thái trước đó | Tỷ lệ task bị lơ | Mặt trái của tỷ lệ xác nhận: task không ai nhận là đúng vấn đề sản phẩm định giải | Đang ghi |
| `cancelled` | Người chủ trì bỏ task | Trạng thái trước đó | AI trích ra bao nhiêu thứ không đáng là task | Tỷ lệ cao nghĩa là AI trích thừa, làm loãng email | Đang ghi |

### C. Nhắc việc (giả thuyết 2)

| Sự kiện | Xảy ra khi | Thuộc tính | Đo điều gì | Vì sao quan trọng | Tình trạng |
|---|---|---|---|---|---|
| Lời nhắc được lập lịch | Task hoặc lịch thay đổi, app tính lại giờ nhắc | `kind` (chuẩn bị, khoảng trống, theo hạn, xác nhận); `reason`: mốc, thời điểm lý tưởng, có phải dịch sớm không, khoảng trống nào, điểm bao nhiêu | Thuật toán chọn giờ ra sao; bao nhiêu lời nhắc phải dịch sớm vì người đó bận | Trả lời được "sao nó nhắc tôi lúc này?" và là dữ liệu để chỉnh tham số | Đang ghi (bảng `nudges`) |
| `nudged` | Email nhắc được gửi | `kind`, `nudge_id` | Số lời nhắc mỗi người mỗi ngày | Mẫu số của tỷ lệ phản hồi; kiểm tra giới hạn chống làm phiền có giữ được | Đang ghi |
| Lời nhắc bị hủy hoặc bỏ qua | App quyết định không gửi | `reason.closed`: `rate_limited` (chạm giới hạn 3 lần/ngày hoặc 90 phút), `missed` (đến giờ thì người đó bận), `no_slot` (không còn khoảng trống), `merged`, `task_closed`, `not_eligible` | Bao nhiêu lời nhắc không đến được, và vì sao | Nếu `rate_limited` nhiều thì giới hạn quá chặt; nếu `no_slot` nhiều thì lịch quá kín để nhắc theo khoảng trống | Đang ghi |
| `started` | Người làm bấm "Đang làm" | `channel` | Phản hồi lời nhắc: đã bắt đầu | Một trong bốn phản hồi tính vào tỷ lệ nudge có phản hồi | Đang ghi |
| `snoozed` | Người làm bấm "Nhắc ở khoảng trống sau" | `until`, `count` (lần hoãn thứ mấy) | Lời nhắc đến sai lúc thường xuyên đến đâu | Hoãn nhiều nghĩa là khoảng trống trên lịch không thật sự là lúc rảnh | Đang ghi |
| `due_changed` | Người làm bấm "Dời hạn" và chọn hạn mới | Hạn cũ, hạn mới | Bao nhiêu cam kết bị dời, dời bao lâu | Dời hạn có chủ đích tốt hơn trễ im lặng, nhưng dời quá nhiều nghĩa là hạn ban đầu không thực tế | Đang ghi |
| `completed` | Task được đánh dấu xong | `channel`: `email_link` nếu bấm từ email nhắc, `app` nếu người chủ trì đánh dấu | Hoàn thành, và hoàn thành qua kênh nào | Xong ngay từ email nhắc là bằng chứng trực tiếp nhất rằng lời nhắc đến đúng lúc | Đang ghi |
| Phản hồi gắn với lời nhắc | Người làm bấm một nút trên email nhắc | `nudges.response`: `done`, `started`, `snoozed`, `due_changed`, hoặc rỗng | Từng loại nhắc được phản hồi ra sao | So sánh nhắc chuẩn bị với nhắc khoảng trống với nhắc theo hạn | Đang ghi |
| `nudge_context_changed` | Người chủ trì gắn cuộc họp liên quan hoặc sửa công sức ước tính | Giá trị cũ và mới | Người chủ trì có chịu cung cấp ngữ cảnh không; AI ước tính công sức lệch bao nhiêu | Nhắc chuẩn bị chỉ thông minh khi biết cuộc họp liên quan | Đang ghi |

### D. Lịch và hạ tầng

| Sự kiện | Xảy ra khi | Thuộc tính | Đo điều gì | Vì sao quan trọng | Tình trạng |
|---|---|---|---|---|---|
| `calendar_connected` | Một người có dữ liệu lịch lần đầu | Nguồn (nhập tay, Google) | Tỷ lệ người làm có lịch | Rủi ro lớn nhất của Nudging là ít người chịu kết nối lịch. Không có lịch thì chỉ còn nhắc theo hạn | Đang ghi dưới dạng dòng trong `calendar_people` (`source`, `synced_at`), chưa phải sự kiện riêng |
| `calendar_disconnected` | Một người xóa dữ liệu lịch | | Bao nhiêu người rút lại quyền đọc lịch | Tín hiệu mất niềm tin về quyền riêng tư | **Chưa ghi.** Dòng bị xóa, không để lại dấu vết |
| Email gửi lỗi | SMTP từ chối | `notifications.error` | Tỷ lệ email không đến | Mọi chỉ số ở trên vô nghĩa nếu email không đến nơi | Đang ghi |
| `email_bounced`, `email_marked_spam` | Dịch vụ email báo lại | | Email bị trả lại hoặc bị báo spam | Bị báo spam là dấu hiệu sớm nhất của việc nhắc quá nhiều | **Chưa ghi.** Cần webhook của dịch vụ email |

## Cách tính các chỉ số

Các câu lệnh dưới đây chạy được trên schema hiện tại (`src/schema.sql`).

**Tỷ lệ xác nhận trong 24 giờ** (giả thuyết 1):

```sql
SELECT round(100.0 * count(*) FILTER (WHERE c.at <= s.at + interval '24 hours') / nullif(count(*), 0), 1) AS pct
  FROM (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'sent' GROUP BY task_id) s
  LEFT JOIN (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'confirmed' GROUP BY task_id) c USING (task_id);
```

**Trung vị thời gian đến lúc xác nhận**, tính bằng giờ (mục tiêu dưới 2 giờ):

```sql
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.at - s.at) / 3600) AS median_hours
  FROM (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'sent' GROUP BY task_id) s
  JOIN (SELECT task_id, min(created_at) AS at FROM task_events WHERE type = 'confirmed' GROUP BY task_id) c USING (task_id);
```

**Tỷ lệ nudge có phản hồi, theo loại nhắc** (giả thuyết 2):

```sql
SELECT kind, count(*) AS sent, count(response) AS responded,
       round(100.0 * count(response) / count(*), 1) AS pct
  FROM nudges
 WHERE status = 'sent' AND kind <> 'confirm_reminder'
 GROUP BY kind ORDER BY kind;
```

**Tỷ lệ task cam kết xong trước hạn** (giả thuyết 3), trên các task đã qua hạn:

```sql
SELECT round(100.0 * count(*) FILTER (WHERE status = 'done' AND completed_at <= due_at) / nullif(count(*), 0), 1) AS pct
  FROM tasks
 WHERE committed_at IS NOT NULL AND status <> 'cancelled' AND due_at < now();
```

**Chất lượng AI qua hành vi người dùng**: phần trăm task đã gửi bị sửa, và bị từ chối:

```sql
SELECT round(100.0 * count(DISTINCT task_id) FILTER (WHERE type = 'amended')
             / nullif(count(DISTINCT task_id) FILTER (WHERE type = 'sent'), 0), 1) AS pct_amended,
       round(100.0 * count(DISTINCT task_id) FILTER (WHERE type = 'declined')
             / nullif(count(DISTINCT task_id) FILTER (WHERE type = 'sent'), 0), 1) AS pct_declined
  FROM task_events;
```

**Lời nhắc không gửi được, theo lý do**:

```sql
SELECT reason->>'closed' AS why, count(*)
  FROM nudges
 WHERE status IN ('cancelled', 'skipped')
 GROUP BY 1 ORDER BY 2 DESC;
```

## Chỉ số cảnh báo

Các chỉ số này không phải mục tiêu để tăng. Chúng báo khi sản phẩm đang gây hại.

| Chỉ số | Tính từ | Ngưỡng cần xem lại | Ý nghĩa khi vượt ngưỡng |
|---|---|---|---|
| Tỷ lệ task bị từ chối | `declined` / `sent` | Trên 10% | AI gán sai người; cân nhắc bắt người chủ trì duyệt trước khi gửi |
| Tỷ lệ task bị sửa | `amended` / `sent` | Trên 30% | AI trích sai nội dung hoặc hạn |
| Tỷ lệ hết hạn chờ | `expired` / `sent` | Trên 20% | Email xác nhận không được đọc, hoặc không được tin |
| Lời nhắc bị hoãn hai lần | `snoozed` có `count` = 2 | Trên 15% số task được nhắc | Khoảng trống trên lịch không phải lúc người ta làm việc được |
| Lời nhắc bị bỏ vì chạm giới hạn | `reason.closed` = `rate_limited` | Trên 25% | Mỗi người đang có quá nhiều task mở, hoặc giới hạn quá chặt |
| Email gửi lỗi | `notifications.error` khác rỗng | Trên 2% | Cấu hình gửi thư có vấn đề; số liệu phễu không còn đáng tin |

Các ngưỡng là phỏng đoán ban đầu, sẽ chỉnh khi có dữ liệu thật.

## So sánh cần chạy

Giả thuyết 2 chỉ chứng minh được bằng so sánh, không phải bằng một con số đơn lẻ. Dữ liệu đã đủ để so hai nhóm có sẵn trong sản phẩm:

- **Nhóm có lịch:** nhận nhắc chuẩn bị và nhắc khoảng trống (`nudges.kind` là `prep` hoặc `gap`).
- **Nhóm chưa có lịch:** nhận nhắc theo hạn vào giờ tính từ hạn (`nudges.kind` là `deadline`).

So tỷ lệ phản hồi và tỷ lệ xong đúng hạn giữa hai nhóm. Lưu ý hai nhóm tự chọn (người chịu kết nối lịch có thể vốn đã kỷ luật hơn), nên kết quả chỉ là gợi ý. Muốn chắc chắn thì phải chia ngẫu nhiên người có lịch vào hai cách nhắc; việc này chưa làm.

## Những gì cố ý không ghi

| Không ghi | Vì sao |
|---|---|
| Tiêu đề, mô tả, người tham gia của sự kiện trong lịch cá nhân | App chỉ cần biết bận hay rảnh. Bảng `busy_blocks` không có cột tiêu đề |
| Nội dung phiên âm trong sự kiện | Sự kiện chỉ trỏ tới task; lời nói trong cuộc họp không bị chép sang nhật ký |
| Bảng xếp hạng hay điểm số theo từng người | Số liệu dùng để sửa sản phẩm, không để chấm điểm nhân viên. Người chủ trì thấy trạng thái từng task, không thấy thống kê theo người |
| Giờ nhắc của một người, trên màn hình của người khác | Giờ nhắc là đầu một khoảng trống, tức là để lộ lịch. Người chủ trì chỉ thấy số lời nhắc |
| Mã theo dõi của bên thứ ba, pixel trong email | Email đi vào hộp thư công việc của người chưa từng đăng ký app. Theo dõi họ bằng pixel là phá niềm tin trước khi kịp tạo ra nó |

Nguyên tắc về dữ liệu lịch và dữ liệu hiệu suất cá nhân nằm ở [wiki/10-bao-mat-quyen-rieng-tu.md](wiki/10-bao-mat-quyen-rieng-tu.md).

## Việc cần làm trước khi có người dùng thật

1. Ghi `extraction_rejected` vào database thay vì chỉ in ra log.
2. Ghi `link_opened`, có lọc bộ quét email.
3. Ghi `calendar_connected` và `calendar_disconnected` thành sự kiện có thời điểm.
4. Nhận webhook trả lại thư và báo spam từ dịch vụ email.
5. Một trang tổng hợp chạy sẵn các câu lệnh ở trên, để không phải truy vấn tay.
