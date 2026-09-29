import type { ModuleDefinition, ModuleType } from './types';

const LR = {
  powerIn: { id: 'power-in', signal: 'power' as const, direction: 'in' as const, position: [-0.72, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  powerOut: { id: 'power-out', signal: 'power' as const, direction: 'out' as const, position: [0.72, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
  rotationIn: { id: 'rotation-in', signal: 'rotation' as const, direction: 'in' as const, position: [-0.72, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  rotationOut: { id: 'rotation-out', signal: 'rotation' as const, direction: 'out' as const, position: [0.72, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
  fluidIn: { id: 'fluid-in', signal: 'fluid' as const, direction: 'in' as const, position: [0, 0, -0.72] as [number, number, number], axis: [0, 0, -1] as [number, number, number] },
  fluidOut: { id: 'fluid-out', signal: 'fluid' as const, direction: 'out' as const, position: [0, 0, 0.72] as [number, number, number], axis: [0, 0, 1] as [number, number, number] },
};

export const MODULES: Record<ModuleType, ModuleDefinition> = {
  battery: {
    type: 'battery', name: 'Pin', icon: '🔋', category: 'energy',
    description: 'Nguồn điện cơ bản cho mạch.', science: 'Pin biến năng lượng hóa học thành điện năng.',
    size: [1.25, .72, .82], ports: [LR.powerOut], behavior: { kind: 'source' },
  },
  solar: {
    type: 'solar', name: 'Pin mặt trời', icon: '☀️', category: 'energy',
    description: 'Nguồn điện từ ánh sáng.', science: 'Tế bào quang điện biến ánh sáng thành điện năng.',
    size: [1.7, .34, 1.1], ports: [LR.powerOut], behavior: { kind: 'source' },
  },
  'hand-crank': {
    type: 'hand-crank', name: 'Tay quay', icon: '🕹️', category: 'energy',
    description: 'Nguồn quay bằng sức tay.', science: 'Lực tay tạo mô-men quay trên trục.',
    size: [1.25, .9, .9], ports: [{ ...LR.rotationOut, position: [.82, 0, 0] }], behavior: { kind: 'rotation-source', rpm: 45 },
  },

  switch: {
    type: 'switch', name: 'Công tắc', icon: '⏻', category: 'control',
    description: 'Đóng hoặc ngắt mạch điện.', science: 'Mạch kín cho dòng điện đi qua; mạch hở thì dừng.',
    size: [1.2, .68, .8], ports: [LR.powerIn, LR.powerOut], behavior: { kind: 'switch' },
  },
  sensor: {
    type: 'sensor', name: 'Cảm biến', icon: '👁', category: 'control',
    description: 'Mô-đun cảm nhận môi trường.', science: 'Cảm biến biến đại lượng vật lý thành tín hiệu.',
    size: [1.05, .72, .78], ports: [LR.powerIn], behavior: { kind: 'sensor' },
  },

  motor: {
    type: 'motor', name: 'Mô tơ', icon: '⚙️', category: 'motion',
    description: 'Biến điện năng thành chuyển động quay.', science: 'Từ trường tạo mô-men làm rô-to quay.',
    size: [1.35, .82, .86], ports: [LR.powerIn, { ...LR.rotationOut, position: [.82, 0, 0] }], behavior: { kind: 'motor', rpm: 120 },
  },
  shaft: {
    type: 'shaft', name: 'Trục', icon: '━', category: 'motion',
    description: 'Truyền mô-men quay.', science: 'Trục truyền chuyển động và mô-men dọc theo tâm quay.',
    size: [1.55, .34, .34], ports: [{ ...LR.rotationIn, position: [-.82, 0, 0] }, { ...LR.rotationOut, position: [.82, 0, 0] }], behavior: { kind: 'pass-rotation' },
  },
  bearing: {
    type: 'bearing', name: 'Ổ trục', icon: '◉', category: 'motion',
    description: 'Đỡ trục và giảm ma sát.', science: 'Ổ trục giữ trục đúng tâm và giúp quay êm.',
    size: [.72, .78, .78], ports: [{ ...LR.rotationIn, position: [-.46, 0, 0] }, { ...LR.rotationOut, position: [.46, 0, 0] }], behavior: { kind: 'pass-rotation' },
  },
  'gear-small': {
    type: 'gear-small', name: 'Bánh răng 12T', icon: '⚙', category: 'motion',
    description: 'Bánh răng nhỏ 12 răng.', science: 'Hai bánh răng ăn khớp quay ngược chiều; tỉ số răng quyết định tốc độ.',
    size: [1.25, .72, 1.25], ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'gear', teeth: 12 },
  },
  'gear-large': {
    type: 'gear-large', name: 'Bánh răng 24T', icon: '⚙', category: 'motion',
    description: 'Bánh răng lớn 24 răng.', science: '12T truyền sang 24T làm bánh lớn quay bằng nửa tốc độ.',
    size: [1.45, .86, 1.45], ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'gear', teeth: 24 },
  },
  'belt-drive': {
    type: 'belt-drive', name: 'Bộ truyền đai', icon: '⛓️', category: 'motion',
    description: 'Hai puly nối bằng dây đai, giảm tốc 2:1.', science: 'Truyền đai giữ cùng chiều quay; puly lớn quay chậm hơn puly nhỏ.',
    size: [1.65, .72, 1.2], ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'transmission', ratio: .5 },
  },
  cam: {
    type: 'cam', name: 'Cam lệch tâm', icon: '◒', category: 'motion',
    description: 'Biến quay thành chuyển động tịnh tiến tuần hoàn.', science: 'Tâm lệch của cam tạo hành trình lên xuống hoặc qua lại.',
    size: [1.05, .82, 1.05], ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'pass-rotation' },
  },

  wheel: {
    type: 'wheel', name: 'Bánh xe', icon: '🛞', category: 'output',
    description: 'Biến quay thành chuyển động lăn.', science: 'Ma sát với mặt đất tạo lực kéo.',
    size: [.72, 1.35, 1.35], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  fan: {
    type: 'fan', name: 'Cánh quạt', icon: '🌀', category: 'output',
    description: 'Tạo luồng gió.', science: 'Cánh nghiêng quay quanh trục làm tăng tốc không khí.',
    size: [.58, 1.55, 1.55], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  propeller: {
    type: 'propeller', name: 'Chân vịt', icon: '✣', category: 'output',
    description: 'Tạo lực đẩy từ chuyển động quay.', science: 'Chân vịt đẩy môi trường về sau để tạo phản lực về trước.',
    size: [.62, 1.45, 1.45], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  drill: {
    type: 'drill', name: 'Mũi khoan', icon: '🔩', category: 'output',
    description: 'Quay để khoan/cắt vật liệu.', science: 'Mũi xoắn dùng mô-men quay tạo tác dụng cắt.',
    size: [1.45, .52, .52], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  piston: {
    type: 'piston', name: 'Pít-tông', icon: '↔️', category: 'output',
    description: 'Chuyển chuyển động quay thành tịnh tiến.', science: 'Cam hoặc tay quay có thể biến chuyển động quay thành hành trình qua lại.',
    size: [1.5, .72, .72], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  conveyor: {
    type: 'conveyor', name: 'Băng tải', icon: '➿', category: 'output',
    description: 'Mặt băng chuyển động để vận chuyển vật.', science: 'Trục lăn kéo dây băng tạo chuyển động tuyến tính.',
    size: [2.05, .5, 1.0], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  winch: {
    type: 'winch', name: 'Tời cuốn', icon: '🧵', category: 'output',
    description: 'Cuộn dây để kéo vật.', science: 'Tang cuốn biến mô-men quay thành lực kéo trên dây.',
    size: [1.25, .9, 1.0], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  mixer: {
    type: 'mixer', name: 'Máy khuấy', icon: '🥣', category: 'output',
    description: 'Trục khuấy quay trong cốc.', science: 'Cánh khuấy truyền động lượng vào chất lỏng.',
    size: [1.2, 1.2, 1.2], ports: [LR.rotationIn], behavior: { kind: 'rotation-output' },
  },
  lamp: {
    type: 'lamp', name: 'Đèn', icon: '💡', category: 'output',
    description: 'Phát sáng khi có điện.', science: 'Điện năng được biến đổi thành ánh sáng và nhiệt.',
    size: [1.05, 1.2, 1.05], ports: [LR.powerIn], behavior: { kind: 'power-output' },
  },
  led: {
    type: 'led', name: 'Đèn LED', icon: '🔆', category: 'output',
    description: 'Đèn bán dẫn tiết kiệm điện.', science: 'LED phát sáng khi dòng điện đi qua tiếp giáp bán dẫn.',
    size: [.78, .9, .78], ports: [LR.powerIn], behavior: { kind: 'power-output' },
  },
  buzzer: {
    type: 'buzzer', name: 'Còi điện', icon: '🔔', category: 'output',
    description: 'Phát âm khi được cấp điện.', science: 'Phần tử rung nhanh tạo ra sóng âm.',
    size: [.96, .65, .96], ports: [LR.powerIn], behavior: { kind: 'power-output' },
  },

  'water-tank': {
    type: 'water-tank', name: 'Bình nước', icon: '🪣', category: 'fluid',
    description: 'Nguồn nước cho hệ thống bơm.', science: 'Bơm không thể tạo nước; cần nguồn chất lỏng ở đầu hút.',
    size: [1.35, 1.35, 1.35], ports: [{ ...LR.fluidOut, position: [0, 0, .82] }], behavior: { kind: 'fluid-source' },
  },
  pipe: {
    type: 'pipe', name: 'Ống nước', icon: '🔵', category: 'fluid',
    description: 'Dẫn nước giữa các bộ phận.', science: 'Ống tạo đường dẫn kín để chất lỏng đi từ nơi áp suất cao sang thấp.',
    size: [.45, .45, 1.55], ports: [{ ...LR.fluidIn, position: [0, 0, -.82] }, { ...LR.fluidOut, position: [0, 0, .82] }], behavior: { kind: 'fluid-pass' },
  },
  valve: {
    type: 'valve', name: 'Van nước', icon: '🚰', category: 'fluid',
    description: 'Mở hoặc chặn dòng nước.', science: 'Van thay đổi tiết diện đường ống để cho phép hoặc ngăn dòng chảy.',
    size: [.9, .9, 1.15], ports: [LR.fluidIn, LR.fluidOut], behavior: { kind: 'fluid-valve' },
  },
  pump: {
    type: 'pump', name: 'Bơm nước', icon: '💧', category: 'fluid',
    description: 'Cần cả chuyển động quay và nguồn nước để bơm.', science: 'Cánh bơm nhận mô-men từ trục, tăng năng lượng cho nước và đẩy nước qua cửa ra.',
    size: [1.2, 1.05, 1.15],
    ports: [LR.rotationIn, { ...LR.fluidIn, position: [0, 0, -.68] }, { ...LR.fluidOut, position: [0, 0, .68] }],
    behavior: { kind: 'pump' },
  },
  nozzle: {
    type: 'nozzle', name: 'Vòi phun', icon: '🚿', category: 'fluid',
    description: 'Biến dòng nước trong ống thành tia nước.', science: 'Đầu vòi nhỏ làm vận tốc dòng chảy tăng khi nước được bơm qua.',
    size: [.75, .65, 1.15], ports: [LR.fluidIn], behavior: { kind: 'fluid-output' },
  },

  chassis: {
    type: 'chassis', name: 'Khung máy', icon: '▰', category: 'structure',
    description: 'Nền cơ khí để bố trí các bộ phận.', science: 'Kết cấu chịu tải và giữ hình học của máy.',
    size: [2.8, .3, 1.9], ports: [], behavior: { kind: 'structure' },
  },
};

export const PALETTE: ModuleType[] = [
  'battery', 'solar', 'hand-crank',
  'switch', 'sensor',
  'motor', 'shaft', 'bearing', 'gear-small', 'gear-large', 'belt-drive', 'cam',
  'wheel', 'fan', 'propeller', 'drill', 'piston', 'conveyor', 'winch', 'mixer', 'lamp', 'led', 'buzzer',
  'water-tank', 'pipe', 'valve', 'pump', 'nozzle',
  'chassis',
];
