export interface IndustryTemplate {
  id: string;
  label: string;
  goals: string[];
  items: string[];
  dod: string[];
}

const COMMON_DOD = ['Đã có người khác kiểm tra', 'Không còn bước nhỏ nào dang dở'];

export const INDUSTRIES: IndustryTemplate[] = [
  {
    id: 'shop',
    label: 'Shop online',
    goals: ['Tăng doanh thu online 30%', 'Ra mắt bộ sưu tập Tết'],
    items: [
      'Chụp ảnh 10 sản phẩm mới',
      'Viết mô tả cho các sản phẩm mới',
      'Chạy thử quảng cáo 3 ngày',
      'Trả lời hết tin nhắn tồn trên fanpage',
      'Kiểm kê kho',
      'Làm bảng giá combo quà tặng',
    ],
    dod: [...COMMON_DOD, 'Đã đăng lên trang bán hàng'],
  },
  {
    id: 'agency',
    label: 'Agency / dịch vụ',
    goals: ['Ký thêm 5 khách hàng mới', 'Giao bài đúng hẹn cho mọi khách'],
    items: [
      'Gửi báo giá cho các khách đang chờ',
      'Hoàn thiện bản thiết kế vòng 1',
      'Họp nhận yêu cầu khách mới',
      'Cập nhật hồ sơ năng lực',
      'Gọi lại khách cũ hỏi nhu cầu',
      'Soạn hợp đồng mẫu',
    ],
    dod: [...COMMON_DOD, 'Đã gửi cho khách và khách xác nhận nhận được'],
  },
  {
    id: 'workshop',
    label: 'Xưởng sản xuất',
    goals: ['Giao đúng hạn mọi đơn hàng', 'Giảm hàng lỗi'],
    items: [
      'Lên định mức vật tư cho đơn hàng mới',
      'Bảo trì máy định kỳ',
      'Kiểm tra chất lượng lô hàng tuần này',
      'Sắp xếp lại khu vực kho vật tư',
      'Đặt nguyên liệu cho tháng sau',
      'Hướng dẫn thợ mới quy trình an toàn',
    ],
    dod: [...COMMON_DOD, 'Đã qua kiểm tra chất lượng'],
  },
  {
    id: 'food',
    label: 'Nhà hàng / quán',
    goals: ['Tăng lượng khách quay lại', 'Ra mắt thực đơn mới'],
    items: [
      'Thử 3 món mới cho thực đơn',
      'Chụp ảnh thực đơn mới',
      'Đào tạo nhân viên mới quy trình phục vụ',
      'Rà soát giá nguyên liệu với nhà cung cấp',
      'Trang trí lại khu vực đón khách',
      'Trả lời các đánh giá của khách trên mạng',
    ],
    dod: [...COMMON_DOD, 'Chủ quán đã thử / xem và đồng ý'],
  },
  {
    id: 'other',
    label: 'Ngành khác',
    goals: ['Tăng doanh thu', 'Ra mắt sản phẩm / dịch vụ mới'],
    items: [
      'Liệt kê các khách hàng cần chăm sóc lại',
      'Dọn dẹp và sắp xếp tài liệu chung',
      'Viết quy trình cho việc lặp lại nhiều nhất',
      'Gọi 5 khách hàng hỏi ý kiến',
    ],
    dod: COMMON_DOD,
  },
];

export function industryById(id: string): IndustryTemplate {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[INDUSTRIES.length - 1];
}
