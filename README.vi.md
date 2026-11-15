# Cam kết sau họp

_Bản tiếng Việt. English version: [README.md](README.md)._

**Cam kết sau họp** biến mỗi cuộc họp thành các cam kết được theo dõi đến khi xong. Bạn dán phiên âm cuộc họp; AI trích ra từng việc kèm câu nói làm bằng chứng; mỗi người nhận một email và xác nhận việc của mình bằng một cú bấm, không cần tài khoản; sau đó app nhắc việc vào đúng khoảng trống trong lịch của người đó thay vì một giờ cố định mà ai cũng đang họp. Các công cụ ghi chú họp dừng ở biên bản; app này bắt đầu từ biên bản.

| Nộp bài | Ở đâu |
|---|---|
| Mã nguồn | Repo này: `src/`, `test/`, `scripts/`, `evals/` |
| README (trang này) | Sản phẩm, cách chạy, quy trình làm việc với Claude, nhóm |
| Tracking plan | [TRACKING_PLAN.vi.md](TRACKING_PLAN.vi.md) |
| Tài liệu thiết kế | [wiki/](wiki/README.md), 12 trang |

## Vấn đề

Sau một cuộc họp, ba việc thường hỏng:

- **Không ai chính thức nhận việc.** Action items nằm trong biên bản. Tuần sau họp lại mới phát hiện "tôi tưởng anh làm".
- **Nhắc việc đến sai lúc.** Lời nhắc 9 giờ sáng đến đúng lúc mọi người đang họp, nên bị bỏ qua.
- **Không ai thấy chuỗi phụ thuộc.** Việc này chờ việc kia; việc đầu trễ thì cả chuỗi trễ, và đến sát giờ họp mới biết.

Chi tiết ở [wiki/01-tong-quan-san-pham.md](wiki/01-tong-quan-san-pham.md).

## Người dùng mục tiêu

Nhóm 5–30 người họp định kỳ (standup, weekly, sprint review).

| Vai trò | Cần gì | Dùng gì trong app |
|---|---|---|
| Người chủ trì họp, quản lý nhóm | Biết ai nhận việc gì mà không phải đi hỏi từng người | Bảng tổng hợp: việc chưa ai nhận, bị từ chối, hết hạn chờ |
| Thành viên nhóm | Không quên việc đã hứa; được nhắc lúc rảnh | Email xác nhận một cú bấm, email nhắc việc theo lịch |

## Tính năng chính

| Tính năng | Tình trạng |
|---|---|
| **Trích xuất task từ phiên âm** bằng Claude. Mỗi task phải kèm câu trích dẫn nguyên văn; task có trích dẫn không tìm thấy trong phiên âm bị code loại bỏ | Chạy được |
| **One-Click Commitment.** Mỗi người nhận một email gom mọi task của họ, với ba nút Xác nhận, Sửa, Không phải của tôi. Không cần tài khoản | Chạy được |
| **Bảng tổng hợp cho người chủ trì.** Gán lại, gửi lại, bỏ task, đánh dấu xong | Chạy được |
| **Context-Aware Nudging.** Nhắc chuẩn bị 2 tiếng trước cuộc họp liên quan, dịch sớm lên khoảng trống gần nhất nếu lúc đó bận; nhắc khoảng trống khi còn dưới 48 giờ đến hạn; tối đa 3 lần mỗi ngày, cách nhau 90 phút | Chạy được với lịch nhập tay. Chưa kết nối Google Calendar |
| **Blocker Detection.** Cảnh báo sớm khi một việc sắp trễ kéo theo việc khác | Mới có thiết kế ([wiki/05](wiki/05-blocker-detection.md)) |
| **Thu âm và phiên âm** ngay trong app | Mới có thiết kế. Hiện nhận phiên âm dán vào |

Ba nguyên tắc sản phẩm: ít thông báo mà trúng; AI đề xuất, con người quyết định; lịch của một người không hiển thị cho người khác.

## Kênh ra mắt, cách có người dùng và doanh thu

Phần này là kế hoạch. Sản phẩm chưa có người dùng thật và chưa có doanh thu.

- **Kênh ra mắt: chính email xác nhận.** Người chủ trì là người duy nhất phải biết đến app. Mọi người còn lại gặp sản phẩm lần đầu qua email "Xác nhận 2 task từ buổi họp…" và dùng được ngay, không cài đặt, không đăng ký. Mỗi cuộc họp vì thế đưa sản phẩm đến 5–10 người mới, và một người nhận hôm nay là người chủ trì của cuộc họp khác ngày mai.
- **Thứ tự ra mắt:** nhóm của chính chúng tôi dùng cho các buổi họp của mình trong 2 tuần để có dữ liệu thật; sau đó vài nhóm quen ở các công ty phần mềm; rồi mới mở đăng ký công khai.
- **Doanh thu:** thu phí theo người chủ trì (người tạo cuộc họp và xem bảng tổng hợp). Người chỉ nhận và xác nhận task không mất phí, để vòng lan tỏa ở trên không bị chặn. Mức giá chưa đặt; quyết định này còn mở (mục S7 trong [wiki/12-quyet-dinh-mo.md](wiki/12-quyet-dinh-mo.md)).
- **Chỉ số quyết định có đi tiếp hay không:** tỷ lệ task được xác nhận trong 24 giờ, mục tiêu ban đầu ≥ 70%. Cách đo ở [TRACKING_PLAN.vi.md](TRACKING_PLAN.vi.md).

## Cách chạy

Cần Node.js 24 trở lên. Không có bước build và không cần cài database.

```bash
npm install
```

```bash
npm start
```

Mở http://localhost:3000, chọn **Cuộc họp mới** → **Điền ví dụ mẫu** → **Trích xuất task**. Lần khởi động đầu mất khoảng 10 giây để tạo database.

Không cần cấu hình gì để thử, nhưng mặc định app chạy ở hai chế độ thử:

| Chế độ thử | Vì sao | Cách chuyển sang thật |
|---|---|---|
| Trích xuất **demo** (luật từ khóa) | Chưa có khóa Claude | Đặt `ANTHROPIC_API_KEY` trong `.env` |
| Email nằm ở **/outbox**, không gửi đi | Chưa có SMTP | Đặt `SMTP_URL` và `MAIL_FROM` trong `.env` |

Sao chép `.env.example` thành `.env` để cấu hình. Khi đưa app lên mạng, bắt buộc đặt `APP_PASSWORD` và `BASE_URL`. App chưa được triển khai ở địa chỉ công khai nào.

### Luồng

1. Người chủ trì dán phiên âm và danh sách người tham gia.
2. AI trích ra các task, mỗi task kèm câu trích dẫn nguyên văn. Task có trích dẫn không tìm thấy trong phiên âm bị loại.
3. Mỗi người nhận **một** email gom mọi task của họ, mỗi task có ba nút: Xác nhận, Sửa, Không phải của tôi.
4. Bấm nút mở một trang; hành động chỉ xảy ra khi bấm tiếp trên trang đó, nên bộ quét email không vô tình xác nhận thay.
5. Người chủ trì theo dõi ở bảng tổng hợp: task chưa có người nhận, bị từ chối, hết hạn chờ đều quay về đây.
6. Chưa phản hồi sau 4 giờ thì nhắc lại một lần; sau 72 giờ thì hết hạn chờ. Người đã có dữ liệu lịch được nhắc ở khoảng trống đầu tiên sau mốc 4 giờ.
7. Task đã cam kết được nhắc theo lịch của người làm (xem dưới).

### Nhắc việc theo lịch (giai đoạn 2)

Thiết kế ở [wiki/04-context-aware-nudging.md](wiki/04-context-aware-nudging.md). Tóm tắt những gì đang chạy:

| Loại nhắc | Khi nào |
|---|---|
| Nhắc chuẩn bị | 2 tiếng trước cuộc họp liên quan hoặc hạn (2 lần công sức nếu lớn hơn). Lúc đó bận thì dịch **sớm** lên đầu khoảng trống gần nhất, không bao giờ dịch muộn |
| Nhắc khoảng trống | Task chưa bắt đầu, còn dưới 48 giờ đến hạn: gửi vào đầu khoảng trống điểm cao nhất (đủ dài để làm xong, gần hạn) |
| Nhắc theo hạn | Người chưa có dữ liệu lịch: 2 tiếng trước hạn, trong giờ làm việc mặc định |

- Mỗi người tối đa 3 lần nhắc mỗi ngày, cách nhau ít nhất 90 phút; nhiều task đến giờ cùng lúc gom vào một email.
- Email nhắc có các nút **Xong rồi**, **Đang làm**, **Nhắc ở khoảng trống sau**, **Dời hạn**. Hoãn hai lần thì app hỏi dời hạn thay vì nhắc tiếp.
- Lịch nhắc được tính lại khi task hoặc lịch thay đổi, và được kiểm tra lại ngay trước khi gửi (task còn mở không, người đó có đang bận không).
- Người chủ trì chỉ thấy số lời nhắc của một task, không thấy giờ nhắc: giờ nhắc để lộ lịch của người làm.

Thử nhanh:

1. Tạo một cuộc họp từ ví dụ mẫu, mở **Hộp thư thử** và xác nhận một task thay người nhận.
2. Vào **Lịch thử**, chọn người đó, lưu giờ làm việc (tích cả T7, CN nếu đang thử cuối tuần) và thêm vài khung giờ bận. Từ lúc này người đó được nhắc theo lịch; phần **Lời nhắc** ở cuối trang cho biết sẽ nhắc lúc nào và vì sao.
3. Ở trang cuộc họp, mở **Nhắc việc** trên thẻ task để gắn cuộc họp liên quan và công sức ước tính.
4. Đến giờ, email nhắc xuất hiện ở **Hộp thư thử** (app kiểm tra mỗi phút; nút **Chạy lượt nhắc ngay** ở trang Lịch thử để khỏi chờ).

App không nhắc trong 30 phút đầu sau khi người làm vừa xác nhận task. Khi thử, đặt `NUDGE_QUIET_AFTER_COMMIT_MINUTES=0` trong `.env` để bỏ khoảng lặng này.

**Lịch thử** là nguồn lịch nhập tay, đứng sau cùng một interface (`CalendarSource` trong `src/calendar/source.ts`) mà Google Calendar sẽ dùng. Kết nối Google Calendar thật cần một OAuth client và chưa được làm.

### Lệnh

| Lệnh | Việc làm |
|---|---|
| `npm start` | Chạy app |
| `npm run dev` | Chạy và tự khởi động lại khi sửa mã |
| `npm test` | Chạy 48 test (database trong bộ nhớ, đồng hồ giả, không gọi mạng) |
| `npm run try:claude` | Chạy bộ trích xuất Claude trên ví dụ mẫu và in kết quả. Thêm `-- phien-am.txt nguoi-tham-gia.txt` để thử phiên âm của bạn. Mỗi lần chạy là một lần gọi API có tính phí |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |

### Cấu trúc mã

| Đường dẫn | Nội dung |
|---|---|
| `src/main.ts` | Khởi động server và việc định kỳ (mỗi phút) |
| `src/app.ts` | Các route: trang của người chủ trì, trang Lịch thử, và trang hành động `/a/:token` |
| `src/pipeline.ts` | Trích xuất → kiểm tra → lưu task → gửi yêu cầu xác nhận |
| `src/ai/` | Bộ trích xuất Claude, bộ demo, và bước kiểm tra kết quả |
| `src/domain/tasks.ts` | Máy trạng thái của task và nhật ký sự kiện |
| `src/domain/tokens.ts` | Token dùng một lần cho liên kết trong email |
| `src/domain/notify.ts` | Gom task theo người và gửi email |
| `src/sweeper.ts` | Hết hạn chờ, và nhắc xác nhận sau 4 giờ cho người chưa có lịch |
| `src/nudge/gaps.ts` | Tính khoảng trống trong lịch (thuần, không I/O; giai đoạn 3 sẽ dùng lại) |
| `src/nudge/timing.ts` | Chọn thời điểm nhắc: nhắc chuẩn bị, nhắc khoảng trống, nhắc xác nhận (thuần) |
| `src/domain/nudges.ts` | Lập lịch lại, kiểm tra trước khi gửi, giới hạn chống làm phiền, gửi email nhắc |
| `src/domain/calendar.ts` | Bản sao lịch bận/rảnh và giờ làm việc trong database |
| `src/calendar/source.ts` | Interface nguồn lịch, đồng bộ vào bản sao, nguồn giả lập |
| `src/schema.sql` | Schema database |
| `src/views.ts`, `src/email.ts` | Giao diện web và nội dung email |
| `evals/` | Phiên âm giả lập kèm đáp án viết trước, để chấm bộ trích xuất |

Mã là TypeScript chạy thẳng bằng Node, web dựng bằng Hono với HTML ở server. Database là PGlite (Postgres chạy trong tiến trình Node), dữ liệu nằm ở `data/pg`. SQL là SQL Postgres chuẩn; đổi sang server Postgres thật chỉ cần viết lại `src/db.ts`.

## Quy trình làm việc với Claude

Claude có mặt ở hai chỗ: là công cụ chúng tôi dùng để làm ra sản phẩm (Claude Code), và là một phần của sản phẩm (trích xuất task qua Claude API).

### Cách chúng tôi dùng

1. **Viết thiết kế trước, code sau.** Trước dòng code đầu tiên, chúng tôi cùng Claude viết 12 trang wiki: vấn đề, từng tính năng, mô hình dữ liệu, bảo mật, roadmap, và danh sách quyết định còn mở. Mỗi tính năng sau đó được giao cho Claude với chính trang wiki của nó làm đặc tả.
2. **Mỗi giai đoạn một phiên Claude Code riêng.** Một phiên làm giai đoạn 1, rồi mở phiên khác cho giai đoạn 2 với một bản giao việc ngắn: đọc gì trước, làm gì, và "xong khi" nào. Các phiên để lại ghi chú bàn giao cho nhau.
3. **Điều kiện xong là thứ Claude tự kiểm được.** Mỗi bản giao việc kết thúc bằng: `npm test` và `npm run typecheck` qua, ví dụ có số liệu trong wiki phải thành test, và phải chạy thử trên trình duyệt. Claude tự mở trình duyệt, bấm qua trọn luồng và chụp màn hình làm bằng chứng.
4. **Claude ghi lại mọi quyết định nó tự đưa ra.** Chỗ nào đặc tả không nói, Claude chọn một phương án rồi ghi vào nhật ký quyết định ([wiki/12](wiki/12-quyet-dinh-mo.md)) và mục "Bản đang chạy khác gì thiết kế" ([wiki/04](wiki/04-context-aware-nudging.md#bản-đang-chạy-khác-gì-thiết-kế)), để con người duyệt lại sau.
5. **Trong sản phẩm, Claude đề xuất và code kiểm tra.** Bộ trích xuất dùng `claude-opus-5-5`. Mỗi task phải kèm câu trích dẫn nguyên văn; code đối chiếu câu đó với phiên âm và loại task nào không khớp. Việc chọn giờ nhắc thì cố ý **không** dùng LLM: đó là thuật toán thuần, để kết quả lặp lại được và giải thích được.

### Điều hiệu quả

- **Ví dụ có số liệu trong đặc tả.** Trang thiết kế Nudging có một lịch mẫu ("lịch thứ Sáu của Lan") với đáp án 10:35 và 14:05. Claude biến nó thành test trước, rồi viết thuật toán cho test qua. Module thuần qua cả 14 test ngay lần chạy đầu.
- **Tách phần thuần khỏi phần chạm database.** Thuật toán chọn giờ không đọc database hay đồng hồ, nên 48 test chạy trong khoảng 40 giây, không cần mạng, và giả lập được cả một tuần làm việc bằng đồng hồ giả.
- **Viết đáp án trước khi chạy mô hình.** Bộ `evals/sprint-sync` là một buổi họp giả lập có bẫy (hạn bị đổi giữa chừng, việc bị từ chối rồi chuyển người, câu trộn tiếng Anh). Claude trích đúng 8/8 task, đúng người làm và hạn. Lần chạy đầu lộ một lỗi tinh vi: hạn đúng nhưng câu trích dẫn là câu nói *trước khi* đổi hạn. Sửa prompt xong, 3 lần chạy đều trích đúng câu.
- **Bắt Claude chạy thử thật.** Lần bấm thử trên trình duyệt đi trọn một nudge từ lúc lập lịch, qua bộ hẹn giờ thật, đến nút "Xong rồi", trên một bản chạy riêng với database tạm để không đụng dữ liệu đang dùng.

### Điều không hiệu quả

- **Đặc tả mơ hồ thì Claude phải đoán, và lần đầu đoán sai.** Lần chạy đầu của test luồng nhắc việc hỏng 4/10. Một lỗi do chính Claude hiểu sai hệ quả của quy tắc chấm điểm "càng gần hạn càng tốt"; các lỗi còn lại do dữ liệu dựng test. Wiki cũng có một ví dụ tự mâu thuẫn (ghi "60 phút lúc 14:00" trong khi quy tắc là khoảng trống bắt đầu sau cuộc họp 5 phút) mà chỉ khi viết thành test mới lộ ra.
- **Claude thêm quy tắc ngoài đặc tả.** Ví dụ khoảng lặng 30 phút sau khi vừa xác nhận, hay bỏ hẳn nhắc chuẩn bị khi chạm giới hạn thay vì dời muộn. Các lựa chọn này hợp lý và đã được ghi lại, nhưng là quyết định sản phẩm chưa ai trong nhóm kiểm chứng với người dùng.
- **Kết quả trích xuất chưa ổn định với cách nói mơ hồ.** Với câu "em gửi sau buổi này", 2 trong 3 lần Claude ra hạn hôm đó, 1 lần để trống. Chúng tôi chấp nhận: khi trống, người nhận tự chọn hạn lúc xác nhận.
- **Những việc Claude không tự làm được.** Kết nối Google Calendar cần một OAuth client do người tạo; gửi email thật cần tài khoản SMTP; đánh giá chất lượng cần phiên âm họp thật. Cả ba vẫn chưa xong, nên sản phẩm mới được kiểm trên ví dụ mẫu 9 dòng và một buổi họp giả lập.
- **Mọi tham số vẫn là phỏng đoán.** 2 tiếng báo trước, 15 phút tối thiểu, 3 lần mỗi ngày, 90 phút giãn cách: Claude cài đúng theo đặc tả, nhưng chưa có dữ liệu sử dụng nào để biết các con số này đúng hay sai.
- **Nhiều phiên dùng chung một thư mục thì vướng nhau.** Server của phiên này giữ database khiến phiên kia phải chạy ở cổng khác với database tạm, và server đang chạy phải khởi động lại mới nhận schema mới.

## Thành viên nhóm

<!-- Điền tên, vai trò và đóng góp của từng người trước khi nộp. -->

| Thành viên | Vai trò | Đóng góp |
|---|---|---|
| _(điền tên)_ | _(điền vai trò)_ | _(điền đóng góp)_ |
| _(điền tên)_ | _(điền vai trò)_ | _(điền đóng góp)_ |
| _(điền tên)_ | _(điền vai trò)_ | _(điền đóng góp)_ |
