import './styles/app.css';
import { ConnectionGraph, normalizeConnection } from './core/connectionGraph';
import { CAR_PALETTE, CONTROL_TYPES, MODULES, ROAD_PALETTE, ROAD_TYPES } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import type { ModuleInstance, ModuleType, Vector3Tuple } from './core/types';
import { vehicleCanTravel } from './core/vehicleRules';
import { Workbench, type SnapPose } from './three/workbench';

type PaletteMode = 'car' | 'road';

const STORAGE_KEY = 'little-engineer-car-lab-v4';
const CAR_REQUIRED = 12;
const CAR_YAW_OFFSET = -Math.PI / 2;

const UNIQUE_CAR = new Set<ModuleType>([
  'car-base','battery','switch','motor','gearbox','differential','front-axle','drive-axle',
]);

const LOCAL_SLOTS: Record<string, Vector3Tuple> = {
  battery:[.62,.37,.42],
  switch:[.62,.37,-.40],
  motor:[-.12,.34,.42],
  gearbox:[-.12,.34,-.40],
  differential:[-.88,.28,0],
  'front-axle':[1.08,-.05,0],
  'drive-axle':[-1.15,-.05,0],
  'wheel-fl':[1.08,-.30,.98],
  'wheel-fr':[1.08,-.30,-.98],
  'wheel-rl':[-1.15,-.30,.98],
  'wheel-rr':[-1.15,-.30,-.98],
};

const WHEEL_SLOTS = ['wheel-fl','wheel-fr','wheel-rl','wheel-rr'] as const;
const FUNCTION_LINKS: Array<[string,string,string,string]> = [
  ['battery','power-out','switch','power-in'],
  ['switch','power-out','motor','power-in'],
  ['motor','rotation-out','gearbox','rotation-in'],
  ['gearbox','rotation-out','differential','rotation-in'],
  ['differential','rotation-out','drive-axle','rotation-in'],
  ['drive-axle','vehicle-out','car-base','vehicle-in'],
  ['car-base','front-out','front-axle','rotation-in'],
];

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<canvas id="world"></canvas>
<header class="topbar">
  <div class="brand"><span class="brand-icon">🚗</span><div><b>Ô tô Kỹ sư 3D</b><small>Tự ráp xe · tự ghép đường · xe tuân thủ tín hiệu</small></div></div>
  <div class="mode-actions">
    <button id="buildBtn" class="primary active">🔧 Lắp</button>
    <button id="runBtn" class="run" disabled>▶ Chạy</button>
    <button id="undoBtn" class="icon">↶</button><button id="redoBtn" class="icon">↷</button>
    <button id="resetBtn" class="icon danger-soft">↺</button>
  </div>
</header>

<aside class="build-progress panel">
  <div class="progress-head"><div><small>XE ĐÃ RÁP</small><b id="progressText">0 / 12</b></div><span id="readyBadge">Chưa sẵn sàng</span></div>
  <div id="stepList" class="step-list"></div>
  <div id="coach" class="coach">Bé có thể lấy bất kỳ linh kiện hoặc đoạn đường nào để bắt đầu.</div>
</aside>

<aside id="selectionPanel" class="selection-panel panel hidden">
  <div class="selection-title"><span id="selectedIcon">⚙️</span><div><b id="selectedName">Mô-đun</b><small id="selectedState"></small></div></div>
  <div id="gestureHint" class="gesture-hint"></div>
  <div id="moduleActions" class="module-actions"></div>
</aside>

<nav class="camera-bar panel">
  <button id="cameraIso" class="active">◩ Chéo</button><button id="cameraTop">▦ Trên</button><button id="focusAll">⌗ Toàn cảnh</button>
</nav>

<section class="palette panel">
  <div class="palette-title">
    <div><b id="paletteTitle">Linh kiện ô tô</b><small id="paletteHelp">Chạm để lấy ra; kéo gần đúng vị trí để tự hút khớp.</small></div>
    <div class="palette-tabs"><button id="carTab" class="active">🚗 Xe</button><button id="roadTab">🛣️ Đường & tín hiệu</button></div>
  </div>
  <div id="parts" class="parts"></div>
</section>
<div id="toast" class="toast hidden"></div>
`;

const canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const runBtn=document.querySelector<HTMLButtonElement>('#runBtn')!;
const buildBtn=document.querySelector<HTMLButtonElement>('#buildBtn')!;
const undoBtn=document.querySelector<HTMLButtonElement>('#undoBtn')!;
const redoBtn=document.querySelector<HTMLButtonElement>('#redoBtn')!;
const parts=document.querySelector<HTMLDivElement>('#parts')!;
const progressText=document.querySelector<HTMLElement>('#progressText')!;
const readyBadge=document.querySelector<HTMLElement>('#readyBadge')!;
const coach=document.querySelector<HTMLElement>('#coach')!;
const selectionPanel=document.querySelector<HTMLElement>('#selectionPanel')!;
const selectedIcon=document.querySelector<HTMLElement>('#selectedIcon')!;
const selectedName=document.querySelector<HTMLElement>('#selectedName')!;
const selectedState=document.querySelector<HTMLElement>('#selectedState')!;
const gestureHint=document.querySelector<HTMLElement>('#gestureHint')!;
const moduleActions=document.querySelector<HTMLDivElement>('#moduleActions')!;
const paletteTitle=document.querySelector<HTMLElement>('#paletteTitle')!;
const paletteHelp=document.querySelector<HTMLElement>('#paletteHelp')!;
const carTab=document.querySelector<HTMLButtonElement>('#carTab')!;
const roadTab=document.querySelector<HTMLButtonElement>('#roadTab')!;
const toast=document.querySelector<HTMLElement>('#toast')!;

const graph=new ConnectionGraph();
const simulator=new SimulationEngine(graph);
let mode:'build'|'run'='build';
let paletteMode:PaletteMode='car';
let toastTimer=0;
let history:string[]=[];
let historyIndex=-1;
let spawnIndex=0;
let restoring=false;

function showToast(message:string){
  toast.textContent=message; toast.classList.remove('hidden'); clearTimeout(toastTimer);
  toastTimer=window.setTimeout(()=>toast.classList.add('hidden'),1700);
}

function rotateY(v:Vector3Tuple,yaw:number):Vector3Tuple{
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return [v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];
}
function add(a:Vector3Tuple,b:Vector3Tuple):Vector3Tuple{return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function distXZ(a:Vector3Tuple,b:Vector3Tuple){return Math.hypot(a[0]-b[0],a[2]-b[2]);}
function modulesOf(type:ModuleType){return [...graph.modules.values()].filter(m=>m.type===type);}
function first(type:ModuleType){return modulesOf(type)[0];}
function bySlot(slot:string){return [...graph.modules.values()].find(m=>m.slotKey===slot);}

function isRoad(module:ModuleInstance|undefined){return Boolean(module&&ROAD_TYPES.has(module.type));}
function isControl(module:ModuleInstance|undefined){return Boolean(module&&CONTROL_TYPES.has(module.type));}
function isCarPart(module:ModuleInstance|undefined){
  return Boolean(module&&!isRoad(module)&&!isControl(module));
}
function hasConnections(id:string){return graph.incoming(id).length+graph.outgoing(id).length>0;}
function isAttached(module:ModuleInstance|undefined){
  if(!module) return false;
  if(isRoad(module)) return hasConnections(module.id);
  return Boolean(module.slotKey);
}

function nearestRoad(position:Vector3Tuple,max=3.0){
  let best:ModuleInstance|null=null,bestD=max;
  for(const module of graph.modules.values()){
    if(!ROAD_TYPES.has(module.type)) continue;
    const d=distXZ(position,module.position);
    if(d<bestD){best=module;bestD=d;}
  }
  return best;
}

function roadForwardYaw(road:ModuleInstance){
  if(road.type==='road-curve') return road.rotationY-Math.PI/4;
  return road.rotationY+CAR_YAW_OFFSET;
}

function chassisPose(raw:Vector3Tuple):SnapPose|null{
  const road=nearestRoad(raw,2.25);
  if(!road) return null;
  return {position:[road.position[0],.65,road.position[2]],rotationY:roadForwardYaw(road),label:'mặt đường'};
}

function slotPose(slotKey:string):SnapPose|null{
  const chassis=first('car-base');
  if(!chassis||!chassis.slotKey?.startsWith('road:')) return null;
  const local=LOCAL_SLOTS[slotKey]; if(!local) return null;
  const offset=rotateY(local,chassis.rotationY);
  return {
    position:add(chassis.position,offset),
    rotationY:chassis.rotationY,
    label:slotKey,
  };
}

function freeWheelSlot(raw:Vector3Tuple,id:string){
  let best:{key:string;pose:SnapPose;d:number}|null=null;
  for(const key of WHEEL_SLOTS){
    const occupant=bySlot('car:'+key);
    if(occupant&&occupant.id!==id) continue;
    const pose=slotPose(key); if(!pose) continue;
    const d=distXZ(raw,pose.position);
    if(!best||d<best.d) best={key,pose,d};
  }
  return best;
}

function carPartSnapPose(module:ModuleInstance,raw:Vector3Tuple):SnapPose|null{
  if(module.type==='car-base') return chassisPose(raw);
  if(module.type==='wheel'){
    const best=freeWheelSlot(raw,module.id);
    return best&&best.d<1.05?best.pose:null;
  }
  const pose=slotPose(module.type);
  return pose&&distXZ(raw,pose.position)<1.05?pose:null;
}

function roadsidePose(raw:Vector3Tuple):SnapPose|null{
  const road=nearestRoad(raw,2.7); if(!road) return null;
  const candidates:Vector3Tuple[]=[[1.25,.65,0],[-1.25,.65,0],[0,.65,1.25],[0,.65,-1.25]];
  let best:SnapPose|null=null,bestD=Infinity;
  for(const local of candidates){
    const p=add(road.position,rotateY(local,road.rotationY));
    const d=distXZ(raw,p);
    if(d<bestD){bestD=d;best={position:p,rotationY:road.rotationY,label:'lề đường'};}
  }
  return bestD<1.4?best:null;
}

function getSnapPose(id:string,raw:Vector3Tuple):SnapPose|null{
  const module=graph.modules.get(id); if(!module) return null;
  if(ROAD_TYPES.has(module.type)){
    const preview=graph.previewSnapPose(id,1.35);
    return preview?{position:preview.position,rotationY:preview.rotationY,label:'đầu đường'}:null;
  }
  if(CONTROL_TYPES.has(module.type)) return roadsidePose(raw);
  return carPartSnapPose(module,raw);
}

function assignSlotAfterDrop(module:ModuleInstance,snapped:boolean){
  if(!snapped){module.slotKey=undefined;return;}
  if(module.type==='car-base'){
    const road=nearestRoad(module.position,1.0); module.slotKey=road?'road:'+road.id:undefined; return;
  }
  if(module.type==='wheel'){
    const best=freeWheelSlot(module.position,module.id);
    module.slotKey=best?'car:'+best.key:undefined; return;
  }
  if(UNIQUE_CAR.has(module.type)){
    module.slotKey='car:'+module.type; return;
  }
  if(CONTROL_TYPES.has(module.type)){
    const road=nearestRoad(module.position,2.0); module.slotKey=road?'roadside:'+road.id:undefined;
  }
}

function isCarInstalled(module:ModuleInstance|undefined){
  if(!module||!isCarPart(module)) return false;
  if(module.type==='car-base'){
    if(!module.slotKey?.startsWith('road:')) return false;
    const road=graph.modules.get(module.slotKey.slice(5));
    return Boolean(road&&ROAD_TYPES.has(road.type)&&distXZ(module.position,road.position)<.18);
  }
  if(!module.slotKey?.startsWith('car:')) return false;
  const key=module.slotKey.slice(4);
  const pose=slotPose(key);
  return Boolean(pose&&distXZ(module.position,pose.position)<.13);
}

function installedCarCount(){
  let n=0;
  for(const type of ['car-base','battery','switch','motor','gearbox','differential','front-axle','drive-axle'] as ModuleType[]){
    const m=first(type); if(isCarInstalled(m)) n++;
  }
  n+=modulesOf('wheel').filter(m=>isCarInstalled(m)).length;
  return n;
}

function connectPair(from:ModuleInstance|undefined,fromPortId:string,to:ModuleInstance|undefined,toPortId:string,id:string){
  if(!from||!to||!isCarInstalled(from)||!isCarInstalled(to)) return;
  const exists=[...graph.connections.values()].some(c=>c.fromModuleId===from.id&&c.toModuleId===to.id&&c.fromPortId===fromPortId&&c.toPortId===toPortId);
  if(exists) return;
  const fp=MODULES[from.type].ports.find(p=>p.id===fromPortId);
  const tp=MODULES[to.type].ports.find(p=>p.id===toPortId);
  if(!fp||!tp) return;
  const normalized=normalizeConnection(from,fp,to,tp); if(!normalized) return;
  graph.connect({id,...normalized});
}

function ensureFunctionalLinks(){
  for(const [fromType,fromPort,toType,toPort] of FUNCTION_LINKS){
    connectPair(first(fromType as ModuleType),fromPort,first(toType as ModuleType),toPort,'car:'+fromType+'>'+toType);
  }
  connectPair(first('front-axle'),'wheel-left',bySlot('car:wheel-fl'),'rotation-in','car:front-left');
  connectPair(first('front-axle'),'wheel-right',bySlot('car:wheel-fr'),'rotation-in','car:front-right');
  connectPair(first('drive-axle'),'wheel-left',bySlot('car:wheel-rl'),'rotation-in','car:rear-left');
  connectPair(first('drive-axle'),'wheel-right',bySlot('car:wheel-rr'),'rotation-in','car:rear-right');
}

function status(){
  ensureFunctionalLinks();
  const state=simulator.evaluate();
  const car=first('car-base');
  const count=installedCarCount();
  const wheels=modulesOf('wheel').filter(m=>isCarInstalled(m));
  const connected=Boolean(graph.findPathByTypes(['battery','switch','motor','gearbox','differential','drive-axle','car-base','front-axle']));
  const wheelDrive=wheels.length===4&&wheels.every(w=>state.rpm.has(w.id));
  const roadReady=Boolean(car&&vehicleCanTravel(graph,car.id,state.rpm).ready);
  const switchOn=first('switch')?.switchOn!==false;
  return {state,car,count,connected,wheelDrive,roadReady,switchOn,ready:count===CAR_REQUIRED&&connected&&wheelDrive&&roadReady&&switchOn};
}

function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(graph.serialize()));}
function recordHistory(){
  const s=JSON.stringify(graph.serialize()); if(s===history[historyIndex]) return;
  history=history.slice(0,historyIndex+1); history.push(s); if(history.length>40) history.shift();
  historyIndex=history.length-1; syncHistory();
}
function syncHistory(){undoBtn.disabled=historyIndex<=0||mode==='run';redoBtn.disabled=historyIndex>=history.length-1||mode==='run';}
function restoreHistory(index:number){
  if(index<0||index>=history.length)return;
  restoring=true; graph.restore(JSON.parse(history[index])); workbench.rebuildFromGraph(); restoring=false;
  historyIndex=index; save(); refresh(); workbench.focusAll(); syncHistory();
}

function load(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)graph.restore(JSON.parse(raw));}catch{localStorage.removeItem(STORAGE_KEY);}
}

const workbench=new Workbench(canvas,graph,{
  canEdit:()=>mode==='build',
  canMove:id=>Boolean(graph.modules.get(id)),
  requiresHoldToMove:id=>isAttached(graph.modules.get(id)),
  getSnapPose,
  onHoldReady:id=>{const m=graph.modules.get(id);if(m)showToast('Giữ đủ rồi — kéo '+MODULES[m.type].name+' để tháo.');},
  onDrop:(id,snapped)=>{
    const m=graph.modules.get(id);if(!m)return;
    if(ROAD_TYPES.has(m.type)&&snapped){
      graph.snapModule(id);
    }
    assignSlotAfterDrop(m,snapped);
    ensureFunctionalLinks();
    showToast(snapped?'🧲 Đã khớp đúng vị trí.':'Mô-đun đang rời.');
  },
  onDoubleTap:id=>{
    const m=graph.modules.get(id); if(!m)return;
    if(m.type==='switch'){workbench.toggleSwitch();showToast(m.switchOn===false?'Công tắc tắt':'Công tắc bật');}
    if(m.type==='traffic-light'){
      toggleTrafficLight(m.id);
    }
  },
  onSelect:renderSelection,
  onGraphChanged:()=>{
    ensureFunctionalLinks();
    if(!restoring)recordHistory();
    save();refresh();
    if(mode==='run')applySimulation();
  },
});

function staging(type:ModuleType):Vector3Tuple{
  const col=spawnIndex%5,row=Math.floor(spawnIndex/5)%3; spawnIndex++;
  if(ROAD_TYPES.has(type)) return [3.8+col*1.15,.65,-5.5+row*1.25];
  if(CONTROL_TYPES.has(type)) return [4.0+col*.95,.65,-2.0+row*1.0];
  return [-6.2+col*1.2,.65,-5.7+row*1.2];
}

function spawn(type:ModuleType){
  if(mode==='run'){showToast('Dừng xe trước khi sửa.');return;}
  if(UNIQUE_CAR.has(type)){
    const existing=first(type);if(existing){workbench.selectById(existing.id);workbench.focusSelected();return;}
  }
  if(type==='wheel'&&modulesOf('wheel').length>=4){
    const loose=modulesOf('wheel').find(w=>!w.slotKey)||modulesOf('wheel')[0];
    if(loose){workbench.selectById(loose.id);workbench.focusSelected();} return;
  }
  const instance:ModuleInstance={
    id:type+'-'+crypto.randomUUID().slice(0,8),type,position:staging(type),rotationY:0,
    switchOn:type==='switch'?true:type==='traffic-light'?false:undefined,
  };
  workbench.addInstance(instance);
  showToast('Đã lấy '+MODULES[type].name+'. Kéo bằng tay để lắp.');
}

function rotateSelected(){
  const id=workbench.selectedId;if(!id)return;
  const m=graph.modules.get(id);if(!m||isAttached(m)){showToast('Muốn xoay, giữ rồi kéo mô-đun ra trước.');return;}
  m.rotationY=(m.rotationY+Math.PI/2)%(Math.PI*2);
  workbench.rebuildFromGraph();workbench.selectById(id);recordHistory();save();refresh();
}

function removeSelected(){
  const id=workbench.selectedId;if(!id)return;
  const m=graph.modules.get(id);if(!m)return;
  graph.removeModule(id);workbench.rebuildFromGraph();recordHistory();save();refresh();
}

function toggleTrafficLight(id:string){
  const m=graph.modules.get(id);if(!m||m.type!=='traffic-light')return;
  m.switchOn=m.switchOn===false;
  const selected=id;
  workbench.rebuildFromGraph();workbench.selectById(selected);recordHistory();save();refresh();
  showToast(m.switchOn===false?'🔴 Đèn đỏ — xe sẽ dừng.':'🟢 Đèn xanh — xe được đi.');
}

function renderPalette(){
  parts.innerHTML='';
  const list=paletteMode==='car'?CAR_PALETTE:ROAD_PALETTE;
  paletteTitle.textContent=paletteMode==='car'?'Linh kiện ô tô':'Đường & tín hiệu';
  paletteHelp.textContent=paletteMode==='car'
    ?'Khung không có bánh/trục. Bánh xe là 4 mô-đun rời; chọn linh kiện theo bất kỳ thứ tự.'
    :'Ghép thẳng, góc cua, ngã tư theo ý bé; thêm đèn và biển báo nếu muốn.';
  carTab.classList.toggle('active',paletteMode==='car');roadTab.classList.toggle('active',paletteMode==='road');

  for(const type of list){
    const button=document.createElement('button');button.className='part';
    let badge='+',small=MODULES[type].description;
    if(type==='wheel'){const count=modulesOf('wheel').length;badge=count+'/4';small='Bốn bánh rời';}
    else if(UNIQUE_CAR.has(type)){const m=first(type);badge=m?.slotKey?'✓':m?'•':'+';small=m?.slotKey?'Đã lắp':m?'Đang ở bàn':MODULES[type].description;}
    else if(ROAD_TYPES.has(type)||CONTROL_TYPES.has(type)){badge='+';}
    button.innerHTML=`<span class="step-no">${badge}</span><span class="part-icon">${MODULES[type].icon}</span><b>${MODULES[type].name}</b><small>${small}</small>`;
    button.disabled=mode==='run';button.onclick=()=>spawn(type);parts.appendChild(button);
  }
}

function renderSteps(){
  const items=[
    ['Khung',Boolean(first('car-base')?.slotKey)],
    ['Điện',Boolean(first('battery')?.slotKey&&first('switch')?.slotKey&&first('motor')?.slotKey)],
    ['Truyền',Boolean(first('gearbox')?.slotKey&&first('differential')?.slotKey)],
    ['2 trục',Boolean(first('front-axle')?.slotKey&&first('drive-axle')?.slotKey)],
    ['4 bánh',modulesOf('wheel').filter(w=>w.slotKey?.startsWith('car:wheel-')).length===4],
    ['Đường',[...graph.modules.values()].some(m=>ROAD_TYPES.has(m.type))],
  ];
  document.querySelector('#stepList')!.innerHTML=items.map(([name,done])=>`<div class="progress-step ${done?'done':''}"><span>${done?'✓':'○'}</span><b>${name}</b></div>`).join('');
}

function renderCoach(){
  const s=status();progressText.textContent=s.count+' / '+CAR_REQUIRED;
  if(s.ready){readyBadge.textContent=mode==='run'?'Đang chạy':'Sẵn sàng';readyBadge.className='ready';coach.textContent=mode==='run'?'🚗 Xe đang chạy và sẽ dừng/giảm tốc theo tín hiệu trên đường.':'✅ Xe đã đủ khung, 2 trục, 4 bánh và truyền động. Bấm Chạy.';return;}
  readyBadge.textContent='Chưa sẵn sàng';readyBadge.className='';
  if(![...graph.modules.values()].some(m=>ROAD_TYPES.has(m.type))){coach.textContent='Hãy lấy Đường thẳng, Góc cua hoặc Ngã tư rồi kéo các đầu đường gần nhau để tự ghép.';return;}
  if(!first('car-base')?.slotKey){coach.textContent='Khung xe là khung trần. Kéo khung lên đường; sau đó lắp 2 trục, 4 bánh và các bộ truyền.';return;}
  if(s.count<CAR_REQUIRED){coach.textContent='Xe còn thiếu bộ phận. Bé có thể chọn bất kỳ linh kiện nào; kéo gần ô lắp trên khung để tự hút.';return;}
  if(!s.switchOn){coach.textContent='Công tắc đang tắt. Chạm 2 lần Công tắc hoặc dùng nút Bật.';return;}
  coach.textContent='Kiểm tra các khớp truyền động và đường đã nối.';
}

function renderSelection(id:string|null){
  if(!id){selectionPanel.classList.add('hidden');return;}
  const m=graph.modules.get(id);if(!m){selectionPanel.classList.add('hidden');return;}
  selectionPanel.classList.remove('hidden');selectedIcon.textContent=MODULES[m.type].icon;selectedName.textContent=MODULES[m.type].name;
  const attached=isAttached(m);const state=simulator.evaluate();
  const detail=[attached?'Đã ghép':'Đang rời'];
  if(state.rpm.has(id))detail.push(Math.round(Math.abs(state.rpm.get(id)!))+' rpm');
  selectedState.textContent=detail.join(' · ');
  gestureHint.textContent=attached
    ?'🔒 Chạm chỉ để chọn. Muốn tháo: giữ khoảng 0,5 giây rồi mới kéo.'
    :'☝️ Kéo trực tiếp. Khi tới gần khớp phù hợp, mô-đun sẽ tự căn và hút vào.';

  const actions:string[]=[];
  if(m.type==='switch')actions.push(`<button id="toggleSwitch" class="primary">${m.switchOn===false?'⏻ Bật':'⏻ Tắt'}</button>`);
  if(m.type==='traffic-light')actions.push(`<button id="toggleLight" class="primary">${m.switchOn===false?'🟢 Chuyển xanh':'🔴 Chuyển đỏ'}</button>`);
  if((ROAD_TYPES.has(m.type)||CONTROL_TYPES.has(m.type))&&!attached)actions.push('<button id="rotatePart">↻ Xoay 90°</button>');
  actions.push('<button id="focusPart">◎ Nhìn gần</button>');
  actions.push('<button id="deletePart" class="danger">🗑 Cất</button>');
  moduleActions.innerHTML=actions.join('');

  document.querySelector<HTMLButtonElement>('#toggleSwitch')?.addEventListener('click',()=>workbench.toggleSwitch());
  document.querySelector<HTMLButtonElement>('#toggleLight')?.addEventListener('click',()=>toggleTrafficLight(id));
  document.querySelector<HTMLButtonElement>('#rotatePart')?.addEventListener('click',rotateSelected);
  document.querySelector<HTMLButtonElement>('#focusPart')?.addEventListener('click',()=>workbench.focusSelected());
  document.querySelector<HTMLButtonElement>('#deletePart')?.addEventListener('click',removeSelected);
}

function refresh(){renderPalette();renderSteps();renderCoach();renderSelection(workbench.selectedId);const s=status();runBtn.disabled=mode==='build'&&!s.ready;runBtn.textContent=mode==='run'?'■ Dừng':'▶ Chạy';buildBtn.classList.toggle('active',mode==='build');runBtn.classList.toggle('active',mode==='run');syncHistory();}
function applySimulation(){const s=simulator.evaluate();workbench.setSimulation(true,s.rpm,s.active);renderCoach();renderSelection(workbench.selectedId);}
function setMode(next:'build'|'run'){if(next==='run'){if(!status().ready){showToast('Xe chưa đủ 2 trục, 4 bánh, truyền động hoặc đường.');return;}mode='run';applySimulation();workbench.focusAll();}else{mode='build';workbench.setSimulation(false,new Map(),new Set());}refresh();}

carTab.onclick=()=>{paletteMode='car';renderPalette();};
roadTab.onclick=()=>{paletteMode='road';renderPalette();};
buildBtn.onclick=()=>setMode('build');runBtn.onclick=()=>setMode(mode==='run'?'build':'run');
undoBtn.onclick=()=>restoreHistory(historyIndex-1);redoBtn.onclick=()=>restoreHistory(historyIndex+1);
document.querySelector<HTMLButtonElement>('#resetBtn')!.onclick=()=>{setMode('build');graph.restore({version:1,modules:[],connections:[]});workbench.rebuildFromGraph();history=[];historyIndex=-1;recordHistory();save();refresh();showToast('Đã làm sạch bàn lắp.');};
document.querySelector<HTMLButtonElement>('#cameraIso')!.onclick=()=>workbench.setCamera('iso');
document.querySelector<HTMLButtonElement>('#cameraTop')!.onclick=()=>workbench.setCamera('top');
document.querySelector<HTMLButtonElement>('#focusAll')!.onclick=()=>workbench.focusAll();

load();workbench.rebuildFromGraph();recordHistory();refresh();workbench.focusAll();

if(new URLSearchParams(location.search).has('qa')){
  (window as any).__CAR_LAB__={
    snapshot(){const s=status();return{modules:[...graph.modules.values()],connections:[...graph.connections.values()],ready:s.ready,count:s.count,rpm:Object.fromEntries(s.state.rpm),carId:s.car?.id??null};},
    rendered(id:string){return workbench.renderedTransform(id);},
    screen(id:string){return workbench.screenPointForModule(id);},
    screenWorld(position:Vector3Tuple){return workbench.screenPointForWorld(position);},
    snapPose(id:string,position:Vector3Tuple){return getSnapPose(id,position);},
    spawn(type:ModuleType){spawn(type);return [...graph.modules.values()].filter(m=>m.type===type).at(-1)?.id??null;},
    forceRoad(type:ModuleType,position:Vector3Tuple,rotationY=0){
      const m:ModuleInstance={id:type+'-qa-'+crypto.randomUUID().slice(0,6),type,position,rotationY,switchOn:type==='traffic-light'?false:undefined};
      graph.addModule(m);workbench.rebuildFromGraph();recordHistory();refresh();return m.id;
    },
    forceSlot(id:string,slotKey:string){
      const m=graph.modules.get(id);if(!m)return false;
      let pose:SnapPose|null=null;
      if(slotKey==='road'){pose=chassisPose(m.position)??chassisPose(first('road-straight')?.position??[0,.65,0]);m.slotKey=first('road-straight')?'road:'+first('road-straight')!.id:undefined;}
      else{pose=slotPose(slotKey);m.slotKey='car:'+slotKey;}
      if(!pose)return false;m.position=[...pose.position];m.rotationY=pose.rotationY;ensureFunctionalLinks();workbench.rebuildFromGraph();refresh();return true;
    },
    setLight(id:string,green:boolean){const m=graph.modules.get(id);if(!m||m.type!=='traffic-light')return false;m.switchOn=green;workbench.rebuildFromGraph();refresh();return true;},
  };
}

if('serviceWorker'in navigator&&!new URLSearchParams(location.search).has('qa')&&(location.protocol==='https:'||location.hostname==='localhost')){
  addEventListener('load',async()=>{try{const registration=await navigator.serviceWorker.register('./sw.js?v=20260930-car4',{scope:'./',updateViaCache:'none'});await registration.update();}catch{}});
}
