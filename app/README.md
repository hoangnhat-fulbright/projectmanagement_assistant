# Trợ lý tuần 

App quản lý việc theo tuần cho chủ doanh nghiệp nhỏ: mỗi ngày app chỉ ra đúng một việc tiếp theo cần làm.
Đặc tả nằm trong `../scrum-pm-wiki/wiki/`, giao diện theo `../design.md`.

## Chạy

```bash
npm install
npm run dev
```

Kiểm tra kiểu và build bản phát hành: `npm run build`.

## Hai cách chạy

- **Bản một máy (mặc định):** không đăng nhập, dữ liệu nằm trong trình duyệt. Dùng để thử.
- **Bản trên mạng:** có đăng nhập bằng email, dự án dùng chung, mời người bằng mã. Bật bằng cách điền
  `VITE_SUPABASE_URL` và `VITE_SUPABASE_KEY` trong `.env`. Các bước đưa lên mạng: [DEPLOY.md](DEPLOY.md).
- Thử luồng đăng nhập và đồng bộ mà chưa cần tài khoản nào: `VITE_BACKEND=fake npm run dev` (mã đăng nhập luôn là 123456,
  mỗi tab trình duyệt là một người). Kiểm tra cơ sở dữ liệu: `npm run test:db`.

## Phạm vi

Có: thiết lập ban đầu 6 bước, Brainstorm dự án (Option 1 Goal + SMART tuỳ chọn, hoặc Option 2 Prompt → Task brief;
Milestone → WBS có Deadline và thứ tự ưu tiên; Stakeholder tuỳ chọn), màn hình "Task tuần này" (kéo việc vào tuần),
bảng việc 5 cột (Nộp việc, Trả lại kèm lý do, số ngày còn lại đến Deadline, tiêu chuẩn "Xong"), màn hình Hôm nay
với tổng quan đội, check-in, gỡ vướng, làm rõ việc, lên kế hoạch tuần có dẫn dắt, xem kết quả & rút kinh nghiệm,
nhắc việc trong app và Tìm giờ họp chung.

Ba vai trò: Nhóm trưởng (Team Lead), Thành viên (Member), Người quan sát (Observer, chỉ xem).

Chưa có: máy chủ lưu dữ liệu, tài khoản thật, thông báo đẩy. Dữ liệu lưu trong `localStorage` của trình duyệt,
nên mỗi máy một bản riêng. Vai trò, ID thành viên và CV mới là mô phỏng: đổi người dùng ở góc trên để thử từng vai,
CV và tệp tham khảo chỉ được ghi lại tên tệp. Để thử cả tuần, tua ngày ở mục Đội → Công cụ thử nghiệm.

## Bật AI cho Brainstorm (tuỳ chọn)

Không có khoá thì app vẫn chạy đủ; phần "gợi ý của app" trong Brainstorm dùng luật và mẫu có sẵn.
Để dùng Claude cho phần đó:

1. Sao chép `.env.example` thành `.env` (cùng thư mục `app/`).
2. Tự điền khoá API của bạn vào dòng `ANTHROPIC_API_KEY=` (lấy tại https://platform.claude.com). Không commit file này.
3. Chạy lại `npm run dev`. Góc trên tab Brainstorm sẽ hiện "AI đang bật".

AI làm 3 việc: tìm điểm chung / điểm riêng (Cách A), chấm SMART + đặt câu hỏi + viết lại goal, gợi ý
Milestone / WBS / Stakeholder. Deadline luôn do app tính. Mô hình: `claude-opus-5-5` (đổi ở `api/ai.ts`);
mỗi lần gọi tính tiền theo khoá của bạn. Gửi đi: goal, câu trả lời, số người, ngày; không gửi tên thành viên.
AI lỗi hoặc hết hạn mức thì app báo một dòng và dùng lại luật có sẵn.

Khoá chỉ nằm ở phía máy chủ (`api/ai.ts`, chạy trong máy chủ Vite). Chạy máy chủ AI riêng: `npm run server`.

## Cấu trúc

- `src/types.ts` — mô hình dữ liệu (khớp `wiki/tech/data-model.md`)
- `src/store.tsx` — trạng thái + lưu trữ; đổi sang backend thì thay ở đây
- `src/lib/today.ts` — logic thẻ "Việc tiếp theo" (khớp `wiki/features/core-loop.md`)
- `src/screens/` — mỗi màn hình / wizard một file
- `api/ai.ts` — máy chủ nhỏ giữ khoá API, gọi Claude cho Brainstorm
- `src/brainstorm/` — Brainstorm: `logic.ts` (luật có sẵn, tính Deadline), `ai.ts` (gọi máy chủ AI), các bước, khu ghi chú
- `src/lib/meeting.ts` + `src/screens/Meeting.tsx` — Tìm giờ họp (xếp hạng "giờ đẹp nhất")
- `src/screens/WeeklyTasks.tsx` — "Task tuần này"; `src/screens/Board.tsx` — bảng việc, nộp việc, trả lại
- `src/components/task.tsx` — nhãn trạng thái, số ngày còn lại, ưu tiên
- `src/components/Voxel.tsx` — hình khối isometric (SVG)
- `src/styles.css` — design tokens theo `design.md`
