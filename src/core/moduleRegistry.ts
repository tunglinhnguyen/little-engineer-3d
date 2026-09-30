import type { ModuleDefinition, ModulePort, ModuleType, Vector3Tuple } from './types';
import { CURVE_RADIUS, HALF_TRACK, ROAD_HALF_LENGTH, ROAD_WIDTH, WHEEL_RADIUS, LOCAL_SLOTS } from './layout';

const port=(id:string,signal:ModulePort['signal'],direction:ModulePort['direction'],position:Vector3Tuple,axis:Vector3Tuple,mate:string):ModulePort=>({id,signal,direction,position,axis,mate});
const mount=(id:string,position:Vector3Tuple=[0,0,0],mate='chassis')=>port(id,'structural','bi',position,[0,-1,0],mate);
const shaft=(id:string,direction:'in'|'out',position:Vector3Tuple,axis:Vector3Tuple=[-1,0,0])=>port(id,'rotation',direction,position,axis,'shaft');
const road=(id:string,position:Vector3Tuple,axis:Vector3Tuple)=>port(id,'structural','bi',position,axis,'road');
const R=ROAD_HALF_LENGTH,C=CURVE_RADIUS;

export const MODULES:Record<ModuleType,ModuleDefinition>={
 battery:{type:'battery',name:'Pin',icon:'🔋',description:'Hai cực + và − cấp điện cho mạch kín.',size:[.58,.46,.42],ports:[port('power-out','power','out',[.14,.31,0],[0,1,0],'supply'),port('return-in','power','in',[-.14,.31,0],[0,1,0],'return'),mount('mount-in')],behavior:{kind:'source',voltage:6}},
 switch:{type:'switch',name:'Công tắc',icon:'⏻',description:'Bật để đóng mạch, tắt để ngắt điện.',size:[.40,.40,.38],ports:[port('power-in','power','in',[.215,.03,0],[1,0,0],'supply'),port('power-out','power','out',[-.215,.03,0],[-1,0,0],'supply'),mount('mount-in')],behavior:{kind:'switch'}},
 motor:{type:'motor',name:'Mô-tơ',icon:'⚙',description:'Mạch kín làm trục mô-tơ quay.',size:[.72,.40,.42],ports:[port('power-in','power','in',[.28,.12,-.18],[0,0,-1],'supply'),port('return-out','power','out',[.28,.12,.18],[0,0,1],'return'),shaft('rotation-out','out',[-.43,0,0]),mount('mount-in')],behavior:{kind:'motor',rpm:120,torque:.35}},
 gearbox:{type:'gearbox',name:'Hộp số',icon:'⚙',description:'Bánh răng 12/24 răng: quay chậm một nửa.',size:[.48,.60,.52],ports:[shaft('rotation-in','in',[.23,.02,0],[1,0,0]),shaft('rotation-out','out',[-.23,-.22,0]),mount('mount-in')],behavior:{kind:'transmission',ratio:-.5,efficiency:.92}},
 differential:{type:'differential',name:'Vi sai',icon:'⚙',description:'Truyền lực ra hai bánh sau; hai bánh quay khác tốc độ khi cua.',size:[.58,.57,.66],ports:[shaft('rotation-in','in',[.29,-.07,0],[1,0,0]),shaft('rotation-out','out',[0,-.24,0],[0,0,1]),mount('mount-in')],behavior:{kind:'transmission',ratio:-1/3,efficiency:.95}},
 'front-axle':{type:'front-axle',name:'Trục trước',icon:'↔',description:'Mang hai bánh trước và cơ cấu lái, không nhận lực từ mô-tơ.',size:[.46,.24,2.24],ports:[mount('mount-in'),mount('wheel-left',[0,0,HALF_TRACK],'bearing'),mount('wheel-right',[0,0,-HALF_TRACK],'bearing')],behavior:{kind:'passive'}},
 'drive-axle':{type:'drive-axle',name:'Trục sau',icon:'↔',description:'Hai bán trục nhận lực từ vi sai, dẫn động bánh sau.',size:[.38,.20,2.24],ports:[mount('mount-in'),shaft('rotation-in','in',[0,0,0],[0,0,-1]),shaft('wheel-left','out',[0,0,HALF_TRACK],[0,0,1]),shaft('wheel-right','out',[0,0,-HALF_TRACK],[0,0,-1])],behavior:{kind:'pass-rotation',efficiency:.98}},
 wheel:{type:'wheel',name:'Bánh xe',icon:'◉',description:'Lắp vào đầu trục; bánh lăn trên mặt đất, không nằm sẵn trong khung.',size:[WHEEL_RADIUS*2,WHEEL_RADIUS*2,.24],ports:[shaft('rotation-in','in',[0,0,0],[0,0,1]),mount('mount-in',[0,0,0],'bearing')],behavior:{kind:'wheel'}},
 'car-base':{type:'car-base',name:'Khung xe',icon:'▱',description:'Khung trần để bé tự lắp các bộ phận.',size:[3.2,.36,1.82],ports:[...['battery','switch','motor','gearbox','differential','front-axle','drive-axle'].map(name=>({...mount(name+'-mount',LOCAL_SLOTS[name]),axis:[0,1,0] as Vector3Tuple}))],behavior:{kind:'vehicle',vehicleSpeed:1}},
 'road-straight':{type:'road-straight',name:'Đường thẳng',icon:'║',description:'Kéo hai đầu đường sát nhau để ghép.',size:[ROAD_WIDTH,.12,R*2],ports:[road('south',[0,0,-R],[0,0,-1]),road('north',[0,0,R],[0,0,1])],behavior:{kind:'track'}},
 'road-curve':{type:'road-curve',name:'Góc cua',icon:'↪',description:'Cua tròn 90°, cùng một đường cong cho mặt đường và xe.',size:[C+ROAD_WIDTH/2,.12,C+ROAD_WIDTH/2],ports:[road('south',[0,0,-C],[0,0,-1]),road('east',[C,0,0],[1,0,0])],behavior:{kind:'track'}},
 'road-intersection':{type:'road-intersection',name:'Ngã tư',icon:'╬',description:'Xe ưu tiên nhánh thẳng đã ghép, rồi mới rẽ.',size:[R*2,.12,R*2],ports:[road('south',[0,0,-R],[0,0,-1]),road('north',[0,0,R],[0,0,1]),road('west',[-R,0,0],[-1,0,0]),road('east',[R,0,0],[1,0,0])],behavior:{kind:'track'}},
 'traffic-light':{type:'traffic-light',name:'Đèn tín hiệu',icon:'🚦',description:'Gắn bên đường. Đỏ dừng trước đèn, xanh đi tiếp.',size:[.55,1.85,.45],ports:[],behavior:{kind:'traffic-light'}},
 'stop-sign':{type:'stop-sign',name:'Biển STOP',icon:'🛑',description:'Gắn bên đường. Dừng 1,5 giây trước biển.',size:[.58,1.62,.22],ports:[],behavior:{kind:'road-sign',rule:'stop'}},
 'speed-sign':{type:'speed-sign',name:'Biển 30',icon:'③⓪',description:'Mô phỏng giảm tốc trên đoạn có biển.',size:[.58,1.62,.22],ports:[],behavior:{kind:'road-sign',rule:'speed-30'}},
};
export const CAR_PALETTE:ModuleType[]=['car-base','battery','switch','motor','gearbox','differential','front-axle','drive-axle','wheel'];
export const ROAD_PALETTE:ModuleType[]=['road-straight','road-curve','road-intersection','traffic-light','stop-sign','speed-sign'];
export const ROAD_TYPES=new Set<ModuleType>(['road-straight','road-curve','road-intersection']);
export const CONTROL_TYPES=new Set<ModuleType>(['traffic-light','stop-sign','speed-sign']);
