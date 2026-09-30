import type { ModuleDefinition, ModulePort, ModuleType } from './types';

const powerIn: ModulePort = {
  id: 'power-in', signal: 'power', direction: 'in',
  position: [-.72, 0, 0], axis: [-1, 0, 0],
};
const powerOut: ModulePort = {
  id: 'power-out', signal: 'power', direction: 'out',
  position: [.72, 0, 0], axis: [1, 0, 0],
};
const rotationIn: ModulePort = {
  id: 'rotation-in', signal: 'rotation', direction: 'in',
  position: [-.72, 0, 0], axis: [-1, 0, 0],
};
const rotationOut: ModulePort = {
  id: 'rotation-out', signal: 'rotation', direction: 'out',
  position: [.72, 0, 0], axis: [1, 0, 0],
};

export const MODULES: Record<ModuleType, ModuleDefinition> = {
  battery: {
    type: 'battery',
    name: 'Pin',
    icon: '🔋',
    description: 'Nguồn điện 6 V cho ô tô.',
    size: [1.25, .72, .82],
    ports: [{ ...powerOut }],
    behavior: { kind: 'source', voltage: 6 },
  },
  switch: {
    type: 'switch',
    name: 'Công tắc',
    icon: '⏻',
    description: 'Đóng hoặc ngắt mạch điện.',
    size: [1.2, .68, .8],
    ports: [{ ...powerIn }, { ...powerOut }],
    behavior: { kind: 'switch' },
  },
  motor: {
    type: 'motor',
    name: 'Mô tơ',
    icon: '⚙️',
    description: 'Biến điện năng thành chuyển động quay.',
    size: [1.35, .82, .86],
    ports: [
      { ...powerIn },
      { ...rotationOut, position: [.82, 0, 0] },
    ],
    behavior: { kind: 'motor', rpm: 120, torque: .35 },
  },
  gearbox: {
    type: 'gearbox',
    name: 'Hộp số',
    icon: '🎚️',
    description: 'Giảm tốc để tăng lực kéo.',
    size: [1.25, .82, .9],
    ports: [{ ...rotationIn }, { ...rotationOut }],
    behavior: { kind: 'transmission', ratio: .65, efficiency: .92 },
  },
  differential: {
    type: 'differential',
    name: 'Vi sai',
    icon: '⚙️',
    description: 'Truyền mô-men tới cụm bánh xe.',
    size: [1.25, .72, .9],
    ports: [{ ...rotationIn }, { ...rotationOut }],
    behavior: { kind: 'transmission', ratio: .9, efficiency: .95 },
  },
  'car-base': {
    type: 'car-base',
    name: 'Khung xe + 4 bánh',
    icon: '🚗',
    description: 'Khung ô tô nhận mô-men từ bộ vi sai.',
    size: [2.65, .58, 1.45],
    ports: [{ ...rotationIn, position: [-1.42, 0, 0] }],
    behavior: { kind: 'vehicle', vehicleSpeed: 1.0 },
  },
  'road-straight': {
    type: 'road-straight',
    name: 'Đường thử',
    icon: '🛣️',
    description: 'Đường chạy cố định của ô tô.',
    size: [1.6, .12, 3.0],
    ports: [
      {
        id: 'structure-back', signal: 'structural', direction: 'bi',
        position: [0, 0, -1.444], axis: [0, 0, -1],
      },
      {
        id: 'structure-front', signal: 'structural', direction: 'bi',
        position: [0, 0, 1.444], axis: [0, 0, 1],
      },
    ],
    behavior: { kind: 'track' },
  },
};

export const CAR_PALETTE: ModuleType[] = [
  'battery',
  'switch',
  'motor',
  'gearbox',
  'differential',
  'car-base',
];
