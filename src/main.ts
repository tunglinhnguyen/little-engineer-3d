import './styles/app.css';
import { ConnectionGraph } from './core/connectionGraph';
import { CAR_PALETTE, CONTROL_TYPES, MODULES, ROAD_PALETTE, ROAD_TYPES } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import { assemblyCount, commitPlacement, descendants, detachAssembly, first, isInstalled, isMounted, placementCandidates, previewPlacement, reconcileAssembly, REQUIRED_PARTS, restoreAssembly, UNIQUE_CAR } from './core/assembly';
import { CHASSIS_HEIGHT, ROAD_HALF_LENGTH } from './core/layout';
import { vehicleCanTravel } from './core/vehicleRules';
import type { ModuleInstance, ModuleType, Placement, Vector3Tuple } from './core/types';
import { Workbench } from './three/workbench';
import { moduleIcon } from './core/icons';
import { restHeight } from './three/moduleFactory';

const STORAGE_KEY='little-engineer-workshop-v5';
const graph=new ConnectionGraph(),simulator=new SimulationEngine(graph);
let mode:'build'|'test'|'run'='build',paletteMode:'car'|'road'='car';
let history:string[]=[],historyIndex=-1,restoring=false,toastTimer=0;

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="topbar">
 <div class="brand"><b>Little Engineer 3D</b><small>Bé tự ráp · thử cơ cấu · lái xe trên đường</small></div>
 <div class="mode-actions">
  <button id="buildBtn">Lắp xe</button><button id="testBtn" title="Thử các cơ cấu tại chỗ">Thử máy</button><button id="runBtn">Chạy xe</button>
  <button id="undoBtn" aria-label="Hoàn tác">↶</button><button id="redoBtn" aria-label="Làm lại">↷</button><button id="resetBtn">Dọn bàn</button>
 </div>
</header>
<main class="work-area" id="workArea">
 <canvas id="world" aria-label="Bàn lắp ráp 3D"></canvas>
 <aside class="build-progress panel">
  <div class="progress-head"><b id="progressText">0 / 12</b><span id="readyBadge">Lắp xe</span></div>
  <div id="stepList" class="step-list"></div><div id="coach" class="coach"></div>
 </aside>
 <aside id="selectionPanel" class="selection-panel panel hidden">
  <div class="selection-title"><b id="selectedName"></b><span id="selectedState"></span></div>
  <p id="partDescription"></p><div id="gestureHint" class="gesture-hint"></div><div id="moduleActions" class="module-actions"></div>
 </aside>
 <nav class="camera-bar panel"><button id="cameraIso">Chéo</button><button id="cameraTop">Trên</button><button id="focusAll">Toàn cảnh</button></nav>
 <nav id="movementBar" class="movement-bar panel hidden" aria-label="Di chuyển đường"><span>Kéo đoạn đường để đặt lại</span><button id="cancelMove">Hủy</button></nav>
 <div id="toast" class="toast hidden" role="status"></div><div id="driveStatus" class="drive-status hidden" role="status"></div>
</main>
<section class="palette panel">
 <div class="palette-title"><div class="palette-tabs"><button id="carTab">Linh kiện</button><button id="roadTab">Đường & tín hiệu</button></div><span id="paletteHelp">Chạm chọn · Kéo cả xe · Bấm Tháo ra</span><button id="testRoad">Lấy đường thử</button></div>
 <div id="parts" class="parts"></div>
</section>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(id:string)=>el<HTMLButtonElement>(id);
const showToast=(message:string)=>{el('toast').textContent=message;el('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>el('toast').classList.add('hidden'),2200);};
function isMovementLocked(id:string){const m=graph.modules.get(id);return Boolean(m&&(CONTROL_TYPES.has(m.type)&&isMounted(graph,m)||ROAD_TYPES.has(m.type)&&(descendants(graph,id).length>1||graph.incoming(id).length||graph.outgoing(id).length)));}
function state(){const sim=simulator.evaluate(),car=first(graph,'car-base');return {sim,car,count:assemblyCount(graph),travel:car?vehicleCanTravel(graph,car.id,sim.rpm):{ready:false,message:'Lấy khung xe hoặc bất kỳ linh kiện nào để bắt đầu.',route:[]}};}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(graph.serialize()));}catch{showToast('Bộ nhớ đầy. Bàn lắp vẫn hoạt động trong phiên này.');}}
function recordHistory(){const s=JSON.stringify(graph.serialize());if(s===history[historyIndex])return;history=history.slice(0,historyIndex+1);history.push(s);if(history.length>60)history.shift();historyIndex=history.length-1;}
function changed(){reconcileAssembly(graph);if(!restoring)recordHistory();save();workbench.updateState(simulator.evaluate());refresh();}

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
 onGraphChanged:changed,
 onDriveUpdate:s=>{el('driveStatus').textContent=s.reason+' · '+s.speed.toFixed(2)+' đơn vị/s';},
});
function staging(type:ModuleType):Vector3Tuple{
 const center=first(graph,'car-base')?.position??[-3,CHASSIS_HEIGHT,0];
 if(type==='car-base')return [-3,CHASSIS_HEIGHT,0];
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
 let existing:ModuleInstance|undefined;
 if(UNIQUE_CAR.has(type))existing=first(graph,type);
 if(type==='wheel'&&[...graph.modules.values()].filter(m=>m.type==='wheel').length>=4)existing=[...graph.modules.values()].find(m=>m.type==='wheel'&&!isMounted(graph,m))??first(graph,'wheel');
 if(existing){workbench.selectById(existing.id);workbench.focusSelected();return;}
 if(graph.modules.size>=42){showToast('Bàn đã đầy. Cất bớt linh kiện rời để lấy thêm.');return;}
 const m:ModuleInstance={id:type+'-'+crypto.randomUUID().slice(0,8),type,position:staging(type),rotationY:0,switchOn:type==='switch'?false:type==='traffic-light'?false:undefined};
 workbench.addInstance(m);workbench.focusAll();showToast('Đã lấy '+MODULES[type].name+'. Bé tự kéo tới hình gợi ý.');
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
function setMode(next:'build'|'test'|'run'){
 const s=state();
 if(next==='run'&&!s.travel.ready){showToast(s.travel.message);return;}
 if(next==='test'&&!s.sim.rpm.size){showToast('Lắp pin, công tắc và mô-tơ; bật công tắc để thử mạch kín.');return;}
 if(mode===next)return;
 // Commit the parked position once when leaving Run. Updating a switch never restarts a route.
 const previous=mode;mode=next;workbench.setSimulation(next,s.sim);
 if(previous==='run'){reconcileAssembly(graph);recordHistory();save();}
 el('driveStatus').classList.toggle('hidden',next==='build');el('driveStatus').textContent=next==='test'?'Thử tại chỗ · xe không di chuyển':'Đang chạy';
 if(next==='run')workbench.focusAll();refresh();
}
function restoreHistory(index:number){
 if(mode!=='build'||index<0||index>=history.length)return;
 workbench.cancelMovement();restoring=true;graph.restore(JSON.parse(history[index]));restoreAssembly(graph);workbench.rebuildFromGraph(null);historyIndex=index;restoring=false;save();refresh();workbench.focusAll();
}
function renderPalette(){
 const list=paletteMode==='car'?CAR_PALETTE:ROAD_PALETTE;el('parts').innerHTML='';
 for(const type of list){const b=document.createElement('button');b.className='part';b.dataset.type=type;b.innerHTML=`<span class="part-icon" aria-hidden="true">${moduleIcon(type)}</span><b>${MODULES[type].name}</b><small class="part-count"></small>`;b.onclick=()=>spawn(type);el('parts').append(b);}
 updatePalette();
}
function updatePalette(){
 for(const b of el('parts').querySelectorAll<HTMLButtonElement>('.part')){
  const type=b.dataset.type as ModuleType,items=[...graph.modules.values()].filter(m=>m.type===type),done=items.filter(m=>isInstalled(graph,m)).length;
  b.disabled=mode!=='build';b.classList.toggle('done',done>0);b.querySelector('.part-count')!.textContent=type==='wheel'?done+'/4 đã lắp':done?'Đã lắp':items.length?'Đang ở bàn':'Lấy ra';
 }
 button('carTab').classList.toggle('active',paletteMode==='car');button('roadTab').classList.toggle('active',paletteMode==='road');button('testRoad').disabled=mode!=='build';
}
function renderMovementControls(){
 el('movementBar').classList.toggle('hidden',mode!=='build'||!workbench.movementIntent());
}
function renderSelection(id:string|null){
 renderMovementControls();
 const m=id?graph.modules.get(id):undefined;const panel=el('selectionPanel');panel.classList.toggle('hidden',!m);if(!m)return;
 const installed=isInstalled(graph,m),mounted=isMounted(graph,m);el('selectedName').textContent=MODULES[m.type].name;
 const sim=simulator.evaluate();const details=[installed?'Trên xe':mounted?'Đã ghép':'Đang rời'];
 if(mode!=='build'&&sim.rpm.has(m.id))details.push(Math.abs(sim.rpm.get(m.id)!).toFixed(0)+' rpm');
 el('selectedState').textContent=details.join(' · ');el('partDescription').textContent=MODULES[m.type].description;
 const protectedPart=isMovementLocked(m.id),intent=workbench.movementIntent(),armed=intent?.id===m.id;
 el('gestureHint').textContent=mode!=='build'?'Dừng máy trước khi lắp hoặc tháo.':armed?'Kéo đoạn đường rồi thả để đặt. Biển gắn trên đường đi cùng.':installed?m.type==='car-base'?'Kéo ở khung, bánh hoặc bất kỳ bộ phận đã ráp để chuyển cả xe.':'Chạm để chọn. Kéo để chuyển cả xe. Bấm “Tháo ra” mới tách riêng bộ phận.':mounted?CONTROL_TYPES.has(m.type)?'Biển đang gắn trên đường. Bấm “Tháo ra” để lấy xuống bàn.':'Kéo để chuyển cả cụm. Bấm “Tháo ra” mới tách khỏi cụm.':protectedPart?'Đường đang ghép. Bấm “Di chuyển đoạn đường” rồi kéo.':descendants(graph,m.id).length>1?'Kéo để di chuyển cả cụm, giữ nguyên các khớp.':'Kéo tới hình xanh. Chỉ đúng khớp và đủ gần mới ghép.';
 const actions:string[]=[];
 if(m.type==='switch')actions.push(`<button id="toggleSwitch">${m.switchOn?'Tắt công tắc':'Bật công tắc'}</button>`);
 if(m.type==='traffic-light')actions.push(`<button id="toggleLight">${m.switchOn?'Chuyển đỏ':'Chuyển xanh'}</button>`);
 if(mode==='build'&&mounted&&m.type!=='car-base')actions.push('<button id="detachPart">Tháo ra</button>');
 if(mode==='build'&&protectedPart&&ROAD_TYPES.has(m.type))actions.push(`<button id="movePart" class="${armed?'active':''}">${armed?'Hủy di chuyển':'Di chuyển đoạn đường'}</button>`);
 actions.push('<button id="focusPart">Nhìn gần</button>');
 if(mode==='build'&&!mounted&&!protectedPart){actions.push('<button id="rotatePart">Xoay 90°</button>');if(descendants(graph,m.id).length===1)actions.push('<button id="deletePart">Cất</button>');}
 if(m.type==='car-base'&&mode==='build')actions.push('<button id="returnCar">Về đầu đường</button>');
 el('moduleActions').innerHTML=actions.join('');
 if(document.getElementById('toggleSwitch'))button('toggleSwitch').onclick=()=>toggle(m.id);
 if(document.getElementById('toggleLight'))button('toggleLight').onclick=()=>toggle(m.id);
 if(document.getElementById('detachPart'))button('detachPart').onclick=detachSelected;
 if(document.getElementById('movePart'))button('movePart').onclick=()=>{if(armed)workbench.cancelMovement();else{workbench.requestMove(m.id);showToast('Kéo đoạn đường rồi thả để đặt.');}};
 button('focusPart').onclick=()=>workbench.focusSelected();
 if(document.getElementById('rotatePart'))button('rotatePart').onclick=rotateSelected;
 if(document.getElementById('deletePart'))button('deletePart').onclick=removeSelected;
 if(document.getElementById('returnCar'))button('returnCar').onclick=()=>{if(!workbench.returnToStart())showToast('Xe chưa chạy. Kéo ở bất kỳ bộ phận đã ráp để đưa cả xe lên đường.');};
}
function refresh(){
 const s=state();el('progressText').textContent=s.count+' / '+REQUIRED_PARTS;
 const steps:[string,ModuleType[]][]=[['Khung',['car-base']],['Điện',['battery','switch','motor']],['Bộ truyền',['gearbox','differential']],['Hai trục',['front-axle','drive-axle']]];
 el('stepList').innerHTML=steps.map(([name,types])=>`<span class="${types.every(t=>isInstalled(graph,first(graph,t)))?'done':''}">${name}</span>`).join('')+`<span class="${[...graph.modules.values()].filter(m=>m.type==='wheel'&&isInstalled(graph,m)).length===4?'done':''}">Bốn bánh</span>`;
 el('readyBadge').textContent=mode==='test'?'Thử tại chỗ':mode==='run'?'Đang chạy':s.travel.ready?'Sẵn sàng':'Lắp xe';
 let help=s.travel.message;
 if(!s.car)help='Chọn linh kiện bất kỳ. Lấy khung để lắp các bộ phận lên xe.';
 else if(s.count<12)help='Bé tự kéo vào hình xanh. Bánh cần có trục để gắn vào.';
 else if(!s.sim.rpm.size)help='Ráp đủ rồi. Bật công tắc để đóng mạch và thử máy.';
 el('coach').textContent=help;
 button('runBtn').textContent=mode==='run'?'Dừng xe':'Chạy xe';button('runBtn').disabled=mode==='build'&&!s.travel.ready||mode==='test';
 button('testBtn').textContent=mode==='test'?'Dừng máy':'Thử máy';button('testBtn').disabled=mode==='run'||mode==='build'&&!s.sim.rpm.size;
 button('buildBtn').classList.toggle('active',mode==='build');button('runBtn').classList.toggle('active',mode==='run');button('testBtn').classList.toggle('active',mode==='test');
 button('undoBtn').disabled=historyIndex<=0||mode!=='build';button('redoBtn').disabled=historyIndex>=history.length-1||mode!=='build';button('resetBtn').disabled=mode!=='build';
 updatePalette();renderSelection(workbench.selectedId);
}
function testRoad(){
 if(mode!=='build')return;
 if([...graph.modules.values()].some(m=>ROAD_TYPES.has(m.type))){workbench.focusAll();showToast('Bé có thể kéo thêm các đoạn đường từ kho.');return;}
 const roads:ModuleInstance[]=[];
 for(let i=0;i<3;i++){const m:ModuleInstance={id:'test-road-'+i,type:'road-straight',position:[3,0,(i-1)*ROAD_HALF_LENGTH*2],rotationY:0};roads.push(m);graph.addModule(m);}
 for(let i=1;i<roads.length;i++)graph.connect({id:'test-road-link-'+i,fromModuleId:roads[i-1].id,fromPortId:'north',toModuleId:roads[i].id,toPortId:'south',signal:'structural'});
 workbench.rebuildFromGraph(null);changed();workbench.focusAll();showToast('Đã lấy ba đoạn đường thử. Xe vẫn cần bé tự lắp.');
}
button('carTab').onclick=()=>{paletteMode='car';renderPalette();};button('roadTab').onclick=()=>{paletteMode='road';renderPalette();};
button('testRoad').onclick=testRoad;button('buildBtn').onclick=()=>setMode('build');button('runBtn').onclick=()=>setMode(mode==='run'?'build':'run');button('testBtn').onclick=()=>setMode(mode==='test'?'build':'test');
button('undoBtn').onclick=()=>restoreHistory(historyIndex-1);button('redoBtn').onclick=()=>restoreHistory(historyIndex+1);
button('resetBtn').onclick=()=>{if(mode!=='build')return;workbench.cancelMovement();graph.restore({});workbench.rebuildFromGraph(null);changed();workbench.focusAll();};
button('cancelMove').onclick=()=>workbench.cancelMovement();
button('cameraIso').onclick=()=>workbench.setCamera('iso');button('cameraTop').onclick=()=>workbench.setCamera('top');button('focusAll').onclick=()=>workbench.focusAll();
try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)graph.restore(JSON.parse(saved));}catch{localStorage.removeItem(STORAGE_KEY);}
restoreAssembly(graph);workbench.rebuildFromGraph(null);recordHistory();renderPalette();refresh();workbench.focusAll();

if(new URLSearchParams(location.search).has('qa')){
 (window as any).__CAR_LAB__={
  snapshot(){const s=state();return {modules:[...graph.modules.values()].map(m=>({...m,position:[...m.position]})),connections:[...graph.connections.values()],mode,ready:s.travel.ready,count:s.count,rpm:Object.fromEntries(s.sim.rpm),torque:Object.fromEntries(s.sim.torque),current:Object.fromEntries(s.sim.current),powered:[...s.sim.powered],message:s.travel.message,carId:s.car?.id??null,moveIntent:workbench.movementIntent(),telemetry:workbench.telemetry()};},
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
 addEventListener('load',async()=>{try{const r=await navigator.serviceWorker.register('./sw.js?v=20260930-workshop5',{scope:'./',updateViaCache:'none'});await r.update();}catch{}});
}
