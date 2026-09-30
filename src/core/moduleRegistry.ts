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
const roadPort = (
  id: string,
  position: [number,number,number],
  axis: [number,number,number],
): ModulePort => ({
  id, signal:'structural', direction:'bi', position, axis,
});

export const MODULES: Record<ModuleType, ModuleDefinition> = {
  battery: {
    type:'battery', name:'Pin', icon:'🔋',
    description:'Nguồn điện 6 V cho mô tơ.',
    size:[1.25,.72,.82], ports:[{...powerOut}],
    behavior:{kind:'source',voltage:6},
  },
  switch: {
    type:'switch', name:'Công tắc', icon:'⏻',
    description:'Đóng hoặc ngắt mạch điện.',
    size:[1.2,.68,.8], ports:[{...powerIn},{...powerOut}],
    behavior:{kind:'switch'},
  },
  motor: {
    type:'motor', name:'Mô tơ', icon:'⚙️',
    description:'Biến điện năng thành chuyển động quay.',
    size:[1.35,.82,.86],
    ports:[{...powerIn},{...rotationOut,position:[.82,0,0]}],
    behavior:{kind:'motor',rpm:120,torque:.35},
  },
  gearbox: {
    type:'gearbox', name:'Hộp số', icon:'🎚️',
    description:'Giảm tốc để tăng lực kéo.',
    size:[1.25,.82,.9], ports:[{...rotationIn},{...rotationOut}],
    behavior:{kind:'transmission',ratio:.65,efficiency:.92},
  },
  differential: {
    type:'differential', name:'Vi sai', icon:'⚙️',
    description:'Chia mô-men sang trục chủ động.',
    size:[1.25,.72,.9], ports:[{...rotationIn},{...rotationOut}],
    behavior:{kind:'transmission',ratio:.9,efficiency:.95},
  },
  'front-axle': {
    type:'front-axle', name:'Trục trước', icon:'━',
    description:'Mang hai bánh trước và truyền chuyển động quay cho bánh.',
    size:[.5,.35,2.05],
    ports:[
      {...rotationIn,id:'rotation-in'},
      {...rotationOut,id:'wheel-left',position:[0,0,.95],axis:[0,0,1]},
      {...rotationOut,id:'wheel-right',position:[0,0,-.95],axis:[0,0,-1]},
    ],
    behavior:{kind:'pass-rotation',efficiency:.98},
  },
  'drive-axle': {
    type:'drive-axle', name:'Trục chủ động', icon:'━',
    description:'Nhận mô-men từ vi sai, quay hai bánh sau và truyền lực tới xe.',
    size:[.55,.38,2.05],
    ports:[
      {...rotationIn,id:'rotation-in'},
      {...rotationOut,id:'wheel-left',position:[0,0,.95],axis:[0,0,1]},
      {...rotationOut,id:'wheel-right',position:[0,0,-.95],axis:[0,0,-1]},
      {...rotationOut,id:'vehicle-out',position:[.30,0,0],axis:[1,0,0]},
    ],
    behavior:{kind:'pass-rotation',efficiency:.98},
  },
  wheel: {
    type:'wheel', name:'Bánh xe', icon:'⚫',
    description:'Bánh rời; cần lắp đủ bốn bánh lên hai trục.',
    size:[.42,.72,.72],
    ports:[{...rotationIn,position:[0,0,0]}],
    behavior:{kind:'wheel'},
  },
  'car-base': {
    type:'car-base', name:'Khung xe', icon:'🛞',
    description:'Khung xe trần, không bao gồm bánh hay trục.',
    size:[3.25,.40,1.72],
    ports:[
      {...rotationIn,id:'vehicle-in',position:[-1.48,0,0]},
      {...rotationOut,id:'front-out',position:[1.05,0,0]},
    ],
    behavior:{kind:'vehicle',vehicleSpeed:1.0},
  },
  'road-straight': {
    type:'road-straight', name:'Đường thẳng', icon:'🛣️',
    description:'Đoạn đường thẳng có hai đầu ghép.',
    size:[1.8,.12,3.0],
    ports:[
      roadPort('south',[0,0,-1.45],[0,0,-1]),
      roadPort('north',[0,0,1.45],[0,0,1]),
    ],
    behavior:{kind:'track'},
  },
  'road-curve': {
    type:'road-curve', name:'Góc cua', icon:'↪️',
    description:'Đường cong 90° để bé tạo tuyến đường uốn.',
    size:[3.0,.12,3.0],
    ports:[
      roadPort('south',[0,0,-1.45],[0,0,-1]),
      roadPort('east',[1.45,0,0],[1,0,0]),
    ],
    behavior:{kind:'track'},
  },
  'road-intersection': {
    type:'road-intersection', name:'Ngã tư', icon:'➕',
    description:'Nút giao bốn hướng.',
    size:[3.0,.12,3.0],
    ports:[
      roadPort('south',[0,0,-1.45],[0,0,-1]),
      roadPort('north',[0,0,1.45],[0,0,1]),
      roadPort('west',[-1.45,0,0],[-1,0,0]),
      roadPort('east',[1.45,0,0],[1,0,0]),
    ],
    behavior:{kind:'track'},
  },
  'traffic-light': {
    type:'traffic-light', name:'Đèn giao thông', icon:'🚦',
    description:'Đỏ: xe dừng. Xanh: xe được đi.',
    size:[.55,2.3,.55], ports:[],
    behavior:{kind:'traffic-light'},
  },
  'stop-sign': {
    type:'stop-sign', name:'Biển STOP', icon:'🛑',
    description:'Xe phải dừng lại trước biển rồi mới đi tiếp.',
    size:[.55,1.9,.55], ports:[],
    behavior:{kind:'road-sign',rule:'stop'},
  },
  'speed-sign': {
    type:'speed-sign', name:'Biển 30', icon:'③⓪',
    description:'Xe giảm tốc khi đi qua vùng giới hạn 30.',
    size:[.55,1.9,.55], ports:[],
    behavior:{kind:'road-sign',rule:'speed-30'},
  },
};

export const CAR_PALETTE: ModuleType[] = [
  'car-base','battery','switch','motor','gearbox','differential',
  'front-axle','drive-axle','wheel',
];

export const ROAD_PALETTE: ModuleType[] = [
  'road-straight','road-curve','road-intersection',
  'traffic-light','stop-sign','speed-sign',
];

export const ROAD_TYPES = new Set<ModuleType>([
  'road-straight','road-curve','road-intersection',
]);

export const CONTROL_TYPES = new Set<ModuleType>([
  'traffic-light','stop-sign','speed-sign',
]);
