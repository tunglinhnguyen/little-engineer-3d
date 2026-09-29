import type { Mission } from './types';

export const MISSIONS: Mission[] = [
  {
    id: 'light', title: 'Thắp sáng phòng lab', emoji: '💡',
    description: 'Ráp Pin → Công tắc → Đèn rồi bật công tắc.',
    lesson: 'Dòng điện chỉ chạy khi có đường dẫn kín.',
    requiredPath: ['battery', 'switch', 'lamp'],
    success: 'Đúng rồi! Điện đã đi từ pin qua công tắc tới đèn.',
  },
  {
    id: 'fan', title: 'Chế tạo quạt mini', emoji: '🌀',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Cánh quạt.',
    lesson: 'Mô tơ đổi điện năng thành chuyển động quay.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'fan'],
    success: 'Quạt đã chạy! Con vừa tạo một chuỗi biến đổi năng lượng.',
  },
  {
    id: 'drill', title: 'Chế tạo máy khoan', emoji: '🛠️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Đầu khoan.',
    lesson: 'Cùng một mô tơ có thể vận hành nhiều công cụ khác nhau.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'drill'],
    success: 'Máy khoan hoạt động! Thay đầu ra là con tạo được một máy mới.',
  },
  {
    id: 'gear', title: 'Khám phá hộp số', emoji: '⚙️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Bánh răng nhỏ → Bánh răng lớn → Bánh xe.',
    lesson: 'Bánh răng thay đổi tốc độ quay và lợi thế mô-men.',
    requiredPath: ['battery', 'switch', 'motor', 'gear-small', 'gear-large', 'wheel'],
    success: 'Tuyệt! Chuyển động đã truyền qua bộ bánh răng tới bánh xe.',
  },
];
