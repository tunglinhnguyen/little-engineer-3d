import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES, ROAD_TYPES } from '../core/moduleRegistry';
import { ConnectionGraph } from '../core/connectionGraph';
import { descendants, first, placementCandidates } from '../core/assembly';
import { add, angleDelta, HOLD_MS, rotateY } from '../core/layout';
import { VehicleDrive } from '../core/driving';
import { buildRoute, projectPolyline, roadCenterline } from '../core/worldRoutes';
import type { ModuleInstance, Placement, SimulationState, Vector3Tuple } from '../core/types';
import { createModuleObject, disposeObject } from './moduleFactory';

export type SnapPose=Placement;
export interface WorkbenchHooks {
 onSelect(id:string|null):void;
 onGraphChanged():void;
 canEdit():boolean;
 requiresHoldToMove(id:string):boolean;
 getSnapPose(id:string,position:Vector3Tuple):Placement|null;
 onDrop(id:string,pose:Placement|null):void;
 onHoldReady?(id:string):void;
 onDoubleTap?(id:string):void;
 onDriveUpdate?(status:ReturnType<VehicleDrive['snapshot']>):void;
}
interface Drag {
 pointer:number;id:string;start:THREE.Vector2;origin:Vector3Tuple;yaw:number;offset:THREE.Vector3;
 originals:Map<string,{position:Vector3Tuple;rotationY:number}>;
 requiresHold:boolean;ready:boolean;cancelled:boolean;changed:boolean;maxDistance:number;pose:Placement|null;
}
const emptyState=():SimulationState=>({powered:new Set(),active:new Set(),rpm:new Map(),voltage:new Map(),current:new Map(),torque:new Map()});
export class Workbench {
 readonly scene=new THREE.Scene();
 readonly camera=new THREE.PerspectiveCamera(42,1,.1,240);
 readonly renderer:THREE.WebGLRenderer;
 readonly controls:OrbitControls;
 selectedId:string|null=null;
 private objects=new Map<string,THREE.Group>();
 private links=new THREE.Group();
 private guides=new THREE.Group();
 private ray=new THREE.Raycaster();
 private pointer=new THREE.Vector2();
 private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 private drag:Drag|null=null;
 private holdTimer=0;
 private lastTap={id:'',at:0};
 private state=emptyState();
 private mode:'build'|'test'|'run'='build';
 private drive:VehicleDrive|null=null;
 private assemblyOrigins=new Map<string,{position:Vector3Tuple;yaw:number}>();
 private initialCarPose:{position:Vector3Tuple;rotationY:number;parentId?:string;slotKey?:string}|null=null;
 private last=performance.now();
 private lastNotice=0;
 private dirty=true;


 constructor(private canvas:HTMLCanvasElement,readonly graph:ConnectionGraph,private hooks:WorkbenchHooks){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.scene.background=new THREE.Color(0xe3eff0);this.scene.fog=new THREE.Fog(0xe3eff0,75,190);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(140,140),new THREE.MeshStandardMaterial({color:0xe4eee5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;this.scene.add(floor);
  const grid=new THREE.GridHelper(120,120,0x9cb9ad,0xc4d8cc);grid.position.y=.002;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.28;this.scene.add(grid);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x8ba29c,2));
  const sun=new THREE.DirectionalLight(0xfff9ec,2.3);sun.position.set(-10,18,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.normalBias=.02;this.scene.add(sun);
  this.scene.add(this.links,this.guides);
  this.camera.position.set(11,10,13);
  this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=false;this.controls.minDistance=1.3;this.controls.maxDistance=90;this.controls.maxPolarAngle=Math.PI*.48;this.controls.target.set(0,0,0);
  this.controls.addEventListener('change',()=>{this.dirty=true;});
  this.bindPointer();
  new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();
  requestAnimationFrame(t=>this.loop(t));
 }
 addInstance(m:ModuleInstance){this.graph.addModule(m);this.rebuildFromGraph(m.id);this.hooks.onGraphChanged();}
 rebuildFromGraph(keepSelection:string|null=this.selectedId){
  this.cancelDrag();
  for(const o of this.objects.values()){this.scene.remove(o);disposeObject(o);}this.objects.clear();
  for(const m of this.graph.modules.values()){const o=createModuleObject(m);this.objects.set(m.id,o);this.scene.add(o);}
  this.refreshLinks();this.selectById(keepSelection);this.dirty=true;
 }
 selectById(id:string|null){
  this.selectedId=id&&this.graph.modules.has(id)?id:null;
  for(const [key,obj] of this.objects)obj.traverse(c=>{
   const mat=(c as THREE.Mesh).material;
   if(mat instanceof THREE.MeshStandardMaterial){this.tint(mat,key===this.selectedId?0x173f4b:0,key===this.selectedId?.06:0);}
  });
  this.refreshGuides();this.hooks.onSelect(this.selectedId);this.dirty=true;
 }
 clearSelection(){this.selectById(null);}
 updateState(state:SimulationState){this.state=state;this.dirty=true;}
 setSimulation(mode:'build'|'test'|'run',state:SimulationState){
  this.cancelDrag();
  if(this.mode==='run'&&mode!=='run')this.commitDrivePosition();
  this.mode=mode;this.state=state;
  if(mode==='run'){
   const car=first(this.graph,'car-base');const rear=first(this.graph,'drive-axle');
   if(car&&rear){
    this.initialCarPose={position:[...car.position],rotationY:car.rotationY,parentId:car.parentId,slotKey:car.slotKey};
    this.drive=new VehicleDrive(this.graph,car.id,state.rpm.get(rear.id)??0);
    this.assemblyOrigins.clear();
    for(const id of descendants(this.graph,car.id)){
     const m=this.graph.modules.get(id)!;const delta:[number,number,number]=[m.position[0]-car.position[0],m.position[1]-car.position[1],m.position[2]-car.position[2]];
     this.assemblyOrigins.set(id,{position:rotateY(delta,-car.rotationY),yaw:angleDelta(m.rotationY,car.rotationY)});
    }
   }
  }else this.drive=null;
  this.refreshGuides();this.dirty=true;
 }
 returnToStart(){
  if(this.mode!=='build'||!this.initialCarPose)return false;
  const car=first(this.graph,'car-base');if(!car)return false;
  this.moveAssembly(car.id,this.initialCarPose.position,this.initialCarPose.rotationY);
  car.parentId=this.initialCarPose.parentId;car.slotKey=this.initialCarPose.slotKey;
  this.rebuildFromGraph(car.id);this.hooks.onGraphChanged();this.focusAll();return true;
 }
 private commitDrivePosition(){
  if(!this.drive)return;
  const car=this.graph.modules.get(this.drive.carId)!;
  this.moveAssembly(car.id,this.drive.position,this.drive.yaw);
  const road=[...this.graph.modules.values()].filter(m=>ROAD_TYPES.has(m.type)).map(m=>({m,p:projectPolyline(roadCenterline(m),car.position)})).sort((a,b)=>a.p.distance-b.p.distance)[0];
  if(road&&road.p.distance<.55){car.parentId=road.m.id;car.slotKey='road';}else{car.parentId=undefined;car.slotKey=undefined;}
  for(const id of this.assemblyOrigins.keys()){const m=this.graph.modules.get(id)!;const o=this.objects.get(id)!;o.position.set(...m.position);o.rotation.y=m.rotationY;}
  this.refreshLinks();this.hooks.onGraphChanged();
 }
 moveAssembly(id:string,position:Vector3Tuple,yaw:number){
  const root=this.graph.modules.get(id);if(!root)return;
  const origin=[...root.position] as Vector3Tuple,delta=angleDelta(yaw,root.rotationY);
  for(const member of descendants(this.graph,id)){
   const m=this.graph.modules.get(member)!;
   const local:[number,number,number]=[m.position[0]-origin[0],m.position[1]-origin[1],m.position[2]-origin[2]];
   m.position=add(position,rotateY(local,delta));m.rotationY+=delta;
   const o=this.objects.get(member);o?.position.set(...m.position);if(o)o.rotation.y=m.rotationY;
  }
 }
 setCamera(name:'iso'|'top'|'front'|'rear'|'left'|'right'){
  const t=this.controls.target.clone(),d=this.camera.position.distanceTo(t);
  const offsets={iso:[.70,.68,1],top:[0,1,.001],front:[1,.45,0],rear:[-1,.45,0],left:[0,.45,1],right:[0,.45,-1]}[name];
  this.camera.position.copy(t).add(new THREE.Vector3(...offsets).normalize().multiplyScalar(d));this.camera.lookAt(t);this.controls.update();this.camera.updateMatrixWorld();this.dirty=true;
 }
 focusAll(){
  if(!this.objects.size){this.controls.target.set(0,0,0);this.camera.position.set(9,9,11);this.controls.update();return;}
  const box=new THREE.Box3();for(const o of this.objects.values())box.expandByObject(o);
  this.fitBox(box,7);
 }
 focusSelected(){const o=this.selectedId?this.objects.get(this.selectedId):null;if(o)this.fitBox(new THREE.Box3().setFromObject(o),1.6);}
 private fitBox(box:THREE.Box3,min:number){
  const center=box.getCenter(new THREE.Vector3());
  const direction=new THREE.Vector3(.70,.68,1).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
  const tanV=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanH=tanV*this.camera.aspect;let radius=min;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(center),depth=p.dot(direction);radius=Math.max(radius,depth+Math.abs(p.dot(right))/tanH*1.15,depth+Math.abs(p.dot(up))/tanV*1.15);}
  this.controls.target.copy(center);this.camera.position.copy(center).add(direction.multiplyScalar(radius));this.camera.lookAt(center);this.controls.update();this.camera.updateMatrixWorld();this.dirty=true;
 }
 renderedTransform(id:string){const o=this.objects.get(id);return o?{position:o.position.toArray(),rotationY:o.rotation.y}:null;}
 mechanism(id:string){const o=this.objects.get(id);const result:any[]=[];o?.traverse(c=>{if(c.userData.rotor||c.userData.steeringSide)result.push({name:c.userData.rpmSource,axis:c.userData.rotorAxis,teeth:c.userData.teeth,rotation:c.rotation.toArray().slice(0,3),side:c.userData.side??c.userData.steeringSide});});return result;}
 telemetry(){return this.drive?.snapshot()??null;}
 renderedBounds(id:string){const o=this.objects.get(id);if(!o)return null;const b=new THREE.Box3().setFromObject(o);return {min:b.min.toArray(),max:b.max.toArray()};}
 screenPointForWorld(position:Vector3Tuple){this.camera.updateMatrixWorld();const p=new THREE.Vector3(...position).project(this.camera),r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
 screenPointForModule(id:string){
  const o=this.objects.get(id);if(!o)return null;
  this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld();
  const points:THREE.Vector3[]=[];
  o.traverse(c=>{const m=c as THREE.Mesh;if(!m.isMesh||!m.visible)return;m.geometry.computeBoundingBox();const b=m.geometry.boundingBox!;
   for(const x of [.3,.5,.7])for(const z of [.3,.5,.7])points.push(m.localToWorld(new THREE.Vector3(b.min.x+(b.max.x-b.min.x)*x,(b.min.y+b.max.y)/2,b.min.z+(b.max.z-b.min.z)*z)));
  });
  for(const p of points){const screen=this.screenPointForWorld(p.toArray() as Vector3Tuple);if(document.elementFromPoint(screen.x,screen.y)!==this.canvas)continue;
   const stable=[[0,0],[-2,0],[2,0],[0,-2],[0,2]].every(([dx,dy])=>this.cast(screen.x+dx,screen.y+dy)[0]?.object.userData.moduleId===id);if(stable)return screen;
  }
  return null;
 }
 screenDragTarget(id:string,position:Vector3Tuple,start:{x:number;y:number}){
  const o=this.objects.get(id);if(!o)return null;this.updateRay(start.x,start.y);const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-o.position.y),hit=new THREE.Vector3();
  if(!this.ray.ray.intersectPlane(plane,hit))return null;
  const offset=hit.sub(o.position);return this.screenPointForWorld(add([position[0],o.position.y,position[2]],offset.toArray() as Vector3Tuple));
 }
 private refreshGuides(){
  for(const c of [...this.guides.children]){this.guides.remove(c);disposeObject(c);}
  if(!this.selectedId||this.mode!=='build')return;
  const m=this.graph.modules.get(this.selectedId)!;
  if(m.type==='car-base'||ROAD_TYPES.has(m.type))return;
  for(const pose of placementCandidates(this.graph,m.id)){
   const ghost=createModuleObject({...m,position:pose.position,rotationY:pose.rotationY});
   ghost.traverse(c=>{const mats=(c as THREE.Mesh).material;if(mats){for(const mat of Array.isArray(mats)?mats:[mats]){mat.transparent=true;mat.opacity=.18;mat.depthWrite=false;if(mat instanceof THREE.MeshStandardMaterial)mat.color.setHex(0x27b990);}}});this.guides.add(ghost);
  }
 }
 private worldPort(id:string,port:string){const o=this.objects.get(id),m=this.graph.modules.get(id),p=m?MODULES[m.type].ports.find(p=>p.id===port):null;if(!o||!p)return null;o.updateWorldMatrix(true,false);return o.localToWorld(new THREE.Vector3(...p.position));}
 private refreshLinks(){
  for(const c of [...this.links.children]){this.links.remove(c);disposeObject(c);}
  for(const e of this.graph.connections.values()){
   if(e.signal==='structural')continue;
   let o:THREE.Object3D;
   if(e.signal==='power'){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(39),3));
    o=new THREE.Line(geo,new THREE.LineBasicMaterial({color:e.fromPortId==='return-out'?0x344955:0xe77960}));
   }else o=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,1,12),new THREE.MeshStandardMaterial({color:0xb1c5cb,metalness:.6,roughness:.3}));
   o.userData.edge=e;this.links.add(o);
  }
  this.updateLinks();
 }
 private updateLinks(){
  for(const o of this.links.children){
   const e=o.userData.edge,a=this.worldPort(e.fromModuleId,e.fromPortId),b=this.worldPort(e.toModuleId,e.toPortId);if(!a||!b)continue;
   if(e.signal==='power'){
    const positions=(o as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<=12;i++){const t=i/12;positions.setXYZ(i,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t+.13*4*t*(1-t),a.z+(b.z-a.z)*t);}positions.needsUpdate=true;(o as THREE.Line).geometry.computeBoundingSphere();
   }else{const delta=b.clone().sub(a),len=delta.length();o.visible=len>.012;o.position.copy(a).lerp(b,.5);o.scale.set(1,len,1);if(len)o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
  }
 }
 private updateRay(x:number,y:number){const r=this.canvas.getBoundingClientRect();this.pointer.set((x-r.left)*2/r.width-1,1-(y-r.top)*2/r.height);this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);this.ray.setFromCamera(this.pointer,this.camera);}
 private cast(x:number,y:number){this.updateRay(x,y);return this.ray.intersectObjects([...this.objects.values()],true);}
 private bindPointer(){
  this.canvas.addEventListener('pointerdown',e=>{
   if(this.drag){if(this.drag.pointer!==e.pointerId)this.cancelDrag();return;}
   if(e.button!==0)return;
   const hit=this.cast(e.clientX,e.clientY)[0];const id=hit?.object.userData.moduleId as string|undefined;
   if(!id){this.clearSelection();return;}
   // Capture before OrbitControls: a part gesture must never rotate the camera.
   e.stopImmediatePropagation();e.preventDefault();this.selectById(id);
   if(!this.hooks.canEdit())return;
   const m=this.graph.modules.get(id)!;this.plane.constant=-m.position[1];const point=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.plane,point))return;
   const originals=new Map<string,{position:Vector3Tuple;rotationY:number}>();for(const member of descendants(this.graph,id)){const n=this.graph.modules.get(member)!;originals.set(member,{position:[...n.position],rotationY:n.rotationY});}
   const requiresHold=this.hooks.requiresHoldToMove(id);
   this.drag={pointer:e.pointerId,id,start:new THREE.Vector2(e.clientX,e.clientY),origin:[...m.position],yaw:m.rotationY,offset:new THREE.Vector3(...m.position).sub(point),originals,requiresHold,ready:!requiresHold,cancelled:false,changed:false,maxDistance:0,pose:null};
   this.controls.enabled=false;this.canvas.setPointerCapture(e.pointerId);
   if(requiresHold)this.holdTimer=window.setTimeout(()=>{if(this.drag?.pointer!==e.pointerId||this.drag.cancelled)return;this.drag.ready=true;this.highlight(id,true);this.hooks.onHoldReady?.(id);},HOLD_MS);
  },{capture:true});
  this.canvas.addEventListener('pointermove',e=>{
   const d=this.drag;if(!d||d.pointer!==e.pointerId)return;e.stopImmediatePropagation();
   const distance=d.start.distanceTo(new THREE.Vector2(e.clientX,e.clientY));d.maxDistance=Math.max(d.maxDistance,distance);
   if(!d.ready){if(distance>10){d.cancelled=true;clearTimeout(this.holdTimer);}return;}
   if(d.cancelled||!d.changed&&distance<7)return;
   this.updateRay(e.clientX,e.clientY);const p=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.plane,p))return;p.add(d.offset);
   const raw:Vector3Tuple=[Math.max(-45,Math.min(45,p.x)),d.origin[1],Math.max(-45,Math.min(45,p.z))];
   const pose=this.hooks.getSnapPose(d.id,raw);d.pose=pose;d.changed=true;
   const position=pose?.position??raw,yaw=pose?.rotationY??d.yaw;
   for(const [id,original] of d.originals){
    const delta:Vector3Tuple=[original.position[0]-d.origin[0],original.position[1]-d.origin[1],original.position[2]-d.origin[2]];
    const m=this.graph.modules.get(id)!;m.position=add(position,rotateY(delta,angleDelta(yaw,d.yaw)));m.rotationY=original.rotationY+angleDelta(yaw,d.yaw);
    const o=this.objects.get(id)!;o.position.set(...m.position);o.rotation.y=m.rotationY;
   }
   this.highlight(d.id,Boolean(pose));this.updateLinks();this.dirty=true;
  },{capture:true});
  this.canvas.addEventListener('pointerup',e=>{if(this.drag?.pointer===e.pointerId){e.stopImmediatePropagation();this.finishDrag(false);}}, {capture:true});
  this.canvas.addEventListener('pointercancel',e=>{if(this.drag?.pointer===e.pointerId)this.finishDrag(true);});
  this.canvas.addEventListener('lostpointercapture',e=>{if(this.drag?.pointer===e.pointerId)this.finishDrag(true);});
  addEventListener('blur',()=>this.cancelDrag());
 }
 private tint(mat:THREE.MeshStandardMaterial,color:number,intensity:number){
  if(mat.userData.baseEmission===undefined){mat.userData.baseEmission=mat.emissive.getHex();mat.userData.baseIntensity=mat.emissiveIntensity;}
  if(mat.userData.baseEmission){mat.emissive.setHex(mat.userData.baseEmission);mat.emissiveIntensity=mat.userData.baseIntensity;}else{mat.emissive.setHex(color);mat.emissiveIntensity=intensity;}
 }
 private highlight(id:string,on:boolean){const o=this.objects.get(id);o?.traverse(c=>{const m=(c as THREE.Mesh).material;if(m instanceof THREE.MeshStandardMaterial){this.tint(m,on?0x21af89:0x173f4b,on?.22:.06);}});this.dirty=true;}
 cancelDrag(){if(this.drag)this.finishDrag(true);}
 private finishDrag(cancelled:boolean){
  const d=this.drag;if(!d)return;this.drag=null;clearTimeout(this.holdTimer);this.controls.enabled=true;
  if(cancelled){for(const [id,original] of d.originals){const m=this.graph.modules.get(id);if(m){m.position=[...original.position];m.rotationY=original.rotationY;}const o=this.objects.get(id);o?.position.set(...original.position);if(o)o.rotation.y=original.rotationY;}}
  else if(d.changed)this.hooks.onDrop(d.id,d.pose);
  else if(d.maxDistance<7&&!d.cancelled&&!d.requiresHold||d.maxDistance<7&&!d.cancelled&&!d.ready){
   const now=performance.now();if(this.lastTap.id===d.id&&now-this.lastTap.at<320){this.lastTap={id:'',at:0};this.hooks.onDoubleTap?.(d.id);}else this.lastTap={id:d.id,at:now};
  }
  this.highlight(d.id,false);if(this.canvas.hasPointerCapture(d.pointer))this.canvas.releasePointerCapture(d.pointer);
  if(!cancelled&&d.changed)this.hooks.onGraphChanged();this.refreshLinks();this.refreshGuides();this.dirty=true;
 }
 private loop(now:number){
  requestAnimationFrame(t=>this.loop(t));const dt=Math.max(0,Math.min(.1,(now-this.last)/1000));this.last=now;
  const running=this.mode!=='build';let scale=1;
  if(this.mode==='run'&&this.drive){
   const rear=first(this.graph,'drive-axle');const enabled=Boolean(rear&&(this.state.rpm.get(rear.id)??0)!==0);
   const s=this.drive.step(dt,enabled);scale=s.baseSpeed>0?s.speed/s.baseSpeed:0;
   for(const [id,local] of this.assemblyOrigins){const o=this.objects.get(id)!;o.position.set(...add(s.position,rotateY(local.position,s.yaw)));o.rotation.y=s.yaw+local.yaw;}
   for(const m of this.graph.modules.values()){
    const o=this.objects.get(m.id)!;
    if(m.type==='wheel'&&m.slotKey?.startsWith('wheel-')){
     const key=m.slotKey.slice(6) as 'fl'|'fr'|'rl'|'rr';
     if(key==='fl'||key==='fr')o.rotation.y+=key==='fl'?s.steering.left:s.steering.right;
     o.traverse(c=>{if(c.userData.rotor)c.rotation.z=s.wheelAngle[key];});
    }
    if(m.type==='front-axle')o.traverse(c=>{if(c.userData.steeringSide)c.rotation.y=c.userData.steeringSide===1?s.steering.left:s.steering.right;});
   }
   if(now-this.lastNotice>180){this.lastNotice=now;this.hooks.onDriveUpdate?.(s);}
   this.updateLinks();
  }
  if(running)for(const m of this.graph.modules.values()){
   const o=this.objects.get(m.id)!;o.traverse(c=>{
    if(!c.userData.rotor||this.mode==='run'&&m.type==='wheel')return;
    let speed=this.state.rpm.get(m.id)??0;
    if(c.userData.rpmSource==='input'){const e=this.graph.incoming(m.id,'rotation')[0];speed=e?this.state.rpm.get(e.fromModuleId)??0:0;}
    if(m.type==='wheel'||m.type==='drive-axle'||m.type==='differential'&&c.userData.rotorAxis==='z')speed=-speed;
    if(this.mode==='run'){speed*=scale;if(m.type==='drive-axle'&&c.userData.side&&this.drive){const s=this.drive.snapshot();speed=-(c.userData.side===1?s.wheelRpm.rl:s.wheelRpm.rr);}}
    const axis=c.userData.rotorAxis as 'x'|'y'|'z';c.rotation[axis]+=speed/60*2*Math.PI*dt;
   });
  }
  if(running||this.dirty){this.controls.update();this.renderer.render(this.scene,this.camera);this.dirty=false;}
 }
 private resize(){const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();this.dirty=true;}
}
