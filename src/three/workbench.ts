import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { portsForModule, ROAD_TYPES } from '../core/moduleRegistry';
import { ConnectionGraph } from '../core/connectionGraph';
import { descendants, isMounted, movementRoot, placementCandidates } from '../core/assembly';
import { add, angleDelta, rotateY } from '../core/layout';
import { VehicleDrive } from '../core/driving';
import { roadCenterline } from '../core/worldRoutes';
import { FleetSimulation } from '../core/fleet';
import { vehicleForModule, vehicleParts } from '../core/vehicles';
import { cargoCarrier } from '../core/experiments';
import type { ModuleInstance, Placement, SimulationState, Vector3Tuple } from '../core/types';
import { createModuleObject, disposeObject } from './moduleFactory';

export type SnapPose=Placement;
export interface WorkbenchHooks {
 onSelect(id:string|null):void;
 onGraphChanged():void;
 canEdit():boolean;
 isMovementLocked(id:string):boolean;
 getSnapPose(id:string,position:Vector3Tuple):Placement|null;
 onDrop(id:string,pose:Placement|null):void;
 onPlaceTarget?(id:string,pose:Placement):void;
 onDestination?(roadId:string):void;
 onMissionsCompleted?(ids:string[]):void;
 onDriveUpdate?(status:ReturnType<VehicleDrive['snapshot']>):void;
}
interface Drag {
 pointer:number;id:string;start:THREE.Vector2;origin:Vector3Tuple;yaw:number;offset:THREE.Vector3;
 originals:Map<string,{position:Vector3Tuple;rotationY:number}>;
 changed:boolean;pose:Placement|null;
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
 private destinations=new THREE.Group();
 private inspection:string|null=null;
 private pendingTap:{pointer:number;x:number;y:number;pose?:Placement;roadId?:string;id?:string;cancelled:boolean}|null=null;
 private ray=new THREE.Raycaster();
 private pointer=new THREE.Vector2();
 private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 private drag:Drag|null=null;
 private moveIntent:{id:string}|null=null;
 private state=emptyState();
 private mode:'build'|'test'|'run'='build';
 private fleet:FleetSimulation|null=null;
 private starts=new Map<string,Map<string,{position:Vector3Tuple;rotationY:number;parentId?:string;slotKey?:string}>>();
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
  this.scene.add(this.links,this.guides,this.destinations);
  this.camera.position.set(11,10,13);
  this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=false;this.controls.minDistance=1.3;this.controls.maxDistance=90;this.controls.maxPolarAngle=Math.PI*.48;this.controls.target.set(0,0,0);
  this.controls.addEventListener('change',()=>{this.dirty=true;});
  this.bindPointer();
  new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();
  requestAnimationFrame(t=>this.loop(t));
 }
 addInstance(m:ModuleInstance){this.graph.addModule(m);this.rebuildFromGraph(m.id);this.hooks.onGraphChanged();}
 rebuildFromGraph(keepSelection:string|null=this.selectedId){
  this.cancelDrag();this.moveIntent=null;
  for(const o of this.objects.values()){this.scene.remove(o);disposeObject(o);}this.objects.clear();
  for(const m of this.graph.modules.values()){const owner=vehicleForModule(this.graph,m),profile=owner?this.graph.vehicles.get(owner):undefined;const cargo=owner&&cargoCarrier(this.graph,owner)?.id===m.id?profile?.cargo:0;const o=createModuleObject(m,{cargo});o.visible=!profile?.parked;this.objects.set(m.id,o);this.scene.add(o);}
  this.refreshLinks();this.selectById(keepSelection);this.dirty=true;
 }
 selectById(id:string|null){
  if(this.moveIntent&&id!==this.moveIntent.id)this.moveIntent=null;
  this.selectedId=id&&this.graph.modules.has(id)?id:null;
  if(this.inspection!==this.selectedId)this.inspection=null;
  for(const [key,obj] of this.objects)obj.traverse(c=>{
   const mat=(c as THREE.Mesh).material;
   if(mat instanceof THREE.MeshStandardMaterial){this.tint(mat,key===this.selectedId?0x173f4b:0,key===this.selectedId?.06:0);}
  });
  this.applyInspection();this.refreshGuides();this.hooks.onSelect(this.selectedId);this.dirty=true;
 }
 clearSelection(){this.selectById(null);}
 movementIntent(){return this.moveIntent?{...this.moveIntent}:null;}
 requestMove(id:string){
  const module=this.graph.modules.get(id);if(!module||!this.hooks.canEdit()||!ROAD_TYPES.has(module.type))return false;
  this.cancelDrag();this.moveIntent={id};this.selectById(id);
  for(const member of descendants(this.graph,id))this.highlight(member,true);
  return true;
 }
 cancelMovement(){this.cancelDrag();this.moveIntent=null;this.selectById(this.selectedId);}

 updateState(state:SimulationState){this.state=state;this.dirty=true;}
 setSimulation(mode:'build'|'test'|'run',state:SimulationState,ids:string[]=[]){
  this.cancelMovement();
  if(this.mode==='run'&&mode!=='run'){this.fleet?.stop();this.fleet=null;this.hooks.onGraphChanged();}
  this.mode=mode;this.state=state;
  if(mode==='run'){
   this.starts.clear();
   for(const id of ids){const members=new Map<string,{position:Vector3Tuple;rotationY:number;parentId?:string;slotKey?:string}>();for(const key of descendants(this.graph,id)){const m=this.graph.modules.get(key)!;members.set(key,{position:[...m.position],rotationY:m.rotationY,parentId:m.parentId,slotKey:m.slotKey});}this.starts.set(id,members);}
   this.fleet=new FleetSimulation(this.graph,ids,state);
  }
  this.refreshGuides();this.dirty=true;
 }
 returnToStart(id=this.graph.activeVehicleId){
  const saved=id?this.starts.get(id):undefined;if(this.mode!=='build'||!saved)return false;
  const pose=saved.get(id!),car=this.graph.modules.get(id!);if(!pose||!car)return false;
  this.moveAssembly(id!,pose.position,pose.rotationY);car.parentId=pose.parentId;car.slotKey=pose.slotKey;
  for(const key of descendants(this.graph,id!)){const m=this.graph.modules.get(key)!,initial=saved.get(key);if(m.type==='trailer'&&initial)this.moveAssembly(key,m.position,initial.rotationY);}
  this.rebuildFromGraph(id);this.hooks.onGraphChanged();this.focusAll();return true;
 }
 inspectPart(id:string){this.inspection=id;this.selectById(id);this.focusSelected();this.applyInspection();}
 clearInspection(){this.inspection=null;this.applyInspection();this.dirty=true;}
 inspectionId(){return this.inspection;}
 private applyInspection(){
  const selected=this.inspection?this.graph.modules.get(this.inspection):undefined,owner=vehicleForModule(this.graph,selected);
  for(const [id,o] of this.objects)o.traverse(c=>{const material=(c as THREE.Mesh).material;if(!material)return;for(const mat of Array.isArray(material)?material:[material]){
   if(mat.userData.originalOpacity===undefined){mat.userData.originalOpacity=mat.opacity;mat.userData.originalTransparent=mat.transparent;mat.userData.originalDepthWrite=mat.depthWrite;}
   const fade=Boolean(selected&&id!==selected.id&&vehicleForModule(this.graph,this.graph.modules.get(id))===owner);
   mat.opacity=fade?.10:mat.userData.originalOpacity;mat.transparent=fade||mat.userData.originalTransparent;mat.depthWrite=fade?false:mat.userData.originalDepthWrite;
  }});
 }
 setDestinations(roadIds:string[]){
  for(const c of [...this.destinations.children]){this.destinations.remove(c);disposeObject(c);}
  if(this.mode!=='build')return;
  for(const id of roadIds){const road=this.graph.modules.get(id);if(!road)continue;const line=roadCenterline(road),point=line[Math.floor(line.length/2)];if(!point)continue;
   const flag=new THREE.Mesh(new THREE.ConeGeometry(.32,.75,4),new THREE.MeshStandardMaterial({color:0xf3bd4c,emissive:0x725000,emissiveIntensity:.2}));flag.position.set(point[0],point[1]+1.7,point[2]);flag.userData.roadId=id;this.destinations.add(flag);
  }this.dirty=true;
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
 restingHeight(id:string):number {
  const root=this.graph.modules.get(id);if(!root)return 0;
  const box=new THREE.Box3();for(const member of descendants(this.graph,id)){const object=this.objects.get(member);if(object)box.expandByObject(object);}
  return box.isEmpty()?root.position[1]:root.position[1]-box.min.y;
 }
 loosePlacement(id:string):Vector3Tuple|null {
  const root=this.graph.modules.get(id);if(!root)return null;
  const members=new Set(descendants(this.graph,id)),box=new THREE.Box3();
  for(const member of members){const object=this.objects.get(member);if(object)box.expandByObject(object);}
  if(box.isEmpty())return null;
  const occupied=[...this.objects].filter(([key])=>!members.has(key)).map(([,object])=>new THREE.Box3().setFromObject(object).expandByScalar(.18));
  const y=root.position[1]-box.min.y;
  for(let radius=2.6;radius<60;radius+=1.2)for(let step=0;step<16;step++){
   const angle=-Math.PI/2+step*Math.PI/8,position:Vector3Tuple=[root.position[0]+Math.cos(angle)*radius,y,root.position[2]+Math.sin(angle)*radius];
   const candidate=box.clone().translate(new THREE.Vector3(position[0]-root.position[0],y-root.position[1],position[2]-root.position[2]));
   if(candidate.min.x < -45||candidate.max.x > 45||candidate.min.z < -45||candidate.max.z > 45)continue;
   if(occupied.every(other=>!candidate.intersectsBox(other)))return position;
  }
  return null;
 }
 setCamera(name:'iso'|'top'|'front'|'rear'|'left'|'right'){
  const t=this.controls.target.clone(),d=this.camera.position.distanceTo(t);
  const offsets={iso:[.70,.68,1],top:[0,1,.001],front:[1,.45,0],rear:[-1,.45,0],left:[0,.45,1],right:[0,.45,-1]}[name];
  this.camera.position.copy(t).add(new THREE.Vector3(...offsets).normalize().multiplyScalar(d));this.camera.lookAt(t);this.controls.update();this.camera.updateMatrixWorld();this.dirty=true;
 }
 focusAll(){
  if(!this.objects.size){this.controls.target.set(0,0,0);this.camera.position.set(9,9,11);this.controls.update();return;}
  const box=new THREE.Box3();for(const o of this.objects.values())if(o.visible)box.expandByObject(o);
  this.fitBox(box,7);
 }
 focusVehicle(id:string){const box=new THREE.Box3();for(const m of vehicleParts(this.graph,id)){const o=this.objects.get(m.id);if(o?.visible)box.expandByObject(o);}if(!box.isEmpty())this.fitBox(box,7);}
 focusSelected(){const o=this.selectedId?this.objects.get(this.selectedId):null;if(o)this.fitBox(new THREE.Box3().setFromObject(o),this.inspection?3:1.6);}
 private fitBox(box:THREE.Box3,min:number){
  const center=box.getCenter(new THREE.Vector3());
  const direction=new THREE.Vector3(.70,.68,1).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
  const tanV=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanH=tanV*this.camera.aspect;let radius=min;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(center),depth=p.dot(direction);radius=Math.max(radius,depth+Math.abs(p.dot(right))/tanH*1.15,depth+Math.abs(p.dot(up))/tanV*1.15);}
  this.controls.target.copy(center);this.camera.position.copy(center).add(direction.multiplyScalar(radius));this.camera.lookAt(center);this.controls.update();this.camera.updateMatrixWorld();this.dirty=true;
 }
 renderedTransform(id:string){const o=this.objects.get(id);return o?{position:o.position.toArray(),rotationY:o.rotation.y}:null;}
 mechanism(id:string){const o=this.objects.get(id);const result:any[]=[];o?.traverse(c=>{if(c.userData.rotor||c.userData.steeringSide)result.push({name:c.userData.rpmSource,axis:c.userData.rotorAxis,teeth:c.userData.teeth,rotation:c.rotation.toArray().slice(0,3),side:c.userData.side??c.userData.steeringSide});});return result;}
 telemetry(id=this.graph.activeVehicleId){return id?this.fleet?.drives.get(id)?.snapshot()??null:null;}
 fleetTelemetry(){return this.fleet?.snapshots()??{};}
 renderedBounds(id:string){const o=this.objects.get(id);if(!o)return null;const b=new THREE.Box3().setFromObject(o);return {min:b.min.toArray(),max:b.max.toArray()};}
 screenPointForWorld(position:Vector3Tuple){this.camera.updateMatrixWorld();const p=new THREE.Vector3(...position).project(this.camera),r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
 screenPointForModule(id:string){
  const o=this.objects.get(id);if(!o||!o.visible)return null;
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
  if(m.type==='car-base'||ROAD_TYPES.has(m.type)||isMounted(this.graph,m))return;
  for(const pose of placementCandidates(this.graph,m.id)){
   const ghost=createModuleObject({...m,position:pose.position,rotationY:pose.rotationY});
   ghost.traverse(c=>{const mats=(c as THREE.Mesh).material;if(mats){for(const mat of Array.isArray(mats)?mats:[mats]){mat.transparent=true;mat.opacity=.18;mat.depthWrite=false;if(mat instanceof THREE.MeshStandardMaterial)mat.color.setHex(0x27b990);}}});this.guides.add(ghost);
   const target=new THREE.Mesh(new THREE.SphereGeometry(.23,16,10),new THREE.MeshBasicMaterial({color:0x169f79,transparent:true,opacity:.65,depthTest:false}));target.position.set(pose.position[0],pose.position[1]+.30,pose.position[2]);target.renderOrder=5;target.userData.placement=pose;target.userData.partId=m.id;this.guides.add(target);
  }
 }
 private worldPort(id:string,port:string){const o=this.objects.get(id),m=this.graph.modules.get(id),p=m?portsForModule(m).find(p=>p.id===port):null;if(!o||!p)return null;o.updateWorldMatrix(true,false);return o.localToWorld(new THREE.Vector3(...p.position));}
 private refreshLinks(){
  for(const c of [...this.links.children]){this.links.remove(c);disposeObject(c);}
  for(const e of this.graph.connections.values()){
   if(e.signal==='structural')continue;
   let o:THREE.Object3D;
   if(e.signal==='power'){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(39),3));
    o=new THREE.Line(geo,new THREE.LineBasicMaterial({color:e.fromPortId==='return-out'?0x344955:0xe77960}));
   }else o=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,1,12),new THREE.MeshStandardMaterial({color:0xb1c5cb,metalness:.6,roughness:.3}));
   o.userData.edge=e;if(e.signal==='power'){const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color:0xffcf57}));dot.name='flow';o.add(dot);}this.links.add(o);
  }
  this.updateLinks();
 }
 private updateLinks(){
  for(const o of this.links.children){
   const e=o.userData.edge,a=this.worldPort(e.fromModuleId,e.fromPortId),b=this.worldPort(e.toModuleId,e.toPortId);if(!a||!b)continue;
   const source=this.objects.get(e.fromModuleId),target=this.objects.get(e.toModuleId);o.visible=Boolean(source?.visible&&target?.visible);
   if(e.signal==='power'){
    const positions=(o as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<=12;i++){const t=i/12;positions.setXYZ(i,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t+.13*4*t*(1-t),a.z+(b.z-a.z)*t);}positions.needsUpdate=true;(o as THREE.Line).geometry.computeBoundingSphere();
   }else{const delta=b.clone().sub(a),len=delta.length();o.visible=len>.012;o.position.copy(a).lerp(b,.5);o.scale.set(1,len,1);if(len)o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
  }
 }
 private updateRay(x:number,y:number){const r=this.canvas.getBoundingClientRect();this.pointer.set((x-r.left)*2/r.width-1,1-(y-r.top)*2/r.height);this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);this.ray.setFromCamera(this.pointer,this.camera);}
 private cast(x:number,y:number){this.updateRay(x,y);const hits=this.ray.intersectObjects([...this.objects.values()].filter(o=>o.visible),true);if(this.inspection){const selected=hits.filter(h=>h.object.userData.moduleId===this.inspection);if(selected.length)return selected;}return hits;}
 private bindPointer(){
  this.canvas.addEventListener('pointerdown',e=>{
   if(this.pendingTap){this.pendingTap.cancelled=true;return;}
   if(this.drag){if(this.drag.pointer!==e.pointerId)this.cancelDrag();return;}
   if(e.button!==0)return;
   this.updateRay(e.clientX,e.clientY);
   const target=this.hooks.canEdit()?this.ray.intersectObjects([...this.guides.children.filter(o=>o.userData.placement),...this.destinations.children],false)[0]?.object:undefined;
   if(target){this.pendingTap={pointer:e.pointerId,x:e.clientX,y:e.clientY,pose:target.userData.placement,roadId:target.userData.roadId,id:target.userData.partId,cancelled:false};this.controls.enabled=false;this.canvas.setPointerCapture(e.pointerId);e.stopImmediatePropagation();e.preventDefault();return;}
   const hit=this.cast(e.clientX,e.clientY)[0],hitId=hit?.object.userData.moduleId as string|undefined;
   if(!hitId){this.clearSelection();return;}
   // A tap selects the actual part. A drag moves its complete physically mounted assembly.
   const intent=this.moveIntent,belongs=Boolean(intent&&descendants(this.graph,intent.id).includes(hitId));
   const id=belongs?intent!.id:movementRoot(this.graph,hitId);
   e.stopImmediatePropagation();e.preventDefault();this.selectById(belongs?intent!.id:hitId);
   if(!this.hooks.canEdit()||this.hooks.isMovementLocked(id)&&this.moveIntent?.id!==id)return;
   const m=this.graph.modules.get(id)!;this.plane.constant=-m.position[1];const point=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.plane,point))return;
   const originals=new Map<string,{position:Vector3Tuple;rotationY:number}>();for(const member of descendants(this.graph,id)){const n=this.graph.modules.get(member)!;originals.set(member,{position:[...n.position],rotationY:n.rotationY});}
   this.drag={pointer:e.pointerId,id,start:new THREE.Vector2(e.clientX,e.clientY),origin:[...m.position],yaw:m.rotationY,offset:new THREE.Vector3(...m.position).sub(point),originals,changed:false,pose:null};
   this.controls.enabled=false;this.canvas.setPointerCapture(e.pointerId);
  },{capture:true});
  this.canvas.addEventListener('pointermove',e=>{
   if(this.pendingTap?.pointer===e.pointerId){if(Math.hypot(e.clientX-this.pendingTap.x,e.clientY-this.pendingTap.y)>7)this.pendingTap.cancelled=true;e.stopImmediatePropagation();return;}
   const d=this.drag;if(!d||d.pointer!==e.pointerId)return;e.stopImmediatePropagation();
   const distance=d.start.distanceTo(new THREE.Vector2(e.clientX,e.clientY));
   if(!d.changed&&distance<7)return;
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
  this.canvas.addEventListener('pointerup',e=>{if(this.pendingTap?.pointer===e.pointerId){const t=this.pendingTap;this.pendingTap=null;this.controls.enabled=true;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);e.stopImmediatePropagation();if(!t.cancelled){if(t.roadId)this.hooks.onDestination?.(t.roadId);else if(t.id&&t.pose)this.hooks.onPlaceTarget?.(t.id,t.pose);}return;}if(this.drag?.pointer===e.pointerId){e.stopImmediatePropagation();this.finishDrag(false);}}, {capture:true});
  this.canvas.addEventListener('pointercancel',e=>{if(this.pendingTap?.pointer===e.pointerId)this.cancelTap();if(this.drag?.pointer===e.pointerId)this.finishDrag(true);});
  this.canvas.addEventListener('lostpointercapture',e=>{if(this.pendingTap?.pointer===e.pointerId)this.cancelTap();if(this.drag?.pointer===e.pointerId)this.finishDrag(true);});
  addEventListener('blur',()=>this.cancelMovement());
 }
 private tint(mat:THREE.MeshStandardMaterial,color:number,intensity:number){
  if(mat.userData.baseEmission===undefined){mat.userData.baseEmission=mat.emissive.getHex();mat.userData.baseIntensity=mat.emissiveIntensity;}
  if(mat.userData.baseEmission){mat.emissive.setHex(mat.userData.baseEmission);mat.emissiveIntensity=mat.userData.baseIntensity;}else{mat.emissive.setHex(color);mat.emissiveIntensity=intensity;}
 }
 private highlight(id:string,on:boolean){const o=this.objects.get(id);o?.traverse(c=>{const m=(c as THREE.Mesh).material;if(m instanceof THREE.MeshStandardMaterial){this.tint(m,on?0x21af89:0x173f4b,on?.22:.06);}});this.dirty=true;}
 private cancelTap(){const t=this.pendingTap;this.pendingTap=null;this.controls.enabled=true;if(t&&this.canvas.hasPointerCapture(t.pointer))this.canvas.releasePointerCapture(t.pointer);}
 cancelDrag(){this.cancelTap();if(this.drag)this.finishDrag(true);}
 private finishDrag(cancelled:boolean){
  const d=this.drag;if(!d)return;this.drag=null;this.controls.enabled=true;
  if(cancelled||d.changed)this.moveIntent=null;
  if(cancelled){for(const [id,original] of d.originals){const m=this.graph.modules.get(id);if(m){m.position=[...original.position];m.rotationY=original.rotationY;}const o=this.objects.get(id);o?.position.set(...original.position);if(o)o.rotation.y=original.rotationY;}}
  else if(d.changed)this.hooks.onDrop(d.id,d.pose);
  this.highlight(d.id,false);if(this.canvas.hasPointerCapture(d.pointer))this.canvas.releasePointerCapture(d.pointer);
  if(!cancelled&&d.changed)this.hooks.onGraphChanged();this.selectById(this.selectedId);this.refreshLinks();this.dirty=true;
 }
 private loop(now:number){
  requestAnimationFrame(t=>this.loop(t));const dt=Math.max(0,Math.min(.1,(now-this.last)/1000));this.last=now;
  const running=this.mode!=='build';
  if(this.mode==='run'&&this.fleet){
   const snapshots=this.fleet.step(dt,this.state);
   for(const m of this.graph.modules.values()){
    const o=this.objects.get(m.id);if(!o)continue;o.position.set(...m.position);o.rotation.y=m.rotationY;
    const owner=vehicleForModule(this.graph,m),s=owner?snapshots[owner]:undefined;if(!s)continue;
    if(m.type==='wheel'&&m.slotKey?.startsWith('wheel-')){const key=m.slotKey.slice(6);if(key==='fl'||key==='fr')o.rotation.y+=key==='fl'?s.steering.left:s.steering.right;o.traverse(c=>{if(c.userData.rotor)c.rotation.z=s.wheelAngle[key]??0;});}
    if(m.type==='front-axle')o.traverse(c=>{if(c.userData.steeringSide)c.rotation.y=c.userData.steeringSide===1?s.steering.left:s.steering.right;});
   }
   if(this.fleet.completed.length)this.hooks.onMissionsCompleted?.(this.fleet.completed.splice(0));
   if(now-this.lastNotice>180){this.lastNotice=now;const s=this.telemetry();if(s)this.hooks.onDriveUpdate?.(s);}
   this.updateLinks();
  }
  if(running)for(const m of this.graph.modules.values()){
   const o=this.objects.get(m.id)!;if(!o.visible)continue;const owner=vehicleForModule(this.graph,m),drive=owner?this.fleet?.drives.get(owner):undefined,s=drive?.snapshot();
   o.traverse(c=>{
    if(!c.userData.rotor||this.mode==='run'&&m.type==='wheel')return;
    let speed=this.state.rpm.get(m.id)??0;
    if(c.userData.rpmSource==='input'){const e=this.graph.incoming(m.id,'rotation')[0];speed=e?this.state.rpm.get(e.fromModuleId)??0:0;}
    if(m.type==='wheel'||m.type==='drive-axle'||m.type==='differential'&&c.userData.rotorAxis==='z')speed=-speed;
    if(this.mode==='run'){speed*=s&&s.baseSpeed>0?s.speed/s.baseSpeed:0;if(m.type==='drive-axle'&&c.userData.side&&s)speed=-(c.userData.side===1?s.wheelRpm.rl:s.wheelRpm.rr);}
    const axis=c.userData.rotorAxis as 'x'|'y'|'z';c.rotation[axis]+=speed/60*2*Math.PI*dt;
   });
  }
  for(const o of this.links.children){const dot=o.getObjectByName('flow'),e=o.userData.edge;if(!dot)continue;const owner=vehicleForModule(this.graph,this.graph.modules.get(e.fromModuleId)),motor=owner?vehicleParts(this.graph,owner,'motor')[0]:undefined;dot.visible=running&&Boolean(motor&&this.state.rpm.get(motor.id));if(dot.visible){const a=this.worldPort(e.fromModuleId,e.fromPortId),b=this.worldPort(e.toModuleId,e.toPortId);if(a&&b){const t=(now/950)%1;dot.position.copy(a).lerp(b,t);dot.position.y+=.13*4*t*(1-t);}}}
  if(running||this.dirty){this.controls.update();this.renderer.render(this.scene,this.camera);this.dirty=false;}
 }
 private resize(){const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();this.dirty=true;}
}
