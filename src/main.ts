import './styles/app.css';
import { ConnectionGraph } from './core/connectionGraph';
import { CAR_PART_TYPES, CONTROL_TYPES, MODULES, ROAD_PALETTE, ROAD_TYPES } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import { assemblyCount, commitPlacement, descendants, detachAssembly, first, isInstalled, isMounted, placementCandidates, previewPlacement, reconcileAssembly, restoreAssembly, slotPose } from './core/assembly';
import { CHASSIS_HEIGHT, ROAD_HALF_LENGTH } from './core/layout';
import { assemblyIssues, vehicleCanTravel, wheelsOnRoad } from './core/vehicleRules';
import type { ModuleInstance, ModuleType, Placement, Vector3Tuple, VehicleKind, MissionKind, GearMode } from './core/types';
import { Workbench } from './three/workbench';
import { moduleIcon } from './core/icons';
import { restHeight } from './three/moduleFactory';
import { newVehicle, vehicleParts, vehicleForModule, vehiclePalette, vehicleSpec, maxParts, VEHICLE_NAMES, VEHICLE_KINDS, VEHICLE_COLORS, GEAR_NAMES } from './core/vehicles';
import { cargoCapacity, cargoCarrier, vehiclePerformance, measureExperiment } from './core/experiments';
import { selectMission, chooseDestination, completeAssemblyMission, MISSION_NAMES } from './core/missions';
import { vehicleOverlap } from './core/fleet';

const STORAGE_KEY='little-engineer-workshop-v5';
const graph=new ConnectionGraph(),simulator=new SimulationEngine(graph);
let mode:'build'|'test'|'run'='build',paletteMode:'car'|'road'='car';
let panelView='guide';
let history:string[]=[],historyIndex=-1,restoring=false,toastTimer=0;

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="topbar">
 <div class="brand"><b>Little Engineer 3D</b><small>Bé tự ráp · thử cơ cấu · lái xe trên đường</small></div>
 <div class="mode-actions">
  <button id="buildBtn">Lắp xe</button><button id="testBtn" title="Thử các cơ cấu tại chỗ">Thử máy</button><button id="runBtn">Chạy xe</button>
  <button id="runAllBtn">Chạy tất cả</button><button id="stopAllBtn" class="hidden">Dừng tất cả</button>
  <button id="undoBtn" aria-label="Hoàn tác">↶</button><button id="redoBtn" aria-label="Làm lại">↷</button><button id="resetBtn">Dọn bàn</button>
 </div>
</header>
<nav class="garage-strip" aria-label="Gara nhiều xe"><div id="garageCars"></div><button id="newVehicleBtn">＋ Xe</button><div id="vehicleChooser" class="hidden"></div></nav>
<main class="work-area" id="workArea">
 <canvas id="world" aria-label="Bàn lắp ráp 3D"></canvas>
 <aside class="build-progress panel">
  <div class="progress-head"><b id="progressText">0 / 12</b><span id="readyBadge">Lắp xe</span></div>
  <div id="stepList" class="step-list"></div><div id="coach" class="coach"></div><button id="helpNext">Chỉ chỗ cần lắp</button>
  <nav class="tool-tabs"><button data-view="parts">Bên trong</button><button data-view="missions">Nhiệm vụ</button><button data-view="experiment">Thí nghiệm</button><button data-view="garage">Gara</button></nav>
  <section id="toolDrawer" class="hidden"><div class="drawer-head"><b id="drawerTitle"></b><button id="closeDrawer" aria-label="Đóng bảng">×</button></div><div id="drawerBody"></div></section>
 </aside>
 <aside id="selectionPanel" class="selection-panel panel hidden">
  <div class="selection-title"><b id="selectedName"></b><span id="selectedState"></span></div>
  <button id="closeSelection" aria-label="Bỏ chọn">×</button><p id="partDescription"></p><div id="gestureHint" class="gesture-hint"></div><div id="moduleActions" class="module-actions"></div><div id="socketTargets"></div>
 </aside>
 <nav class="camera-bar panel"><button id="cameraIso">Chéo</button><button id="cameraTop">Trên</button><button id="focusAll">Toàn cảnh</button></nav>
 <nav id="movementBar" class="movement-bar panel hidden" aria-label="Di chuyển đường"><span>Kéo đoạn đường để đặt lại</span><button id="cancelMove">Hủy</button></nav>
 <div id="flowStrip" class="flow-strip panel"></div><div id="toast" class="toast hidden" role="status"></div><div id="driveStatus" class="drive-status hidden" role="status"></div>
</main>
<section class="palette panel">
 <div class="palette-title"><div class="palette-tabs"><button id="carTab">Linh kiện</button><button id="roadTab">Đường & tín hiệu</button></div><span id="paletteHelp">Chạm chọn · Kéo cả xe · Bấm Tháo ra</span><button id="testRoad">Lấy đường thử</button></div>
 <div id="parts" class="parts"></div>
</section>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(id:string)=>el<HTMLButtonElement>(id);
const showToast=(message:string)=>{el('toast').textContent=message;el('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>el('toast').classList.add('hidden'),2200);};
function isMovementLocked(id:string){const m=graph.modules.get(id);return Boolean(m&&(CONTROL_TYPES.has(m.type)&&isMounted(graph,m)||ROAD_TYPES.has(m.type)&&(descendants(graph,id).length>1||graph.incoming(id).length||graph.outgoing(id).length)));}
function activeProfile(){return graph.activeVehicleId?graph.vehicles.get(graph.activeVehicleId):undefined;}
function ensureVehicle(){return activeProfile()??newVehicle(graph,'car');}
function state(){const sim=simulator.evaluate(),car=graph.activeVehicleId?graph.modules.get(graph.activeVehicleId):undefined;return {sim,car,count:car?assemblyCount(graph,car.id):0,travel:car?vehicleCanTravel(graph,car.id,sim.rpm):{ready:false,message:'Lấy khung xe hoặc bất kỳ linh kiện nào để bắt đầu.',route:[]}};}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(graph.serialize()));}catch{showToast('Bộ nhớ đầy. Bàn lắp vẫn hoạt động trong phiên này.');}}
function recordHistory(){const s=JSON.stringify(graph.serialize());if(s===history[historyIndex])return;history=history.slice(0,historyIndex+1);history.push(s);if(history.length>60)history.shift();historyIndex=history.length-1;}
function changed(){reconcileAssembly(graph);for(const id of graph.vehicles.keys())completeAssemblyMission(graph,id);if(!restoring)recordHistory();save();workbench.updateState(simulator.evaluate());refresh();}

const workbench=new Workbench(el<HTMLCanvasElement>('world'),graph,{
 canEdit:()=>mode==='build',
 isMovementLocked,
 getSnapPose:(id,raw)=>previewPlacement(graph,id,raw),
 onDrop:(id,pose)=>{
  const m=graph.modules.get(id);if(!m)return;
  if(ROAD_TYPES.has(m.type)){graph.disconnectModule(id);}
  if(!pose){const y=m.type==='car-base'?CHASSIS_HEIGHT:workbench.restingHeight(id);workbench.moveAssembly(id,[m.position[0],y,m.position[2]],m.rotationY);}
  commitPlacement(graph,id,pose);
  showToast(pose?'Đã khớp '+(pose.label??MODULES[m.type].name)+'.':m.type==='car-base'?'Đã đặt cả xe. Chạm chọn; kéo để di chuyển.':'Đang ở bàn. Kéo tới hình gợi ý để lắp.');
 },
 onSelect:renderSelection,
 onPlaceTarget:placeTarget,
 onDestination:pickDestination,
 onMissionsCompleted:ids=>{showToast(ids.map(id=>graph.vehicles.get(id)?.name).join(', ')+': hoàn thành nhiệm vụ!');workbench.rebuildFromGraph(workbench.selectedId);changed();},
 onGraphChanged:changed,
 onDriveUpdate:s=>{el('driveStatus').textContent=s.reason+' · '+s.speed.toFixed(2)+' đơn vị/s';},
});
function staging(type:ModuleType):Vector3Tuple{
 const center=state().car?.position??[-3,CHASSIS_HEIGHT,0];
 if(type==='car-base'){for(let i=0;i<10000;i++){const p:Vector3Tuple=[-3-(i%5)*9,CHASSIS_HEIGHT,Math.floor(i/5)*8];if([...graph.modules.values()].every(m=>Math.hypot(m.position[0]-p[0],m.position[2]-p[2])>6))return p;}return [-3,CHASSIS_HEIGHT,0];}
 if(ROAD_TYPES.has(type)){
  const count=[...graph.modules.values()].filter(m=>ROAD_TYPES.has(m.type)).length;
  return [4+(count%3)*7,0,-9-Math.floor(count/3)*7];
 }
 const y=restHeight(type);
 for(let row=0;row<8;row++)for(let col=0;col<5;col++){
  const p:Vector3Tuple=[center[0]-3+col*1.5,y,center[2]+(row%2===0?-1:1)*(2.8+Math.floor(row/2)*2.4)];
  if([...graph.modules.values()].every(m=>Math.hypot(m.position[0]-p[0],m.position[2]-p[2])>(m.type==='wheel'?.55:ROAD_TYPES.has(m.type)?3:.85)))return p;
 }
 return [center[0]-4,y,center[2]-4];
}
function spawn(type:ModuleType){
 if(mode!=='build')return;
 const owned=CAR_PART_TYPES.has(type),profile=owned?ensureVehicle():activeProfile();
 if(profile?.parked&&owned){showToast('Đưa xe từ gara ra bàn trước.');return;}
 const items=owned?vehicleParts(graph,profile!.id,type):[];
 if(owned&&items.length>=maxParts(profile!.kind,type)){const existing=items.find(m=>!isMounted(graph,m))??items[0];if(existing){workbench.selectById(existing.id);workbench.focusSelected();}return;}
 const m:ModuleInstance={id:type==='car-base'?profile!.id:type+'-'+crypto.randomUUID().slice(0,8),type,position:staging(type),rotationY:0,switchOn:type==='switch'||type==='traffic-light'?false:undefined};
 if(owned){m.vehicleId=profile!.id;if(type==='car-base'){m.vehicleKind=profile!.kind;m.color=profile!.color;}}
 workbench.addInstance(m);workbench.focusAll();showToast('Đã lấy '+MODULES[type].name+'. Chạm khớp xanh hoặc chọn vị trí trong bảng.');
}
function toggle(id:string){const m=graph.modules.get(id);if(!m||!['switch','traffic-light'].includes(m.type))return;m.switchOn=m.switchOn===false;workbench.rebuildFromGraph(id);changed();}
function rotateSelected(){
 const m=workbench.selectedId?graph.modules.get(workbench.selectedId):undefined;if(!m||mode!=='build'||isMounted(graph,m))return;
 workbench.moveAssembly(m.id,m.position,m.rotationY+Math.PI/2);workbench.rebuildFromGraph(m.id);changed();
}
function removeSelected(){
 const m=workbench.selectedId?graph.modules.get(workbench.selectedId):undefined;if(!m||mode!=='build'||isMounted(graph,m)||descendants(graph,m.id).length>1)return;
 graph.removeModule(m.id);workbench.rebuildFromGraph(null);changed();workbench.focusAll();
}
function detachSelected(){
 const m=workbench.selectedId?graph.modules.get(workbench.selectedId):undefined;if(!m||mode!=='build'||m.type==='car-base'||!isMounted(graph,m))return;
 workbench.cancelMovement();const position=workbench.loosePlacement(m.id);if(!position){showToast('Chưa có chỗ trống. Cất bớt linh kiện rời để tháo.');return;}
 if(!detachAssembly(graph,m.id,position))return;
 workbench.rebuildFromGraph(m.id);changed();workbench.focusAll();showToast('Đã tháo '+MODULES[m.type].name+' ra bàn. Bấm ↶ để lắp lại.');
}
function setMode(next:'build'|'test'|'run',all=false){
 const s=state();
 const ids=all?[...graph.vehicles.keys()].filter(id=>vehicleCanTravel(graph,id,s.sim.rpm).ready):s.car?[s.car.id]:[];
 if(next==='run'&&all&&!ids.length){showToast('Chưa có xe nào sẵn sàng. Chọn xe để xem phần còn thiếu.');return;}
 if(next==='run'&&!all&&!s.travel.ready){showToast(s.travel.message);return;}
 if(next==='test'&&!s.sim.rpm.size){showToast('Lắp pin, công tắc và mô-tơ; bật công tắc để thử mạch kín.');return;}
 if(mode===next)return;
 // Commit the parked position once when leaving Run. Updating a switch never restarts a route.
 const previous=mode;mode=next;workbench.setSimulation(next,s.sim,ids);
 if(previous==='run'){reconcileAssembly(graph);recordHistory();save();}
 el('driveStatus').classList.toggle('hidden',next==='build');el('driveStatus').textContent=next==='test'?'Thử tại chỗ · xe không di chuyển':'Đang chạy';
 if(next==='run')workbench.focusAll();refresh();
}
function restoreHistory(index:number){
 if(mode!=='build'||index<0||index>=history.length)return;
 const active=graph.activeVehicleId;
 workbench.cancelMovement();restoring=true;graph.restore(JSON.parse(history[index]));restoreAssembly(graph);if(active&&graph.vehicles.has(active))graph.activeVehicleId=active;workbench.rebuildFromGraph(null);historyIndex=index;restoring=false;save();renderPalette();refresh();workbench.focusAll();
}
function renderPalette(){
 const list=paletteMode==='car'?vehiclePalette(activeProfile()?.kind??'car'):ROAD_PALETTE;el('parts').innerHTML='';
 for(const type of list){const b=document.createElement('button');b.className='part';b.dataset.type=type;b.innerHTML=`<span class="part-icon" aria-hidden="true">${moduleIcon(type)}</span><b>${MODULES[type].name}</b><small class="part-count"></small>`;b.onclick=()=>spawn(type);el('parts').append(b);}
 updatePalette();
}
function updatePalette(){
 for(const b of el('parts').querySelectorAll<HTMLButtonElement>('.part')){
  const type=b.dataset.type as ModuleType,items=CAR_PART_TYPES.has(type)?vehicleParts(graph,graph.activeVehicleId??'',type):[...graph.modules.values()].filter(m=>m.type===type),done=items.filter(m=>isInstalled(graph,m)).length;
  b.disabled=mode!=='build'||Boolean(CAR_PART_TYPES.has(type)&&activeProfile()?.parked);b.classList.toggle('done',done>0);b.querySelector('.part-count')!.textContent=type==='wheel'?done+'/'+vehicleSpec(activeProfile()?.kind??'car').wheels+' đã lắp':done?'Đã lắp':items.length?'Đang ở bàn':'Lấy ra';
 }
 button('carTab').classList.toggle('active',paletteMode==='car');button('roadTab').classList.toggle('active',paletteMode==='road');button('testRoad').disabled=mode!=='build';
}
function renderMovementControls(){
 el('movementBar').classList.toggle('hidden',mode!=='build'||!workbench.movementIntent());
 el('flowStrip').classList.toggle('hidden',Boolean(workbench.movementIntent()));
}
function renderSelection(id:string|null){
 renderMovementControls();
 const m=id?graph.modules.get(id):undefined;const panel=el('selectionPanel');panel.classList.toggle('hidden',!m);if(!m)return;
 const owner=vehicleForModule(graph,m);if(owner&&owner!==graph.activeVehicleId){graph.activeVehicleId=owner;renderPalette();save();refresh();return;}
 const installed=isInstalled(graph,m),mounted=isMounted(graph,m);el('selectedName').textContent=MODULES[m.type].name;
 const sim=simulator.evaluate();const details=[installed?'Trên xe':mounted?'Đã ghép':'Đang rời'];
 if(mode!=='build'&&sim.rpm.has(m.id))details.push(Math.abs(sim.rpm.get(m.id)!).toFixed(0)+' rpm');
 el('selectedState').textContent=details.join(' · ');el('partDescription').textContent=MODULES[m.type].description;
 const protectedPart=isMovementLocked(m.id),intent=workbench.movementIntent(),armed=intent?.id===m.id;
 el('gestureHint').textContent=mode!=='build'?'Dừng máy trước khi lắp hoặc tháo.':armed?'Kéo đoạn đường rồi thả để đặt. Biển gắn trên đường đi cùng.':installed?m.type==='car-base'?'Kéo ở khung, bánh hoặc bất kỳ bộ phận đã ráp để chuyển cả xe.':'Chạm để chọn. Kéo để chuyển cả xe. Bấm “Tháo ra” mới tách riêng bộ phận.':mounted?CONTROL_TYPES.has(m.type)?'Biển đang gắn trên đường. Bấm “Tháo ra” để lấy xuống bàn.':'Kéo để chuyển cả cụm. Bấm “Tháo ra” mới tách khỏi cụm.':protectedPart?'Đường đang ghép. Bấm “Di chuyển đoạn đường” rồi kéo.':descendants(graph,m.id).length>1?'Kéo để di chuyển cả cụm, giữ nguyên các khớp.':'Chạm khớp xanh hoặc nút vị trí bên dưới để ráp. Bé vẫn có thể kéo.';
 const actions:string[]=[];
 if(m.type==='switch')actions.push(`<button id="toggleSwitch">${m.switchOn?'Tắt công tắc':'Bật công tắc'}</button>`);
 if(m.type==='traffic-light')actions.push(`<button id="toggleLight">${m.switchOn?'Chuyển đỏ':'Chuyển xanh'}</button>`);
 if(mode==='build'&&mounted&&m.type!=='car-base')actions.push('<button id="detachPart">Tháo ra</button>');
 if(mode==='build'&&protectedPart&&ROAD_TYPES.has(m.type))actions.push(`<button id="movePart" class="${armed?'active':''}">${armed?'Hủy di chuyển':'Di chuyển đoạn đường'}</button>`);
 actions.push('<button id="focusPart">Nhìn gần</button>');if(owner)actions.push('<button id="inspectPart">'+(workbench.inspectionId()===m.id?'Xem đủ xe':'Nhìn bên trong')+'</button>');
 if(mode==='build'&&!mounted&&!protectedPart){actions.push('<button id="rotatePart">Xoay 90°</button>');if(descendants(graph,m.id).length===1)actions.push('<button id="deletePart">Cất</button>');}
 if(m.type==='car-base'&&mode==='build')actions.push('<button id="placeOnRoad">Đặt lên đường</button><button id="returnCar">Về đầu đường</button>');
 el('moduleActions').innerHTML=actions.join('');
 if(document.getElementById('toggleSwitch'))button('toggleSwitch').onclick=()=>toggle(m.id);
 if(document.getElementById('toggleLight'))button('toggleLight').onclick=()=>toggle(m.id);
 if(document.getElementById('detachPart'))button('detachPart').onclick=detachSelected;
 if(document.getElementById('movePart'))button('movePart').onclick=()=>{if(armed)workbench.cancelMovement();else{workbench.requestMove(m.id);showToast('Kéo đoạn đường rồi thả để đặt.');}};
 if(document.getElementById('inspectPart'))button('inspectPart').onclick=()=>{if(workbench.inspectionId()===m.id)workbench.clearInspection();else workbench.inspectPart(m.id);renderSelection(m.id);};
 if(document.getElementById('placeOnRoad'))button('placeOnRoad').onclick=placeOnRoad;
 el('socketTargets').innerHTML='';if(mode==='build'&&!mounted&&m.type!=='car-base'&&!ROAD_TYPES.has(m.type)){for(const pose of placementCandidates(graph,m.id)){const b=document.createElement('button');b.className='socket-target';b.dataset.slot=pose.slotKey??'';b.textContent='＋ '+(pose.label??pose.slotKey??'Lắp tại đây');b.onclick=()=>placeTarget(m.id,pose);el('socketTargets').append(b);}}
 button('focusPart').onclick=()=>workbench.focusSelected();
 if(document.getElementById('rotatePart'))button('rotatePart').onclick=rotateSelected;
 if(document.getElementById('deletePart'))button('deletePart').onclick=removeSelected;
 if(document.getElementById('returnCar'))button('returnCar').onclick=()=>{if(!workbench.returnToStart())showToast('Xe chưa chạy. Kéo ở bất kỳ bộ phận đã ráp để đưa cả xe lên đường.');};
}
function refresh(){
 const s=state(),profile=activeProfile(),parts=profile?vehicleParts(graph,profile.id):[],spec=vehicleSpec(profile?.kind??'car');el('progressText').textContent=s.count+' / '+spec.total;
 const steps:[string,ModuleType[]][]=[['Khung',['car-base']],['Điện',['battery','switch','motor']],['Bộ truyền',['gearbox','differential']],['Trục',['front-axle','drive-axle']]];
 el('stepList').innerHTML=steps.map(([name,types])=>`<span class="${types.every(t=>parts.some(m=>m.type===t&&isInstalled(graph,m)))?'done':''}">${name}</span>`).join('')+`<span class="${parts.filter(m=>m.type==='wheel'&&isInstalled(graph,m)).length===spec.wheels?'done':''}">${spec.wheels} bánh</span>`;
 el('readyBadge').textContent=mode==='test'?'Thử tại chỗ':mode==='run'?'Đang chạy':s.travel.ready?'Sẵn sàng':'Lắp xe';
 el('coach').textContent=s.travel.message;
 button('helpNext').disabled=mode!=='build'||Boolean(profile?.parked);
 button('runBtn').textContent=mode==='run'?'Dừng xe':'Chạy xe';button('runBtn').disabled=mode==='build'&&!s.travel.ready||mode==='test';
 button('runAllBtn').disabled=mode!=='build'||![...graph.vehicles.keys()].some(id=>vehicleCanTravel(graph,id,s.sim.rpm).ready);
 button('stopAllBtn').classList.toggle('hidden',mode==='build');
 button('testBtn').textContent=mode==='test'?'Dừng máy':'Thử máy';button('testBtn').disabled=mode==='run'||mode==='build'&&!s.sim.rpm.size;
 button('buildBtn').classList.toggle('active',mode==='build');button('runBtn').classList.toggle('active',mode==='run');button('testBtn').classList.toggle('active',mode==='test');
 button('undoBtn').disabled=historyIndex<=0||mode!=='build';button('redoBtn').disabled=historyIndex>=history.length-1||mode!=='build';button('resetBtn').disabled=mode!=='build';button('newVehicleBtn').disabled=mode!=='build';
 const flow:ModuleType[]=['battery','switch','motor','gearbox','differential','drive-axle'];el('flowStrip').innerHTML='';
 for(const [index,type] of flow.entries()){const m=parts.find(m=>m.type===type),b=document.createElement('button');b.title=MODULES[type].name;b.innerHTML=moduleIcon(type)+(index<flow.length-1?' →':'');b.className=m&&s.sim.active.has(m.id)?'flow-on':'';b.onclick=()=>{if(m)workbench.inspectPart(m.id);else{showToast('Còn thiếu '+MODULES[type].name);spawn(type);}};el('flowStrip').append(b);}
 el('flowStrip').title='Pin → công tắc → mô-tơ → hộp số → vi sai → trục dẫn động. Dây điện có đường đi và đường về.';
 updatePalette();renderGarage();renderDrawer();renderSelection(workbench.selectedId);
 const mission=profile?.mission;workbench.setDestinations(mode==='build'&&mission?.status==='choose'&&mission.kind!=='trailer'?[...graph.modules.values()].filter(m=>ROAD_TYPES.has(m.type)).map(m=>m.id):[]);
}
function placeTarget(id:string,pose:Placement){
 if(mode!=='build')return;
 const valid=placementCandidates(graph,id).find(p=>p.parentId===pose.parentId&&p.slotKey===pose.slotKey);if(!valid){showToast('Khớp này đã thay đổi. Chọn lại vị trí.');return;}
 commitPlacement(graph,id,valid);workbench.clearInspection();workbench.rebuildFromGraph(id);changed();workbench.focusAll();showToast('Đã ráp '+(valid.label??'đúng khớp')+'.');
}
function placeOnRoad(){
 const car=state().car;if(!car||mode!=='build')return;const original=JSON.parse(JSON.stringify(graph.serialize()));
 for(const pose of placementCandidates(graph,car.id)){
  commitPlacement(graph,car.id,pose);
  if(!vehicleOverlap(graph,car.id)&&wheelsOnRoad(graph,car.id)){workbench.rebuildFromGraph(car.id);changed();workbench.focusAll();showToast('Đã đặt cả xe lên đường.');return;}
  graph.restore(original);restoreAssembly(graph);
 }
 showToast('Chưa có vị trí đường trống. Thêm đường hoặc chuyển xe khác.');
}
function addVehicle(kind:VehicleKind){
 if(mode!=='build')return;newVehicle(graph,kind);el('vehicleChooser').classList.add('hidden');paletteMode='car';renderPalette();spawn('car-base');changed();
}
function selectVehicle(id:string){graph.activeVehicleId=id;save();workbench.clearInspection();workbench.clearSelection();renderPalette();refresh();const car=graph.modules.get(id);if(car&&!activeProfile()?.parked){workbench.selectById(id);workbench.focusVehicle(id);}}
function renderGarage(){
 el('garageCars').innerHTML='';for(const p of graph.vehicles.values()){const b=document.createElement('button');b.dataset.vehicle=p.id;b.className=p.id===graph.activeVehicleId?'active':'';b.style.borderBottom='3px solid '+p.color;b.textContent=(p.parked?'▣ ':'🚘 ')+p.name;b.onclick=()=>selectVehicle(p.id);el('garageCars').append(b);}
}
function pickDestination(roadId:string){const id=graph.activeVehicleId;if(!id||mode!=='build')return;const error=chooseDestination(graph,id,roadId);if(error){showToast(error);return;}changed();showToast('Đã chọn điểm đến. Bấm Chạy xe khi sẵn sàng.');}
function renderDrawer(){
 const body=el('drawerBody'),p=activeProfile();el('toolDrawer').classList.toggle('hidden',panelView==='guide');document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===panelView));body.innerHTML='';if(panelView==='guide')return;
 el('drawerTitle').textContent=({parts:'Linh kiện trên xe',missions:'Nhiệm vụ',experiment:'Thí nghiệm 10 giây',garage:'Xe của bé'} as Record<string,string>)[panelView];
 if(!p){body.textContent='Lấy khung hoặc bấm ＋ Xe để bắt đầu.';return;}
 const editable=mode==='build'&&!p.parked;
 const addButton=(text:string,action:()=>void,disabled=false)=>{const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=action;body.append(b);return b;};
 const note=(text:string)=>{const n=document.createElement('p');n.textContent=text;body.append(n);};
 if(panelView==='parts'){
  note('Chạm linh kiện để nhìn xuyên các phần đang che nó.');
  for(const m of vehicleParts(graph,p.id)){const target=m.parentId&&m.slotKey?placementLabel(m):undefined;const b=addButton((target??MODULES[m.type].name)+' · '+(isInstalled(graph,m)?'Đã ráp':'Ở bàn'),()=>workbench.inspectPart(m.id),p.parked);b.insertAdjacentHTML('afterbegin',moduleIcon(m.type));b.dataset.inspect=m.id;}
  addButton('Xem đủ xe',()=>{workbench.clearInspection();workbench.focusVehicle(p.id);},p.parked);
 }else if(panelView==='garage'){
  const label=document.createElement('label');label.textContent='Tên xe';const input=document.createElement('input');input.id='vehicleName';input.value=p.name;input.maxLength=40;input.disabled=mode!=='build';input.onchange=()=>{p.name=input.value.trim().slice(0,40)||VEHICLE_NAMES[p.kind];changed();};label.append(input);body.append(label);
  const colors=document.createElement('div');colors.className='colors';for(const color of VEHICLE_COLORS){const b=document.createElement('button');b.style.background=color;b.setAttribute('aria-label','Màu '+color);b.dataset.color=color;b.disabled=mode!=='build';b.onclick=()=>{p.color=color;const car=graph.modules.get(p.id);if(car)car.color=color;workbench.rebuildFromGraph(workbench.selectedId);changed();};colors.append(b);}body.append(colors);
  addButton(p.parked?'Đưa xe ra bàn':'Cất xe vào gara',()=>{p.parked=!p.parked;if(!p.parked&&vehicleOverlap(graph,p.id)){const free=workbench.loosePlacement(p.id);if(free){workbench.moveAssembly(p.id,free,graph.modules.get(p.id)!.rotationY);commitPlacement(graph,p.id,null);}else{p.parked=true;showToast('Chưa có chỗ trống để đưa xe ra.');}}workbench.rebuildFromGraph(p.parked?null:p.id);changed();workbench.focusAll();},mode!=='build').id='parkVehicle';
  note('Tự lưu trên máy này. Có thể tạo thêm nhiều xe; cất xe chưa dùng để bàn thoáng hơn.');
 }else if(panelView==='missions'){
  for(const kind of ['garage','delivery','trailer'] as MissionKind[]){const b=addButton(MISSION_NAMES[kind],()=>{const error=selectMission(graph,p.id,kind);if(error)showToast(error);else changed();},!editable||kind==='trailer'&&p.kind!=='tractor');b.dataset.mission=kind;}
  const mission=p.mission;if(mission){note(MISSION_NAMES[mission.kind]+' · '+({choose:'Chọn điểm đến',ready:'Sẵn sàng',running:'Đang đi',completed:'Hoàn thành'}[mission.status])+(mission.delivered?' · '+mission.delivered+' kiện':''));if(mission.kind==='trailer'&&mission.status!=='completed')note('Ráp mâm kéo, rơ-moóc, hai trục phụ và đủ bốn bánh rơ-moóc.');
   if(mission.status==='choose'&&mission.kind!=='trailer'){note('Chạm cờ vàng trên đường, hoặc chọn điểm dưới đây.');let i=0;for(const m of graph.modules.values())if(ROAD_TYPES.has(m.type)){const b=addButton('⚑ Điểm '+(++i),()=>pickDestination(m.id),!editable);b.dataset.destination=m.id;}}
   addButton('Hủy nhiệm vụ',()=>{p.mission=undefined;changed();},!editable).id='cancelMission';
  }else note('Chọn nhiệm vụ cho riêng xe này. Đường cần nối liền theo hướng xe.');
  cargoControls(body,p.id,editable);
 }else if(panelView==='experiment'){
  note('Cùng 10 giây, đường thẳng không có vật cản. Đơn vị mô phỏng.');
  const gearbox=vehicleParts(graph,p.id,'gearbox')[0];for(const gear of ['power','balanced','speed'] as GearMode[]){const b=addButton(GEAR_NAMES[gear],()=>{if(gearbox){gearbox.gearMode=gear;workbench.rebuildFromGraph(workbench.selectedId);changed();}},!editable||!gearbox);b.dataset.gear=gear;b.classList.toggle('active',(gearbox?.gearMode??'balanced')===gear);}
  cargoControls(body,p.id,editable);
  const perf=vehiclePerformance(graph,p.id);note(perf.stalled?'Tải quá nặng: xe không khởi hành được.':'Lực kéo '+perf.force.toFixed(1)+' · Tốc độ tối đa '+perf.speed.toFixed(2));
  const ready=assemblyIssues(graph,p.id).length===0&&Boolean(vehicleParts(graph,p.id,'motor').some(m=>simulator.evaluate().rpm.has(m.id)));
  addButton('Đo 10 giây',()=>{p.experiments.push(measureExperiment(graph,p.id));p.experiments=p.experiments.slice(-6);changed();},!editable||!ready).id='measureExperiment';
  if(!ready)note('Ráp đủ cơ cấu và bật công tắc để đo.');
  if(p.experiments.length){const table=document.createElement('table');table.id='experimentResults';table.innerHTML='<thead><tr><th>Số / kiện</th><th>Đi 10 s</th></tr></thead><tbody>'+p.experiments.map(r=>'<tr><td>'+GEAR_NAMES[r.gear]+' / '+r.cargo+'</td><td>'+r.distance.toFixed(2)+(r.stalled?' · Kẹt':'')+'</td></tr>').join('')+'</tbody>';body.append(table);}
 }
}
function cargoControls(body:HTMLElement,id:string,editable:boolean){
 const p=graph.vehicles.get(id)!,carrier=cargoCarrier(graph,id),row=document.createElement('div');row.className='cargo-controls';
 const minus=document.createElement('button'),plus=document.createElement('button'),value=document.createElement('span');minus.textContent='−';minus.id='unloadCargo';minus.setAttribute('aria-label','Bớt một kiện');plus.textContent='＋';plus.id='loadCargo';plus.setAttribute('aria-label','Thêm một kiện');value.textContent=p.cargo+' / '+cargoCapacity(graph,id)+' kiện';
 minus.disabled=!editable||p.cargo<=0;plus.disabled=!editable||!carrier||p.cargo>=cargoCapacity(graph,id);
 const change=(amount:number)=>{p.cargo+=amount;workbench.rebuildFromGraph(workbench.selectedId);changed();};minus.onclick=()=>change(-1);plus.onclick=()=>change(1);row.append(minus,value,plus);body.append(row);
 if(!carrier){const hint=document.createElement('p');hint.textContent='Ráp '+(p.kind==='tractor'?'rơ-moóc':'thùng hàng')+' trước khi xếp hàng.';body.append(hint);}
}
function placementLabel(m:ModuleInstance){const candidates=m.parentId&&m.slotKey?slotPose(graph,m.parentId,m.slotKey):null;return candidates?.label;}
function testRoad(){
 if(mode!=='build')return;
 if([...graph.modules.values()].some(m=>ROAD_TYPES.has(m.type))){workbench.focusAll();showToast('Bé có thể kéo thêm các đoạn đường từ kho.');return;}
 const roads:ModuleInstance[]=[];
 for(let i=0;i<3;i++){const m:ModuleInstance={id:'test-road-'+i,type:'road-straight',position:[3,0,(i-1)*ROAD_HALF_LENGTH*2],rotationY:0};roads.push(m);graph.addModule(m);}
 for(let i=1;i<roads.length;i++)graph.connect({id:'test-road-link-'+i,fromModuleId:roads[i-1].id,fromPortId:'north',toModuleId:roads[i].id,toPortId:'south',signal:'structural'});
 workbench.rebuildFromGraph(null);changed();workbench.focusAll();showToast('Đã lấy ba đoạn đường thử. Xe vẫn cần bé tự lắp.');
}
button('carTab').onclick=()=>{paletteMode='car';renderPalette();};button('roadTab').onclick=()=>{paletteMode='road';renderPalette();};
button('testRoad').onclick=testRoad;button('runAllBtn').onclick=()=>setMode('run',true);button('stopAllBtn').onclick=()=>setMode('build');button('buildBtn').onclick=()=>setMode('build');button('runBtn').onclick=()=>setMode(mode==='run'?'build':'run');button('testBtn').onclick=()=>setMode(mode==='test'?'build':'test');
button('undoBtn').onclick=()=>restoreHistory(historyIndex-1);button('redoBtn').onclick=()=>restoreHistory(historyIndex+1);
button('resetBtn').onclick=()=>{if(mode!=='build')return;workbench.cancelMovement();graph.restore({});workbench.rebuildFromGraph(null);changed();workbench.focusAll();};
button('cancelMove').onclick=()=>workbench.cancelMovement();
button('cameraIso').onclick=()=>workbench.setCamera('iso');button('cameraTop').onclick=()=>workbench.setCamera('top');button('focusAll').onclick=()=>workbench.focusAll();
button('newVehicleBtn').onclick=()=>el('vehicleChooser').classList.toggle('hidden');
for(const kind of VEHICLE_KINDS){const b=document.createElement('button');b.dataset.newKind=kind;b.textContent=VEHICLE_NAMES[kind];b.onclick=()=>addVehicle(kind);el('vehicleChooser').append(b);}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{panelView=panelView===b.dataset.view?'guide':b.dataset.view!;renderDrawer();});
button('closeDrawer').onclick=()=>{panelView='guide';renderDrawer();};button('closeSelection').onclick=()=>workbench.clearSelection();
button('helpNext').onclick=()=>{const s=state();if(!s.car){spawn('car-base');return;}const issue=assemblyIssues(graph,s.car.id)[0];if(issue?.type){spawn(issue.type);return;}const sw=vehicleParts(graph,s.car.id,'switch')[0];if(sw?.switchOn===false)workbench.inspectPart(sw.id);else placeOnRoad();};
try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)graph.restore(JSON.parse(saved));}catch{localStorage.removeItem(STORAGE_KEY);}
restoreAssembly(graph);workbench.rebuildFromGraph(null);recordHistory();renderPalette();refresh();workbench.focusAll();

if(new URLSearchParams(location.search).has('qa')){
 (window as any).__CAR_LAB__={
  snapshot(){const s=state();return {modules:[...graph.modules.values()].map(m=>({...m,position:[...m.position]})),connections:[...graph.connections.values()],mode,ready:s.travel.ready,count:s.count,rpm:Object.fromEntries(s.sim.rpm),torque:Object.fromEntries(s.sim.torque),current:Object.fromEntries(s.sim.current),powered:[...s.sim.powered],message:s.travel.message,carId:s.car?.id??null,moveIntent:workbench.movementIntent(),telemetry:workbench.telemetry(),fleet:workbench.fleetTelemetry(),vehicles:[...graph.vehicles.values()],activeVehicleId:graph.activeVehicleId,inspection:workbench.inspectionId()};},
  addVehicle,selectVehicle,
  rendered:(id:string)=>workbench.renderedTransform(id),bounds:(id:string)=>workbench.renderedBounds(id),mechanism:(id:string)=>workbench.mechanism(id),
  screen:(id:string)=>workbench.screenPointForModule(id),screenWorld:(p:Vector3Tuple)=>workbench.screenPointForWorld(p),
  dragTarget:(id:string,p:Vector3Tuple,start:{x:number;y:number})=>workbench.screenDragTarget(id,p,start),
  targetPose(type:ModuleType,key?:string){const m=[...graph.modules.values()].find(m=>m.type===type&&!isMounted(graph,m))??first(graph,type);if(!m)return null;const list=placementCandidates(graph,m.id);return key?list.find(p=>p.slotKey===key)??null:list[0]??null;},
  snapPose:(id:string,p:Vector3Tuple)=>previewPlacement(graph,id,p),
  isInstalled:(id:string)=>isInstalled(graph,graph.modules.get(id)),isAttached:(id:string)=>isMounted(graph,graph.modules.get(id)),
  spawn(type:ModuleType){spawn(type);return [...graph.modules.values()].filter(m=>m.type===type).at(-1)?.id??null;},
  focus(id:string){workbench.selectById(id);workbench.focusSelected();},
  forceRoad(type:ModuleType,p:Vector3Tuple,yaw=0){const m:ModuleInstance={id:type+'-fixture-'+crypto.randomUUID().slice(0,6),type,position:p,rotationY:yaw};graph.addModule(m);workbench.rebuildFromGraph(null);changed();return m.id;},
  fixture(data:any){if(mode!=='build')setMode('build');workbench.cancelMovement();graph.restore(data);restoreAssembly(graph);workbench.rebuildFromGraph(null);changed();workbench.focusAll();},
  cancelDrag:()=>workbench.cancelDrag(),
 };
}
if('serviceWorker'in navigator&&!new URLSearchParams(location.search).has('qa')){
 addEventListener('load',async()=>{try{const r=await navigator.serviceWorker.register('./sw.js?v=20260930-workshop6',{scope:'./',updateViaCache:'none'});await r.update();}catch{}});
}
