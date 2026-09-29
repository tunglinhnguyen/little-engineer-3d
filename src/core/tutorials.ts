import { ConnectionGraph } from './connectionGraph';
import { MODULES } from './moduleRegistry';
import type { ModuleType, SimulationState } from './types';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  focusType?: ModuleType;
  done(graph: ConnectionGraph, state: SimulationState): boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  icon: string;
  steps: TutorialStep[];
}

const has = (graph: ConnectionGraph, type: ModuleType) => [...graph.modules.values()].some(m => m.type === type);

const path = (graph: ConnectionGraph, types: ModuleType[]) => Boolean(graph.findPathByTypes(types));

export const TUTORIALS: Tutorial[] = [
  {
    id:'first-circuit', title:'Mạch điện đầu tiên', icon:'⚡',
    steps:[
      {id:'battery',title:'Lấy nguồn',text:'Chạm Pin trong kho mô-đun.',focusType:'battery',done:g=>has(g,'battery')},
      {id:'switch',title:'Thêm công tắc',text:'Chọn Pin rồi thêm Công tắc. Hai cổng điện sẽ tự căn nếu phù hợp.',focusType:'switch',done:g=>has(g,'switch')},
      {id:'lamp',title:'Thêm đèn',text:'Chọn Công tắc rồi thêm Đèn.',focusType:'lamp',done:g=>has(g,'lamp')},
      {id:'connect',title:'Khép kín đường điện',text:'Đảm bảo Pin → Công tắc → Đèn đã nối.',done:g=>path(g,['battery','switch','lamp'])},
      {id:'run',title:'Chạy thử',text:'Bấm ▶ Chạy. Đèn phải sáng khi công tắc bật.',done:(_g,s)=>[...s.powered].some(id=>id.includes('lamp'))},
    ],
  },
  {
    id:'first-machine', title:'Máy quay đầu tiên', icon:'⚙️',
    steps:[
      {id:'motor',title:'Tạo động lực',text:'Ráp Pin → Công tắc → Mô tơ.',focusType:'motor',done:g=>path(g,['battery','switch','motor'])},
      {id:'shaft',title:'Truyền mô-men',text:'Nối Trục vào đầu ra mô tơ.',focusType:'shaft',done:g=>path(g,['motor','shaft'])},
      {id:'fan',title:'Lắp tải',text:'Nối Cánh quạt vào đầu còn lại của trục.',focusType:'fan',done:g=>path(g,['motor','shaft','fan'])},
      {id:'spin',title:'Quan sát năng lượng',text:'Bấm ▶ Chạy rồi bật chế độ Dòng năng lượng.',done:(_g,s)=>s.rpm.size>=3},
    ],
  },
  {
    id:'water', title:'Bơm nước hoạt động', icon:'💧',
    steps:[
      {id:'drive',title:'Truyền động cho bơm',text:'Ráp mô tơ và trục tới Bơm nước.',focusType:'pump',done:g=>path(g,['motor','shaft','pump'])},
      {id:'supply',title:'Nguồn nước',text:'Ráp Bình nước → Ống → Bơm.',focusType:'water-tank',done:g=>path(g,['water-tank','pipe','pump'])},
      {id:'outlet',title:'Đầu ra',text:'Nối Bơm → Vòi phun.',focusType:'nozzle',done:g=>path(g,['pump','nozzle'])},
      {id:'flow',title:'Chạy bơm',text:'Bấm ▶ Chạy. Vòi chỉ phun khi bơm vừa quay vừa có nước đầu hút.',done:(_g,s)=>s.flow.size>2},
    ],
  },
  {
    id:'road', title:'Ô tô và đường', icon:'🚗',
    steps:[
      {id:'car',title:'Lắp truyền động ô tô',text:'Ráp Pin → Công tắc → Mô tơ → Hộp số → Vi sai → Khung ô tô.',focusType:'car-base',done:g=>path(g,['battery','switch','motor','gearbox','differential','car-base'])},
      {id:'road',title:'Xây đường',text:'Ghép vài đoạn Đường thẳng và Đường cong.',focusType:'road-straight',done:g=>has(g,'road-straight')},
      {id:'place',title:'Đặt xe gần đường',text:'Kéo xe sát tuyến đường để xe bắt đầu từ điểm gần nhất.',done:(g,_s)=>{const car=[...g.modules.values()].find(m=>m.type==='car-base');const road=[...g.modules.values()].find(m=>m.type==='road-straight'||m.type==='road-curve');return Boolean(car&&road&&Math.hypot(car.position[0]-road.position[0],car.position[2]-road.position[2])<4.2)}},
      {id:'drive',title:'Chạy xe',text:'Bấm ▶ Chạy và thử 🎥 Theo vật.',done:(_g,s)=>[...s.rpm.keys()].some(id=>id.includes('car-base'))},
    ],
  },
  {
    id:'house', title:'Xây nhà nhiều tầng', icon:'🏠',
    steps:[
      {id:'foundation',title:'Đặt nền',text:'Bắt đầu bằng Nền nhà.',focusType:'foundation',done:g=>has(g,'foundation')},
      {id:'walls',title:'Dựng tường',text:'Ghép Tường, Tường cửa đi hoặc cửa sổ quanh nền.',focusType:'wall',done:g=>[...g.modules.values()].filter(m=>['wall','door-wall','window-wall'].includes(m.type)).length>=3},
      {id:'floor',title:'Thêm sàn tầng',text:'Dùng Sàn tầng; socket trên/dưới sẽ giúp ghép đúng cao độ.',focusType:'floor-slab',done:g=>has(g,'floor-slab')},
      {id:'stairs',title:'Tạo lối lên',text:'Đặt Cầu thang nối hai cao độ.',focusType:'stairs',done:g=>has(g,'stairs')},
      {id:'roof',title:'Đặt mái',text:'Đặt Mái nhà lên tầng trên.',focusType:'roof',done:g=>has(g,'roof')},
    ],
  },
];

export function tutorialProgress(tutorial: Tutorial, graph: ConnectionGraph, state: SimulationState) {
  const completed = tutorial.steps.filter(step => step.done(graph,state)).length;
  const next = tutorial.steps.find(step => !step.done(graph,state)) ?? null;
  return {
    completed,
    total:tutorial.steps.length,
    done:completed===tutorial.steps.length,
    next,
    percent:Math.round(completed/tutorial.steps.length*100),
    summary: next ? next.text : 'Hoàn thành! Con có thể thử thay đổi thiết kế để tìm lời giải khác.',
    focusName: next?.focusType ? MODULES[next.focusType].name : null,
  };
}
