/** Ví dụ mẫu cho form "Cuộc họp mới". Có cả câu là task lẫn câu KHÔNG phải task. */
export const SAMPLE = {
  title: "Họp nhóm Sales",
  participants: ["Trần Minh <minh@example.com>", "Nguyễn Lan <lan@example.com>", "Lê Hùng <hung@example.com>"].join("\n"),
  transcript: [
    "[00:00] Minh: Mình bắt đầu nhé. Tuần này cần chốt số liệu Q4 để trình ban giám đốc.",
    "[00:45] Lan: Số liệu doanh thu em gần xong rồi, còn thiếu phần miền Trung.",
    "[01:10] Minh: Lan gửi giúp anh báo cáo doanh thu Q4 trước thứ Sáu nhé.",
    "[01:25] Lan: Dạ được anh.",
    "[01:40] Hùng: Em đợi số liệu của Lan rồi làm slide. Em sẽ chuẩn bị slide trình ban giám đốc trước thứ Hai tuần sau.",
    "[02:15] Minh: Ok. Ngoài ra chúng ta nên cải thiện quy trình báo cáo hằng tuần.",
    "[02:40] Hùng: Tuần trước em đã gửi hợp đồng cho khách rồi ạ.",
    "[03:05] Minh: Tốt. Ai đó cần kiểm tra lại điều khoản thanh toán với bên pháp lý nhé.",
    "[03:30] Lan: Để em cập nhật bảng theo dõi khách hàng trong ngày mai.",
  ].join("\n"),
};
