import { ConnectionGraph } from './connectionGraph';
import { MODULES } from './moduleRegistry';
import type { Mission, SimulationState } from './types';

export function getMissionFeedback(graph: ConnectionGraph, mission: Mission, state: SimulationState, running: boolean) {
  const required = mission.requiredPath;
  if (!graph.modules.size) return { status: 'incomplete', message: `Chọn ${MODULES[required[0]].name} ở kho để bắt đầu.` };
  if (!graph.findPathByTypes(required)) {
    const missing = required.filter(type => ![...graph.modules.values()].some(m => m.type === type));
    if (missing.length) return { status: 'incomplete', message: `Cần thêm: ${missing.map(type => MODULES[type].name).join(', ')}.` };
    for (let i = 0; i < required.length - 1; i++) {
      if (!graph.findPathByTypes(required.slice(0, i + 2))) {
        return { status: 'incomplete', message: `Chưa nối đủ chuỗi: ${MODULES[required[i]].name} → ${MODULES[required[i + 1]].name}. Kéo hai cổng lại gần nhau; cổng xanh lá là đã nối.` };
      }
    }
  }
  const switchesOn = graph.findPathByTypes(required, path => path.every(m => m.type !== 'switch' || m.switchOn !== false));
  if (!switchesOn) return { status: 'switch-off', message: 'Công tắc trong mạch đang tắt. Chạm 2 lần trực tiếp vào công tắc để bật, hoặc dùng nút Bật trong bảng thông tin.' };
  const activePath = graph.findPathByTypes(required, path => path.every(m => state.active.has(m.id)));
  if (!activePath) return { status: 'inactive', message: 'Chuỗi đã nối nhưng đầu ra chưa hoạt động. Kiểm tra nguồn điện và các cổng nối.' };
  return running
    ? { status: 'complete', message: `🎉 ${mission.success}` }
    : { status: 'ready', message: '✅ Ráp đúng chuỗi rồi! Bấm ▶ Chạy để xem máy hoạt động.' };
}

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
    lesson: 'Bánh 12 răng truyền sang bánh 24 răng làm bánh lớn quay ngược chiều và bằng nửa tốc độ.',
    requiredPath: ['battery', 'switch', 'motor', 'gear-small', 'gear-large', 'wheel'],
    success: 'Tuyệt! Bánh răng lớn đang quay ngược chiều và chậm hơn bánh nhỏ đúng theo tỉ số răng.',
  },
  {
    id: 'solar-led', title: 'Đèn năng lượng mặt trời', emoji: '☀️',
    description: 'Ráp Pin mặt trời → Công tắc → Đèn LED.',
    lesson: 'Ánh sáng có thể được biến đổi thành điện năng rồi thành ánh sáng lần nữa ở LED.',
    requiredPath: ['solar', 'switch', 'led'],
    success: 'Đèn LED đã sáng bằng nguồn điện từ pin mặt trời.',
  },
  {
    id: 'propeller', title: 'Động cơ chân vịt', emoji: '✣',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Chân vịt.',
    lesson: 'Chân vịt quay quanh đúng trục sẽ đẩy môi trường về sau và tạo lực đẩy về trước.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'propeller'],
    success: 'Chân vịt đang quay đúng quanh trục truyền động.',
  },
  {
    id: 'pump', title: 'Máy bơm mini', emoji: '💧',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Bơm nước.',
    lesson: 'Cánh bơm nhận mô-men từ trục và truyền năng lượng cho chất lỏng.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'pump'],
    success: 'Cánh bơm đã quay. Chuỗi điện → mô tơ → trục → bơm hoạt động đúng.',
  },
  {
    id: 'buzzer', title: 'Chuông báo điện', emoji: '🔔',
    description: 'Ráp Pin → Công tắc → Còi điện.',
    lesson: 'Khi mạch kín, điện làm phần tử trong còi rung để tạo âm thanh.',
    requiredPath: ['battery', 'switch', 'buzzer'],
    success: 'Mạch báo động đã được cấp điện đúng đường.',
  },
];
