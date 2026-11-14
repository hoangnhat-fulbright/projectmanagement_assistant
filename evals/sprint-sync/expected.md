# Đáp án: sprint-sync

Buổi họp **giả lập** (không phải họp thật), viết để thử bộ trích xuất. Đáp án được ghi trước khi chạy mô hình.

Thời điểm họp: thứ Ba 10/11/2026, 14:00 (giờ Việt Nam).

```bash
npm run try:claude -- evals/sprint-sync/transcript.txt evals/sprint-sync/participants.txt 2026-11-10T14:00
```

## Task phải có

| # | Việc | Người làm | Hạn | Bẫy |
|---|---|---|---|---|
| A | Fix bug webhook thanh toán bị gọi hai lần | Khoa | Thứ Tư 11/11 | Hạn bị đổi giữa chừng: lúc đầu nói thứ Năm, sau sửa thành thứ Tư |
| B | Gửi log của bug webhook cho Khoa | Mai | Thứ Ba 10/11 ("sau buổi này") | Tự nhận, nói lướt qua |
| C | Hoàn thiện mockup onboarding và gửi Đức | Thảo | Thứ Tư 11/11 ("ngày mai") | "Để em…" phải hiểu là người nói |
| D | Làm màn hình onboarding | Đức | Thứ Sáu 13/11 ("trước cuối tuần này") | Phụ thuộc vào C |
| E | Viết demo script | Mai | Thứ Sáu 13/11 | Được hỏi Đức trước, Đức từ chối, Mai nhận thay. Không được gán cho Đức |
| F | Viết regression test cho luồng thanh toán | Mai | Trước buổi demo: thứ Hai 16/11, 10:00 | Hạn gắn với một sự kiện nêu ở đầu buổi |
| G | Xác nhận lại scope với khách | Quang | Thứ Ba 10/11 ("hôm nay") | Câu trộn tiếng Anh, người chủ trì tự nhận |
| H | Cập nhật tài liệu API | chưa có | chưa có | "Cần ai đó…": không được đoán người làm |

## Chấp nhận cả hai cách

| # | Việc | Ghi chú |
|---|---|---|
| I | Anh Tùng (sales) gửi danh sách khách pilot | Tùng không nằm trong danh sách người tham gia. Bỏ qua, hoặc giữ với người làm để trống đều được. Gán cho một người tham gia là sai |

## Không phải task

- "Tuần trước em đã deploy bản hotfix lên staging rồi": việc đã xong.
- "Không biết có nên chuyển sang dùng queue khác không": đang cân nhắc, chưa quyết.
- "Mình nên refactor module notification lúc nào đó": mong muốn chung.
- "Nếu khách đồng ý thêm ngân sách thì mình mới làm export PDF": có điều kiện chưa xảy ra.
- "Bản build mobile lần trước em đã gửi cho QA rồi", "test xong hết": việc đã xong.
- "Đức chuẩn bị demo script": đã bị từ chối và chuyển cho Mai (xem E).

## Kết quả đã chạy

| Ngày | Mô hình | Task phải có (A–H) | Task sai | Ghi chú |
|---|---|---|---|---|
| 2026-11-14 | `claude-opus-5-5` | 8/8 đúng việc, đúng người làm, đúng hạn | 0 | Bỏ qua I (chấp nhận được). Một lần chạy, 19,8 giây. Task A: hạn đúng là thứ Tư nhưng câu trích dẫn làm bằng chứng lại là câu ban đầu nói "trước thứ Năm", nên người nhận sẽ thấy hạn và trích dẫn lệch nhau |
| 2026-11-14 | `claude-opus-5-5`, sau khi sửa prompt (trích dẫn phải khớp phiên bản cuối) | 3 lần chạy, cả 3 lần 8/8 đúng việc và đúng người làm | 0 | Task A: cả 3 lần trích đúng câu "trước thứ Tư". Task B ("sau buổi này"): 2 lần ra hạn thứ Ba 10/11, 1 lần để trống hạn; cách nói mơ hồ nên kết quả không ổn định, khi trống thì người nhận tự chọn hạn lúc xác nhận |
