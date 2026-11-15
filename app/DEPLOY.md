# Đưa app lên mạng (Supabase + Vercel)

Sau các bước này, app có một địa chỉ web. Ai vào cũng phải đăng nhập bằng email; mỗi người tự lập dự án
(thành Nhóm trưởng) hoặc vào dự án của người khác bằng mã mời.

Bạn cần tự làm các bước có tài khoản và khoá. Mất khoảng 30 phút.

| Dịch vụ | Dùng để | Chi phí |
|---|---|---|
| Supabase | Đăng nhập, lưu dữ liệu dự án | Có gói miễn phí |
| Vercel | Đặt trang web và phần gọi AI | Có gói miễn phí |
| Dịch vụ gửi thư (ví dụ Resend) | Gửi mã đăng nhập | Có gói miễn phí |
| Anthropic API | Gợi ý AI trong Brainstorm | Trả theo lượt gọi, bằng khoá bạn đã có |

## Cách nhanh: một lệnh

Sau khi đã có tài khoản Supabase và Vercel (tạo trên trang web của họ, chưa cần làm gì thêm), chạy trong thư mục `app`:

```bash
npm run deploy
```

Script hỏi tên project, rồi tự làm lần lượt: tạo project Supabase, nạp `schema.sql`, ghi địa chỉ và khoá công khai vào `.env`,
tạo project Vercel, đặt biến môi trường (kể cả khoá AI lấy từ `.env`, không in ra màn hình), đưa app lên,
và khai báo địa chỉ web cùng mẫu thư có mã 6 số cho Supabase.

- Trình duyệt sẽ mở **hai lần** để bạn xác nhận đăng nhập (Supabase, rồi Vercel). Đó là phần duy nhất bạn phải bấm.
- Mất khoảng 5–8 phút, phần lớn là chờ project Supabase khởi động.
- Nếu dừng giữa chừng, chạy lại đúng lệnh đó: bước đã xong không bị làm lại. Tiến độ nằm ở `.deploy-state.json`.
- Xem trước các lệnh sẽ chạy mà không tạo gì: `npm run deploy -- --dry-run`.
- Chỉ làm phần Supabase để thử đăng nhập trên máy trước: `npm run deploy -- --skip-vercel`.
- Sau này sửa mã và muốn đưa bản mới lên: chạy lại `npm run deploy`.

Việc script **không** làm được, bạn vẫn phải tự làm: gắn dịch vụ gửi thư riêng (mục 1, bước 5 bên dưới).
Thiếu bước này app vẫn chạy nhưng chỉ gửi được 2 thư đăng nhập mỗi giờ.

Script đã chạy thật ngày 2026-11-15. Nếu một bước báo lỗi, script in nguyên văn lỗi và dừng lại;
phần hướng dẫn làm tay bên dưới dùng được cho đúng bước đó.

**Về thư đăng nhập:** ở gói miễn phí, Supabase không cho sửa mẫu thư khi còn dùng thư mặc định của họ.
Vì vậy trước khi gắn dịch vụ gửi thư riêng, thư chỉ có link (bấm vào là vào app), chưa có mã 6 số.
Gắn dịch vụ gửi thư xong, chạy lại `npm run deploy` để thư có mã.

## Làm tay từng bước

## 1. Supabase

1. Tạo tài khoản tại https://supabase.com rồi tạo một project mới (chọn vùng gần Việt Nam, ví dụ Singapore).
2. Mở **SQL Editor**, dán toàn bộ nội dung file [supabase/schema.sql](supabase/schema.sql), bấm **Run**.
   File này tạo bảng, quyền truy cập và các hàm; chạy lại nhiều lần không sao.
3. Mở **Connect** (hoặc Settings → API Keys) và chép hai giá trị:
   - **Project URL** (dạng `https://xxxx.supabase.co`)
   - **Publishable key** (dạng `sb_publishable_...`). Không dùng Secret key.
4. **Authentication → Email Templates**: sửa cả hai mẫu **Magic Link** và **Confirm signup** để thư có mã 6 số.
   Người mới nhận mẫu Confirm signup, người cũ nhận mẫu Magic Link. Nội dung gợi ý:

   ```html
   <h2>Mã đăng nhập</h2>
   <p>Mã của bạn: <strong>{{ .Token }}</strong></p>
   <p>Hoặc bấm vào đây để vào thẳng: <a href="{{ .ConfirmationURL }}">Đăng nhập</a></p>
   <p>Mã có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu, hãy bỏ qua thư này.</p>
   ```

5. **Gửi thư.** Thư mặc định của Supabase chỉ gửi được **2 thư mỗi giờ cho cả project**, không đủ cho nhiều người.
   Vào **Authentication → Emails → SMTP Settings**, bật Custom SMTP và điền thông tin của một dịch vụ gửi thư
   (ví dụ Resend: tạo tài khoản, xác minh tên miền hoặc dùng địa chỉ thử của họ, lấy thông tin SMTP).
   Sau đó vào **Authentication → Rate Limits** để nâng số thư mỗi giờ.

## 2. Thử trên máy trước

1. Mở file `app/.env` (nếu chưa có thì sao chép từ `.env.example`) và tự điền:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_...
   ANTHROPIC_API_KEY=...        (đã có từ trước)
   ```

2. Chạy app:

   ```bash
   npm run dev
   ```

3. Mở http://localhost:5173. Bạn sẽ thấy màn Đăng nhập. Đăng nhập, lập một dự án, vào mục **Đội** để lấy mã mời.
   Mở một cửa sổ ẩn danh, đăng nhập bằng email khác, nhập mã mời: hai cửa sổ phải thấy chung dữ liệu.

Xoá hai dòng `VITE_SUPABASE_...` thì app quay về bản dựng thử trên một máy (không đăng nhập).

## 3. Vercel

1. Tạo tài khoản tại https://vercel.com.
2. Trong thư mục `app`, chạy lệnh dưới và làm theo câu hỏi trên màn hình (đăng nhập, đặt tên project, giữ các mặc định):

   ```bash
   npx vercel
   ```

3. Thêm 3 biến môi trường cho project trên Vercel (Settings → Environment Variables, chọn cả Production và Preview):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `ANTHROPIC_API_KEY`.
4. Đưa lên bản chính thức:

   ```bash
   npx vercel --prod
   ```

   Lệnh in ra địa chỉ web của app, ví dụ `https://ten-app.vercel.app`.

## 4. Nối hai bên

1. Quay lại Supabase → **Authentication → URL Configuration**:
   - **Site URL**: địa chỉ Vercel ở bước 3.
   - **Redirect URLs**: thêm địa chỉ Vercel đó và `http://localhost:5173`.
2. Mở địa chỉ Vercel, đăng nhập thử, lập dự án, mời một người bằng mã.

## Điều cần biết khi đã công khai

- **Ai có địa chỉ web cũng đăng ký và lập dự án riêng được.** Dữ liệu các dự án tách nhau; người ngoài dự án không đọc được.
- **Mã mời là chìa khoá vào dự án.** Ai có mã Thành viên thì sửa được dữ liệu dự án đó. Chỉ gửi mã cho đúng người.
- **AI:** chỉ Nhóm trưởng gọi được, mỗi dự án tối đa 20 lượt mỗi ngày (đổi số này trong `supabase/schema.sql`, hàm `use_ai`).
  Hết lượt thì app dùng gợi ý theo mẫu. Vì ai cũng lập dự án được, tổng chi phí AI = số dự án × 20 lượt mỗi ngày ở mức tối đa;
  nếu lo, đặt hạn mức chi tiêu trong trang quản lý khoá Anthropic.
- **Quyền chi tiết** (ví dụ thành viên chỉ sửa việc của mình) mới được giữ ở giao diện. Máy chủ chỉ đảm bảo: phải là thành viên
  mới đọc được, và Người quan sát không ghi được.
- **CV và tệp tham khảo** vẫn chỉ lưu tên tệp, chưa tải nội dung lên.
- **Hai người sửa cùng lúc:** app tự ghép thay đổi; nếu hai người sửa đúng một ô thì người lưu sau thắng.
