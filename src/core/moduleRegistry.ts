import type { ModuleDefinition, ModuleType } from './types';

const LR = {
  powerIn: { id: 'power-in', signal: 'power' as const, direction: 'in' as const, position: [-0.72, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  powerOut: { id: 'power-out', signal: 'power' as const, direction: 'out' as const, position: [0.72, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
  rotationIn: { id: 'rotation-in', signal: 'rotation' as const, direction: 'in' as const, position: [-0.72, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  rotationOut: { id: 'rotation-out', signal: 'rotation' as const, direction: 'out' as const, position: [0.72, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
  fluidIn: { id: 'fluid-in', signal: 'fluid' as const, direction: 'in' as const, position: [0, 0, -0.72] as [number, number, number], axis: [0, 0, -1] as [number, number, number] },
  fluidOut: { id: 'fluid-out', signal: 'fluid' as const, direction: 'out' as const, position: [0, 0, 0.72] as [number, number, number], axis: [0, 0, 1] as [number, number, number] },
};

const STRUCT_X = [
  { id: 'structure-left', signal: 'structural' as const, direction: 'bi' as const, position: [-.76, 0, 0] as [number, number, number], axis: [-1, 0, 0] as [number, number, number] },
  { id: 'structure-right', signal: 'structural' as const, direction: 'bi' as const, position: [.76, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] },
];
const STRUCT_Z = [
  { id: 'structure-back', signal: 'structural' as const, direction: 'bi' as const, position: [0, 0, -.76] as [number, number, number], axis: [0, 0, -1] as [number, number, number] },
  { id: 'structure-front', signal: 'structural' as const, direction: 'bi' as const, position: [0, 0, .76] as [number, number, number], axis: [0, 0, 1] as [number, number, number] },
];
const STRUCT_4 = [...STRUCT_X, ...STRUCT_Z];

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

  axle: {
    type: 'axle', name: 'Cầu truyền động', icon: '↔️', category: 'motion',
    description: 'Truyền mô-men tới cụm bánh xe.', science: 'Cầu xe truyền chuyển động quay từ hộp số tới bánh chủ động.',
    size: [1.55, .38, .52], ports: [{ ...LR.rotationIn, position: [-.82, 0, 0] }, { ...LR.rotationOut, position: [.82, 0, 0] }], behavior: { kind: 'pass-rotation' },
  },
  differential: {
    type: 'differential', name: 'Vi sai', icon: '⚙️', category: 'motion',
    description: 'Chia mô-men cho bánh xe khi xe đổi hướng.', science: 'Bộ vi sai cho hai bánh cùng cầu quay với tốc độ khác nhau khi vào cua.',
    size: [1.25, .72, .9], ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'transmission', ratio: .9 },
  },
  gearbox: {
    type: 'gearbox', name: 'Hộp số', icon: '🎚️', category: 'motion',
    description: 'Giảm tốc và tăng mô-men cho phương tiện.', science: 'Tỉ số truyền đổi tốc độ quay để phù hợp tải và lực kéo.',
    size: [1.25, .82, .9], ports: [LR.rotationIn, LR.rotationOut], behavior: { kind: 'transmission', ratio: .65 },
  },

  'car-base': {
    type: 'car-base', name: 'Khung ô tô', icon: '🚗', category: 'vehicle',
    description: 'Khung xe điện có bốn bánh chủ động.', science: 'Mô-men từ hệ truyền động làm bánh xe quay và tạo lực kéo tại mặt đường.',
    size: [2.65, .58, 1.45], ports: [{ ...LR.rotationIn, position: [-1.42, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: 1.0 },
  },
  'motorcycle-base': {
    type: 'motorcycle-base', name: 'Khung xe máy', icon: '🏍️', category: 'vehicle',
    description: 'Khung xe hai bánh nhận truyền động từ mô tơ.', science: 'Hai bánh thẳng hàng cần quay và giữ cân bằng để xe chuyển động.',
    size: [2.45, 1.0, .72], ports: [{ ...LR.rotationIn, position: [-1.32, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: 1.15 },
  },
  'train-engine': {
    type: 'train-engine', name: 'Đầu tàu điện', icon: '🚂', category: 'vehicle',
    description: 'Đầu tàu nhận mô-men và quay các bánh trên ray.', science: 'Bánh tàu có vành gờ để được dẫn hướng bởi đường ray.',
    size: [2.6, 1.35, 1.18], ports: [{ ...LR.rotationIn, position: [-1.42, 0, 0] }, { ...STRUCT_X[1], position: [1.42, 0, 0], id: 'coupler-front' }], behavior: { kind: 'vehicle', vehicleSpeed: .72 },
  },
  'train-wagon': {
    type: 'train-wagon', name: 'Toa tàu', icon: '🚃', category: 'vehicle',
    description: 'Toa hàng hoặc toa khách nối sau đầu tàu.', science: 'Khớp nối cho phép các toa truyền lực kéo nhưng vẫn đổi hướng tương đối.',
    size: [2.35, 1.05, 1.15],
    ports: [
      { ...STRUCT_X[0], position: [-1.28, 0, 0], id: 'coupler-back' },
      { ...STRUCT_X[1], position: [1.28, 0, 0], id: 'coupler-front' },
    ],
    behavior: { kind: 'structure' },
  },

  'road-straight': {
    type: 'road-straight', name: 'Đường thẳng', icon: '🛣️', category: 'transport',
    description: 'Đoạn đường để xây mạng giao thông.', science: 'Mặt đường phẳng tạo bề mặt lăn ổn định cho bánh xe.',
    size: [1.6, .12, 3.0], ports: STRUCT_Z.map(p => ({ ...p, position: [0, 0, p.position[2] * 1.9] })), behavior: { kind: 'structure' },
  },
  'road-curve': {
    type: 'road-curve', name: 'Đường cong', icon: '↪️', category: 'transport',
    description: 'Đoạn đường đổi hướng 90 độ.', science: 'Bán kính cong càng lớn thì phương tiện đổi hướng càng êm.',
    size: [2.4, .12, 2.4],
    ports: [
      { ...STRUCT_Z[0], position: [0, 0, -1.28], id: 'road-in' },
      { ...STRUCT_X[1], position: [1.28, 0, 0], id: 'road-out' },
    ],
    behavior: { kind: 'structure' },
  },
  'rail-straight': {
    type: 'rail-straight', name: 'Ray thẳng', icon: '🛤️', category: 'transport',
    description: 'Đoạn đường sắt thẳng.', science: 'Hai thanh ray song song dẫn hướng và chịu tải bánh tàu.',
    size: [1.45, .2, 3.0], ports: STRUCT_Z.map(p => ({ ...p, position: [0, 0, p.position[2] * 1.9] })), behavior: { kind: 'structure' },
  },
  'rail-curve': {
    type: 'rail-curve', name: 'Ray cong', icon: '🚉', category: 'transport',
    description: 'Đoạn ray đổi hướng 90 độ.', science: 'Ray cong dẫn hướng đoàn tàu theo quỹ đạo mà không cần đánh lái.',
    size: [2.5, .2, 2.5],
    ports: [
      { ...STRUCT_Z[0], position: [0, 0, -1.3], id: 'rail-in' },
      { ...STRUCT_X[1], position: [1.3, 0, 0], id: 'rail-out' },
    ],
    behavior: { kind: 'structure' },
  },
  'rail-crossing': {
    type: 'rail-crossing', name: 'Giao cắt đường ray', icon: '✚', category: 'transport',
    description: 'Nút giao hai tuyến ray.', science: 'Nút giao phải giữ khe dẫn hướng liên tục cho vành bánh tàu.',
    size: [2.3, .2, 2.3], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.45, 0, p.position[2] * 1.45] })), behavior: { kind: 'structure' },
  },
  bridge: {
    type: 'bridge', name: 'Cầu', icon: '🌉', category: 'transport',
    description: 'Cầu cho đường hoặc ray vượt sông.', science: 'Dầm cầu truyền tải trọng xuống trụ và nền.',
    size: [2.0, .65, 3.0], ports: STRUCT_Z.map(p => ({ ...p, position: [0, 0, p.position[2] * 1.9] })), behavior: { kind: 'structure' },
  },

  foundation: {
    type: 'foundation', name: 'Nền nhà', icon: '⬜', category: 'building',
    description: 'Mặt nền để ghép tường và cột.', science: 'Móng và nền phân bố tải công trình xuống đất.',
    size: [2.2, .24, 2.2], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.45, 0, p.position[2] * 1.45] })), behavior: { kind: 'structure' },
  },
  wall: {
    type: 'wall', name: 'Tường', icon: '🧱', category: 'building',
    description: 'Mảng tường xây nhà.', science: 'Tường bao che không gian và có thể tham gia chịu lực.',
    size: [2.0, 1.65, .28], ports: STRUCT_X.map(p => ({ ...p, position: [p.position[0] * 1.4, 0, 0] })), behavior: { kind: 'structure' },
  },
  'door-wall': {
    type: 'door-wall', name: 'Tường cửa đi', icon: '🚪', category: 'building',
    description: 'Tường có cửa ra vào.', science: 'Ô cửa cần dầm phía trên để truyền tải quanh khoảng mở.',
    size: [2.0, 1.65, .28], ports: STRUCT_X.map(p => ({ ...p, position: [p.position[0] * 1.4, 0, 0] })), behavior: { kind: 'structure' },
  },
  'window-wall': {
    type: 'window-wall', name: 'Tường cửa sổ', icon: '🪟', category: 'building',
    description: 'Tường có cửa lấy sáng.', science: 'Cửa sổ đưa ánh sáng và thông gió vào không gian.',
    size: [2.0, 1.65, .28], ports: STRUCT_X.map(p => ({ ...p, position: [p.position[0] * 1.4, 0, 0] })), behavior: { kind: 'structure' },
  },
  roof: {
    type: 'roof', name: 'Mái nhà', icon: '🏠', category: 'building',
    description: 'Mô-đun mái che.', science: 'Mái dốc dẫn nước mưa xuống nhanh và che nắng cho công trình.',
    size: [2.3, .8, 2.3], ports: [], behavior: { kind: 'structure' },
  },
  column: {
    type: 'column', name: 'Cột', icon: '▮', category: 'building',
    description: 'Cột chịu lực cho công trình.', science: 'Cột truyền tải trọng thẳng đứng từ dầm và mái xuống móng.',
    size: [.48, 1.9, .48], ports: [], behavior: { kind: 'structure' },
  },
  fence: {
    type: 'fence', name: 'Hàng rào', icon: '🪵', category: 'building',
    description: 'Hàng rào phân chia khu vực.', science: 'Các cọc và thanh ngang tạo kết cấu nhẹ nhưng ổn định.',
    size: [2.0, 1.0, .18], ports: STRUCT_X.map(p => ({ ...p, position: [p.position[0] * 1.4, 0, 0] })), behavior: { kind: 'structure' },
  },

  'grass-tile': {
    type: 'grass-tile', name: 'Thảm cỏ', icon: '🌱', category: 'nature',
    description: 'Mảnh địa hình phủ cỏ.', science: 'Thảm thực vật giúp giữ đất và hấp thụ nước mưa.',
    size: [2.4, .12, 2.4], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.55, 0, p.position[2] * 1.55] })), behavior: { kind: 'structure' },
  },
  'soil-tile': {
    type: 'soil-tile', name: 'Đất', icon: '🟫', category: 'nature',
    description: 'Mảnh nền đất để tạo địa hình.', science: 'Đất là hỗn hợp khoáng, hữu cơ, nước và không khí.',
    size: [2.4, .12, 2.4], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.55, 0, p.position[2] * 1.55] })), behavior: { kind: 'structure' },
  },
  'water-tile': {
    type: 'water-tile', name: 'Hồ nước', icon: '🌊', category: 'nature',
    description: 'Mảnh mặt nước để tạo hồ.', science: 'Mặt nước phản xạ ánh sáng và tạo môi trường sống thủy sinh.',
    size: [2.4, .08, 2.4], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.55, 0, p.position[2] * 1.55] })), behavior: { kind: 'structure' },
  },
  'river-tile': {
    type: 'river-tile', name: 'Đoạn sông', icon: '🏞️', category: 'nature',
    description: 'Mảnh sông để ghép thành dòng nước dài.', science: 'Sông dẫn nước từ nơi cao về nơi thấp theo địa hình.',
    size: [2.4, .08, 2.4], ports: STRUCT_Z.map(p => ({ ...p, position: [0, 0, p.position[2] * 1.55] })), behavior: { kind: 'structure' },
  },
  hill: {
    type: 'hill', name: 'Đồi', icon: '⛰️', category: 'nature',
    description: 'Mô-đun đồi thấp.', science: 'Đồi là dạng địa hình nhô cao với sườn thoải hơn núi.',
    size: [2.1, 1.15, 2.1], ports: [], behavior: { kind: 'structure' },
  },
  mountain: {
    type: 'mountain', name: 'Núi', icon: '🏔️', category: 'nature',
    description: 'Mô-đun núi cao.', science: 'Núi hình thành do vận động kiến tạo, núi lửa hoặc xói mòn lâu dài.',
    size: [2.4, 2.4, 2.4], ports: [], behavior: { kind: 'structure' },
  },
  tree: {
    type: 'tree', name: 'Cây', icon: '🌳', category: 'nature',
    description: 'Cây xanh cho cảnh quan.', science: 'Cây quang hợp, hấp thụ CO₂ và giải phóng oxy.',
    size: [1.0, 2.0, 1.0], ports: [], behavior: { kind: 'structure' },
  },
  cloud: {
    type: 'cloud', name: 'Mây', icon: '☁️', category: 'nature',
    description: 'Mây trang trí bầu trời.', science: 'Mây gồm các giọt nước hoặc tinh thể băng rất nhỏ lơ lửng trong khí quyển.',
    size: [1.8, .9, 1.1], ports: [], behavior: { kind: 'structure' },
  },
  rock: {
    type: 'rock', name: 'Tảng đá', icon: '🪨', category: 'nature',
    description: 'Đá để tạo địa hình.', science: 'Đá là vật liệu tự nhiên cấu tạo từ một hay nhiều khoáng vật.',
    size: [1.1, .8, 1.0], ports: [], behavior: { kind: 'structure' },
  },

  airplane: {
    type: 'airplane', name: 'Máy bay cánh quạt', icon: '✈️', category: 'vehicle',
    description: 'Máy bay nhỏ nhận truyền động để quay cánh quạt và chạy đà.', science: 'Cánh tạo lực nâng khi không khí đi qua; cánh quạt tạo lực đẩy.',
    size: [2.9, .85, 2.55], ports: [{ ...LR.rotationIn, position: [-1.55, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: 1.45 },
  },
  helicopter: {
    type: 'helicopter', name: 'Trực thăng', icon: '🚁', category: 'vehicle',
    description: 'Trực thăng có rô-to chính và rô-to đuôi.', science: 'Rô-to chính tạo lực nâng; rô-to đuôi cân bằng mô-men quay thân.',
    size: [2.8, 1.25, 1.3], ports: [{ ...LR.rotationIn, position: [-1.48, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: 1.15 },
  },
  boat: {
    type: 'boat', name: 'Tàu thủy', icon: '🚤', category: 'vehicle',
    description: 'Thuyền máy chạy bằng chân vịt.', science: 'Chân vịt đẩy nước về sau, tạo phản lực đưa thuyền tiến về trước.',
    size: [2.8, 1.05, 1.35], ports: [{ ...LR.rotationIn, position: [-1.5, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: .92 },
  },
  crane: {
    type: 'crane', name: 'Cần cẩu', icon: '🏗️', category: 'vehicle',
    description: 'Xe cần cẩu có cần nâng và móc tải.', science: 'Tời cuốn dây và hệ cần tạo lợi thế cơ học để nâng tải.',
    size: [2.55, 1.4, 1.35], ports: [{ ...LR.rotationIn, position: [-1.38, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: .55 },
  },
  excavator: {
    type: 'excavator', name: 'Máy xúc', icon: '🚜', category: 'vehicle',
    description: 'Máy xúc có cần, tay gầu và gầu xúc.', science: 'Cơ cấu tay đòn khuếch đại lực để đào và nâng đất.',
    size: [2.65, 1.35, 1.4], ports: [{ ...LR.rotationIn, position: [-1.42, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: .5 },
  },
  bulldozer: {
    type: 'bulldozer', name: 'Máy ủi', icon: '🚜', category: 'vehicle',
    description: 'Máy xích có lưỡi ủi phía trước.', science: 'Lưỡi ủi truyền lực kéo lớn vào đất để đẩy và san phẳng.',
    size: [2.7, 1.2, 1.45], ports: [{ ...LR.rotationIn, position: [-1.45, 0, 0] }], behavior: { kind: 'vehicle', vehicleSpeed: .48 },
  },
  firetruck: {
    type: 'firetruck', name: 'Xe cứu hỏa', icon: '🚒', category: 'vehicle',
    description: 'Xe cứu hỏa vừa chạy vừa có hệ thống bơm nước.', science: 'Động cơ truyền lực cho bánh xe; bơm tăng áp để đẩy nước qua vòi phun.',
    size: [2.9, 1.35, 1.45],
    ports: [
      { ...LR.rotationIn, position: [-1.55, 0, 0] },
      { ...LR.fluidIn, position: [0, 0, -.82] },
      { ...LR.fluidOut, position: [0, 0, .82] },
    ],
    behavior: { kind: 'vehicle', vehicleSpeed: 1.0 },
  },

  runway: {
    type: 'runway', name: 'Đường băng', icon: '🛫', category: 'transport',
    description: 'Đường băng cho máy bay chạy đà và hạ cánh.', science: 'Máy bay cần đủ vận tốc tương đối với không khí để cánh tạo lực nâng.',
    size: [2.6, .1, 4.2], ports: STRUCT_Z.map(p => ({ ...p, position: [0, 0, p.position[2] * 2.7] })), behavior: { kind: 'structure' },
  },
  helipad: {
    type: 'helipad', name: 'Bãi đáp trực thăng', icon: '🅷', category: 'transport',
    description: 'Bãi đáp dành cho trực thăng.', science: 'Bãi đáp phẳng và thoáng giúp rô-to hoạt động an toàn.',
    size: [2.8, .1, 2.8], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.75, 0, p.position[2] * 1.75] })), behavior: { kind: 'structure' },
  },
  harbor: {
    type: 'harbor', name: 'Bến cảng', icon: '⚓', category: 'transport',
    description: 'Khu vực đón tàu thuyền bên mặt nước.', science: 'Cảng tạo vùng neo đậu và kết nối vận tải thủy với đất liền.',
    size: [2.8, .35, 2.2], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.7, 0, p.position[2] * 1.35] })), behavior: { kind: 'structure' },
  },
  dock: {
    type: 'dock', name: 'Cầu tàu', icon: '🪵', category: 'transport',
    description: 'Cầu nhỏ vươn ra mặt nước để lên xuống tàu.', science: 'Cầu tàu truyền tải trọng người và hàng xuống cọc hoặc phao.',
    size: [1.4, .28, 3.0], ports: STRUCT_Z.map(p => ({ ...p, position: [0, 0, p.position[2] * 1.9] })), behavior: { kind: 'structure' },
  },

  'floor-slab': {
    type: 'floor-slab', name: 'Sàn tầng', icon: '▱', category: 'building',
    description: 'Tấm sàn để xây nhà nhiều tầng.', science: 'Sàn truyền tải trọng sử dụng sang dầm, tường hoặc cột.',
    size: [2.2, .18, 2.2], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.45, 0, p.position[2] * 1.45] })), behavior: { kind: 'structure' },
  },
  stairs: {
    type: 'stairs', name: 'Cầu thang', icon: '🪜', category: 'building',
    description: 'Cầu thang nối các cao độ trong nhà.', science: 'Bậc thang chia chênh cao thành nhiều bước nhỏ để di chuyển an toàn.',
    size: [1.2, 1.25, 2.0], ports: [], behavior: { kind: 'structure' },
  },
  balcony: {
    type: 'balcony', name: 'Ban công', icon: '🏠', category: 'building',
    description: 'Sàn nhô ra ngoài mặt nhà.', science: 'Ban công làm việc như một phần kết cấu công-xôn hoặc được đỡ bằng cột.',
    size: [1.7, .35, 1.1], ports: STRUCT_X, behavior: { kind: 'structure' },
  },
  door: {
    type: 'door', name: 'Cửa mở', icon: '🚪', category: 'building',
    description: 'Cánh cửa độc lập để bố trí trong công trình.', science: 'Bản lề tạo trục quay cho cánh cửa đóng mở.',
    size: [.95, 1.65, .12], ports: [], behavior: { kind: 'structure' },
  },
  chair: {
    type: 'chair', name: 'Ghế', icon: '🪑', category: 'building',
    description: 'Ghế nội thất.', science: 'Bốn chân hoặc khung ghế phân bố tải người xuống sàn.',
    size: [.75, 1.0, .75], ports: [], behavior: { kind: 'structure' },
  },
  table: {
    type: 'table', name: 'Bàn', icon: '🟫', category: 'building',
    description: 'Bàn nội thất.', science: 'Mặt bàn chịu tải và truyền lực xuống chân bàn.',
    size: [1.35, .8, .85], ports: [], behavior: { kind: 'structure' },
  },
  sofa: {
    type: 'sofa', name: 'Sofa', icon: '🛋️', category: 'building',
    description: 'Ghế sofa cho phòng khách.', science: 'Khung và đệm phân bố áp lực để ngồi thoải mái.',
    size: [1.75, .85, .85], ports: [], behavior: { kind: 'structure' },
  },
  bed: {
    type: 'bed', name: 'Giường', icon: '🛏️', category: 'building',
    description: 'Giường ngủ.', science: 'Khung giường đỡ đệm và phân bố tải xuống sàn.',
    size: [1.5, .55, 2.05], ports: [], behavior: { kind: 'structure' },
  },
  kitchen: {
    type: 'kitchen', name: 'Bếp', icon: '🍳', category: 'building',
    description: 'Cụm tủ bếp và mặt bếp.', science: 'Khu bếp tổ chức các vùng lưu trữ, chuẩn bị và nấu ăn theo quy trình.',
    size: [1.7, 1.0, .65], ports: [], behavior: { kind: 'structure' },
  },
  bookshelf: {
    type: 'bookshelf', name: 'Tủ sách', icon: '📚', category: 'building',
    description: 'Tủ nhiều tầng để sách và đồ vật.', science: 'Các đợt ngang truyền tải xuống hai vách đứng của tủ.',
    size: [1.3, 1.65, .42], ports: [], behavior: { kind: 'structure' },
  },
  streetlight: {
    type: 'streetlight', name: 'Đèn đường', icon: '💡', category: 'building',
    description: 'Cột đèn chỉ sáng khi được cấp điện.', science: 'Đèn đặt cao giúp phân bố ánh sáng trên diện tích rộng hơn; mạch điện phải kín mới phát sáng.',
    size: [.55, 2.2, .55], ports: [{ ...LR.powerIn, position: [-.42, -.72, 0] }], behavior: { kind: 'power-output' },
  },
  'traffic-light': {
    type: 'traffic-light', name: 'Đèn giao thông', icon: '🚦', category: 'building',
    description: 'Đèn tín hiệu tự đổi đỏ – vàng – xanh khi có điện.', science: 'Bộ điều khiển phân chia quyền đi theo thời gian để giảm xung đột giao thông.',
    size: [.65, 2.0, .65], ports: [{ ...LR.powerIn, position: [-.42, -.62, 0] }], behavior: { kind: 'power-output' },
  },
  hydrant: {
    type: 'hydrant', name: 'Trụ cứu hỏa', icon: '🧯', category: 'building',
    description: 'Điểm lấy nước chữa cháy trong thành phố.', science: 'Trụ cứu hỏa nối với mạng cấp nước áp lực để lấy lưu lượng lớn.',
    size: [.65, .9, .65], ports: [{ ...LR.fluidOut, position: [0, .15, .45] }], behavior: { kind: 'fluid-source' },
  },

  'sea-tile': {
    type: 'sea-tile', name: 'Biển', icon: '🌊', category: 'nature',
    description: 'Mảnh mặt biển để tạo vùng nước lớn.', science: 'Sóng mặt biển hình thành do gió truyền năng lượng cho mặt nước.',
    size: [3.0, .08, 3.0], ports: STRUCT_4.map(p => ({ ...p, position: [p.position[0] * 1.9, 0, p.position[2] * 1.9] })), behavior: { kind: 'structure' },
  },
  island: {
    type: 'island', name: 'Đảo', icon: '🏝️', category: 'nature',
    description: 'Mảnh đảo nổi giữa vùng nước.', science: 'Đảo là phần đất được nước bao quanh.',
    size: [2.4, .65, 2.4], ports: [], behavior: { kind: 'structure' },
  },
  waterfall: {
    type: 'waterfall', name: 'Thác nước', icon: '💦', category: 'nature',
    description: 'Dòng nước đổ từ cao xuống thấp.', science: 'Thế năng trọng trường chuyển thành động năng khi nước rơi.',
    size: [1.7, 2.0, 1.1], ports: [], behavior: { kind: 'structure' },
  },
  cave: {
    type: 'cave', name: 'Hang động', icon: '🕳️', category: 'nature',
    description: 'Hang đá để tạo địa hình khám phá.', science: 'Hang động thường hình thành do nước hòa tan hoặc xói mòn đá trong thời gian dài.',
    size: [2.3, 1.65, 1.8], ports: [], behavior: { kind: 'structure' },
  },
  bush: {
    type: 'bush', name: 'Bụi cây', icon: '🌿', category: 'nature',
    description: 'Bụi cây thấp cho cảnh quan.', science: 'Thực vật thấp giúp che phủ đất và tạo nơi sống cho sinh vật nhỏ.',
    size: [1.0, .75, 1.0], ports: [], behavior: { kind: 'structure' },
  },
  flower: {
    type: 'flower', name: 'Khóm hoa', icon: '🌼', category: 'nature',
    description: 'Hoa trang trí công viên và sân vườn.', science: 'Hoa giúp cây sinh sản và thu hút côn trùng thụ phấn.',
    size: [.75, .65, .75], ports: [], behavior: { kind: 'structure' },
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
  'motor', 'shaft', 'bearing', 'gear-small', 'gear-large', 'belt-drive', 'cam', 'axle', 'differential', 'gearbox',
  'wheel', 'fan', 'propeller', 'drill', 'piston', 'conveyor', 'winch', 'mixer', 'lamp', 'led', 'buzzer',
  'water-tank', 'pipe', 'valve', 'pump', 'nozzle',
  'car-base', 'motorcycle-base', 'train-engine', 'train-wagon', 'airplane', 'helicopter', 'boat', 'crane', 'excavator', 'bulldozer', 'firetruck',
  'road-straight', 'road-curve', 'rail-straight', 'rail-curve', 'rail-crossing', 'bridge', 'runway', 'helipad', 'harbor', 'dock',
  'foundation', 'floor-slab', 'wall', 'door-wall', 'window-wall', 'roof', 'stairs', 'balcony', 'door', 'column', 'fence', 'chassis',
  'chair', 'table', 'sofa', 'bed', 'kitchen', 'bookshelf', 'streetlight', 'traffic-light', 'hydrant',
  'grass-tile', 'soil-tile', 'water-tile', 'river-tile', 'sea-tile', 'island', 'waterfall', 'cave', 'hill', 'mountain', 'tree', 'bush', 'flower', 'cloud', 'rock',
]
