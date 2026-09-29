import type { ModuleDefinition, ModuleType } from './types';

const LR = {
  powerIn: { id: 'power-in', signal: 'power' as const, direction: 'in' as const, position: [-0.72, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  powerOut: { id: 'power-out', signal: 'power' as const, direction: 'out' as const, position: [0.72, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
  rotationIn: { id: 'rotation-in', signal: 'rotation' as const, direction: 'in' as const, position: [-0.72, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  rotationOut: { id: 'rotation-out', signal: 'rotation' as const, direction: 'out' as const, position: [0.72, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
};

export const MODULES: Record<ModuleType, ModuleDefinition> = {
  battery: {
    type: 'battery', name: 'Pin', icon: '🔋', category: 'energy',
    description: 'Nguồn năng lượng điện của hệ thống.',
    science: 'Pin biến năng lượng hóa học thành điện năng.', size: [1.25, 0.72, 0.82],
    ports: [LR.powerOut], behavior: { kind: 'source' },
  },
  switch: {
    type: 'switch', name: 'Công tắc', icon: '⏻', category: 'control',
    description: 'Cho phép hoặc ngắt dòng điện.',
    science: 'Mạch kín cho dòng điện chạy; mạch hở thì không.', size: [1.2, 0.68, 0.8],
    ports: [LR.powerIn, LR.powerOut], behavior: { kind: 'switch' },
  },
  motor: {
    type: 'motor', name: 'Mô tơ', icon: '⚙️', category: 'motion',
    description: 'Biến điện năng thành chuyển động quay.',
    science: 'Từ trường trong mô tơ tạo mô-men làm trục quay.', size: [1.35, 0.82, 0.86],
    ports: [LR.powerIn, { ...LR.rotationOut, position: [0.82, 0, 0] }], behavior: { kind: 'motor', rpm: 120 },
  },
  shaft: {
    type: 'shaft', name: 'Trục', icon: '━', category: 'motion',
    description: 'Truyền chuyển động quay sang bộ phận khác.',
    science: 'Trục truyền mô-men xoắn dọc theo tâm quay.', size: [1.55, 0.34, 0.34],
    ports: [{ ...LR.rotationIn, position: [-0.82, 0, 0] }, { ...LR.rotationOut, position: [0.82, 0, 0] }], behavior: { kind: 'pass-rotation' },
  },
  'gear-small': {
    type: 'gear-small', name: 'Bánh răng nhỏ', icon: '⚙', category: 'motion',
    description: 'Tăng tốc độ quay khi truyền theo mô hình bài học.',
    science: 'Tỉ số số răng quyết định tỉ số tốc độ và mô-men.', size: [1.25, 0.72, 1.25],
    ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'gear', ratio: 1.5 },
  },
  'gear-large': {
    type: 'gear-large', name: 'Bánh răng lớn', icon: '⚙', category: 'motion',
    description: 'Giảm tốc độ quay để tăng lợi thế mô-men.',
    science: 'Bánh răng lớn quay chậm hơn khi nhận truyền động từ bánh nhỏ.', size: [1.45, 0.86, 1.45],
    ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'gear', ratio: 0.67 },
  },
  wheel: {
    type: 'wheel', name: 'Bánh xe', icon: '🛞', category: 'output',
    description: 'Biến chuyển động quay thành khả năng lăn.',
    science: 'Ma sát giữa bánh và mặt đất tạo lực kéo.', size: [0.72, 1.35, 1.35],
    ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  fan: {
    type: 'fan', name: 'Cánh quạt', icon: '🌀', category: 'output',
    description: 'Dùng chuyển động quay để đẩy không khí.',
    science: 'Cánh nghiêng tạo chênh lệch áp suất và dòng khí.', size: [0.58, 1.55, 1.55],
    ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  drill: {
    type: 'drill', name: 'Đầu khoan', icon: '🔩', category: 'output',
    description: 'Nhận chuyển động quay để khoan.',
    science: 'Mũi xoắn chuyển mô-men quay thành tác dụng cắt.', size: [1.45, 0.52, 0.52],
    ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  lamp: {
    type: 'lamp', name: 'Đèn', icon: '💡', category: 'output',
    description: 'Phát sáng khi nhận điện.',
    science: 'Điện năng được biến đổi thành ánh sáng và nhiệt.', size: [1.05, 1.2, 1.05],
    ports: [LR.powerIn], behavior: { kind: 'power-output' },
  },
  sensor: {
    type: 'sensor', name: 'Cảm biến', icon: '👁', category: 'control',
    description: 'Mô-đun quan sát môi trường, dành cho bài robot nâng cao.',
    science: 'Cảm biến biến đại lượng vật lý thành tín hiệu.', size: [1.05, 0.72, 0.78],
    ports: [LR.powerIn], behavior: { kind: 'sensor' },
  },
  chassis: {
    type: 'chassis', name: 'Khung máy', icon: '▰', category: 'structure',
    description: 'Nền cơ khí để bố trí các bộ phận.',
    science: 'Kết cấu chịu tải và giữ hình học của máy.', size: [2.8, 0.3, 1.9],
    ports: [], behavior: { kind: 'structure' },
  },
};

export const PALETTE: ModuleType[] = [
  'battery', 'switch', 'motor', 'shaft', 'gear-small', 'gear-large',
  'wheel', 'fan', 'drill', 'lamp', 'sensor', 'chassis',
];
