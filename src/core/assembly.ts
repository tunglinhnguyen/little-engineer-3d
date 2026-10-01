import { ConnectionGraph, normalizeConnection } from './connectionGraph';
import { CAR_PALETTE, CAR_PART_TYPES, CONTROL_TYPES, MODULES, portsForModule, ROAD_TYPES } from './moduleRegistry';
import { add, angleDelta, CHASSIS_HEIGHT, distanceXZ, HALF_TRACK, LOCAL_SLOTS, ROAD_HEIGHT, ROAD_WIDTH, rotateY, SNAP_DISTANCE, WHEEL_LOCAL, WHEEL_SLOTS, WHEELBASE } from './layout';
import type { ModuleInstance, ModuleType, Placement, Vector3Tuple } from './types';
import { roadCenterline, projectPolyline, pointAtDistance } from './worldRoutes';
import { axleWheelKeys, chassisSlots, newVehicle, TRAILER_SLOTS, vehicleForModule, vehicleKind, vehicleSpec, type MountSlot } from './vehicles';

export const REQUIRED_PARTS=12;
export const UNIQUE_CAR=new Set<ModuleType>(CAR_PALETTE.filter(t=>t!=='wheel'));
export const first=(g:ConnectionGraph,type:ModuleType)=>[...g.modules.values()].find(m=>m.type===type);
export const occupant=(g:ConnectionGraph,parentId:string,slotKey:string,except?:string)=>[...g.modules.values()].find(m=>m.parentId===parentId&&m.slotKey===slotKey&&m.id!==except);
export const isCarPart=(m:ModuleInstance)=>CAR_PART_TYPES.has(m.type);

export function mountingSlots(g:ConnectionGraph,parent:ModuleInstance):MountSlot[]{
 if(parent.type==='car-base')return chassisSlots(vehicleKind(g,parent.id));
 if(parent.type==='hitch')return [{key:'trailer',type:'trailer',position:[0,0,0],label:'Chốt rơ-moóc',required:false}];
 if(parent.type==='trailer')return TRAILER_SLOTS;
 const axle=parent.type==='front-axle'?'trước':parent.type==='drive-axle'?'sau':parent.slotKey==='trailer-front-axle'?'rơ-moóc trước':parent.slotKey==='trailer-rear-axle'?'rơ-moóc sau':'trục phụ';
 return axleWheelKeys(parent).map(key=>({key,type:'wheel',position:[0,0,key.endsWith('l')?HALF_TRACK:-HALF_TRACK],label:'Bánh '+axle+(key.endsWith('l')?' trái':' phải'),required:true}));
}

export function slotPose(g:ConnectionGraph,parentId:string,slotKey:string):Placement|null {
 const parent=g.modules.get(parentId);if(!parent)return null;
 const slot=mountingSlots(g,parent).find(s=>s.key===slotKey);if(!slot)return null;
 return {position:add(parent.position,rotateY(slot.position,parent.rotationY)),rotationY:parent.rotationY,parentId,slotKey,label:slot.label===slot.key?MODULES[slot.type].name:slot.label};
}

export function roadsidePose(road:ModuleInstance,slotKey:string):Placement|null {
 if(!ROAD_TYPES.has(road.type)||!['side:-1','side:1'].includes(slotKey))return null;
 const points=roadCenterline(road),mid=points[Math.floor(points.length/2)],p=projectPolyline(points,mid),yaw=Math.atan2(-p.tangent[2],p.tangent[0]);
 const side=slotKey==='side:1'?1:-1,position=add(mid,rotateY([0,0,side*((road.type==='road-wide-curve'?4.4:ROAD_WIDTH)/2+.30)],yaw));position[1]=road.position[1];
 return {position,rotationY:yaw+Math.PI/2,parentId:road.id,slotKey,label:'Lề đường'};
}
export function isMounted(g:ConnectionGraph,m:ModuleInstance|undefined):boolean {
 if(!m||!m.parentId||!m.slotKey)return false;
 if(m.type==='car-base')return ROAD_TYPES.has(g.modules.get(m.parentId)?.type as ModuleType)&&m.slotKey==='road';
 if(CONTROL_TYPES.has(m.type)){const road=g.modules.get(m.parentId),p=road?roadsidePose(road,m.slotKey):null;return Boolean(p&&distanceXZ(m.position,p.position)<.015&&Math.abs(m.position[1]-p.position[1])<.015&&Math.abs(angleDelta(m.rotationY,p.rotationY))<.015);}
 const parent=g.modules.get(m.parentId);if(!parent||!mountingSlots(g,parent).some(s=>s.key===m.slotKey&&s.type===m.type))return false;
 const owner=vehicleForModule(g,parent);if(m.vehicleId&&owner&&m.vehicleId!==owner)return false;
 const pose=slotPose(g,m.parentId,m.slotKey);
 return Boolean(pose&&distanceXZ(m.position,pose.position)<.015&&Math.abs(m.position[1]-pose.position[1])<.015&&(m.type==='trailer'||Math.abs(angleDelta(m.rotationY,pose.rotationY))<.015));
}
export function isInstalled(g:ConnectionGraph,m:ModuleInstance|undefined):boolean {
 if(!m||!isCarPart(m))return false;
 if(m.type==='car-base')return true;
 const seen=new Set<string>();let node=m;
 while(node.parentId){
  if(seen.has(node.id)||!isMounted(g,node))return false;seen.add(node.id);
  const p=g.modules.get(node.parentId);if(!p)return false;
  if(p.type==='car-base')return true;
  node=p;
 }
 return false;
}
export function descendants(g:ConnectionGraph,id:string):string[]{
 const result=[id];const seen=new Set(result);
 for(let i=0;i<result.length;i++) for(const m of g.modules.values()){
  if(m.parentId===result[i]&&(isCarPart(m)||CONTROL_TYPES.has(m.type))&&m.type!=='car-base'&&!seen.has(m.id)){result.push(m.id);seen.add(m.id);}
 }
 return result;
}

// A mounted car part is a grab surface for its owning assembly, never a loose handle.
// Stop at the chassis even when the chassis itself is parked on a road.
export function movementRoot(g:ConnectionGraph,id:string):string {
 let node=g.modules.get(id);const seen=new Set([id]);
 while(node&&isCarPart(node)&&node.type!=='car-base'&&isMounted(g,node)){
  const parent=g.modules.get(node.parentId!);
  if(!parent||!isCarPart(parent)||seen.has(parent.id))break;
  seen.add(parent.id);node=parent;
 }
 return node?.id??id;
}

export function placementCandidates(g:ConnectionGraph,id:string):Placement[]{
 const m=g.modules.get(id);if(!m)return [];
 if(isCarPart(m)&&m.type!=='car-base'){
  const poses:Placement[]=[];
  for(const parent of g.modules.values()){
   if(parent.id===id||descendants(g,id).includes(parent.id))continue;
   const owner=vehicleForModule(g,parent);if(m.vehicleId&&owner!==m.vehicleId)continue;
   if(owner&&g.vehicles.get(owner)?.parked)continue;
   for(const slot of mountingSlots(g,parent))if(slot.type===m.type&&!occupant(g,parent.id,slot.key,id)){const pose=slotPose(g,parent.id,slot.key);if(pose)poses.push(pose);}
  }return poses;
 }
 if(m.type==='car-base'){
  return [...g.modules.values()].filter(r=>ROAD_TYPES.has(r.type)).map(r=>{
   const spec=vehicleSpec(vehicleKind(g,m.id));
   const points=roadCenterline(r),p=projectPolyline(points,m.position),s=Math.max(0,p.s+spec.rear);
   const rear=pointAtDistance(points,s).point,a=pointAtDistance(points,Math.max(0,s-.10)).point,b=pointAtDistance(points,s+.10).point;
   const yaw=Math.atan2(-(b[2]-a[2]),b[0]-a[0]);
   const position=add([rear[0],CHASSIS_HEIGHT+ROAD_HEIGHT,rear[2]],rotateY([-spec.rear,0,0],yaw));
   return {position,rotationY:yaw,parentId:r.id,slotKey:'road',label:'Mặt đường'};
  });
 }
 if(CONTROL_TYPES.has(m.type)){
  const poses:Placement[]=[];
  for(const r of g.modules.values())if(ROAD_TYPES.has(r.type)){
   for(const side of [-1,1]){const key='side:'+side;if(occupant(g,r.id,key,id))continue;poses.push(roadsidePose(r,key)!);}
  }
  return poses;
 }
 return [];
}

export function previewPlacement(g:ConnectionGraph,id:string,raw:Vector3Tuple):Placement|null {
 const m=g.modules.get(id);if(!m)return null;
 if(ROAD_TYPES.has(m.type)){
  const previous=m.position;m.position=raw;
  const p=g.previewSnapPose(id,.55);m.position=previous;
  return p?{position:p.position,rotationY:p.rotationY,label:'Đầu đường'}:null;
 }
 // Chassis chooses a centerline point, but only when actually dragged over road surface.
 let candidates:Placement[];
 if(m.type==='car-base'){
  const old=m.position;m.position=raw;candidates=placementCandidates(g,id);m.position=old;
 }else candidates=placementCandidates(g,id);
 const radius=m.type==='car-base'?.52:CONTROL_TYPES.has(m.type)?.55:SNAP_DISTANCE;
 const nearest=candidates.sort((a,b)=>distanceXZ(a.position,raw)-distanceXZ(b.position,raw))[0];
 return nearest&&distanceXZ(nearest.position,raw)<=radius?nearest:null;
}

export function moveGroup(g:ConnectionGraph,id:string,position:Vector3Tuple,yaw:number){
 const root=g.modules.get(id);if(!root)return;
 const origin=[...root.position] as Vector3Tuple,delta=angleDelta(yaw,root.rotationY);
 for(const member of descendants(g,id)){
  const m=g.modules.get(member)!;
  const offset:Vector3Tuple=[m.position[0]-origin[0],m.position[1]-origin[1],m.position[2]-origin[2]];
  m.position=add(position,rotateY(offset,delta));m.rotationY+=delta;
 }
}
export function commitPlacement(g:ConnectionGraph,id:string,pose:Placement|null){
 const m=g.modules.get(id);if(!m)return;
 if(pose&&isCarPart(m)&&m.type!=='car-base'){
  const parent=pose.parentId?g.modules.get(pose.parentId):undefined;
  if(!parent||!mountingSlots(g,parent).some(s=>s.key===pose.slotKey&&s.type===m.type)||occupant(g,parent.id,pose.slotKey!,id))return;
  const owner=vehicleForModule(g,parent);if(m.vehicleId&&owner!==m.vehicleId)return;
 }
 if(pose){moveGroup(g,id,pose.position,pose.rotationY);m.parentId=pose.parentId;m.slotKey=pose.slotKey;
  if(m.type==='idler-axle'){const keys=axleWheelKeys(m);for(const child of g.modules.values())if(child.parentId===id&&child.type==='wheel')child.slotKey=keys[child.slotKey?.endsWith('l')?0:1];}
  const owner=m.type==='car-base'?m.id:pose.parentId?vehicleForModule(g,g.modules.get(pose.parentId)):undefined;
  if(owner)for(const member of descendants(g,id))g.modules.get(member)!.vehicleId=owner;
 }
 else {m.parentId=undefined;m.slotKey=undefined;if(m.type==='car-base')moveGroup(g,id,[m.position[0],CHASSIS_HEIGHT,m.position[2]],m.rotationY);}
 if(ROAD_TYPES.has(m.type)&&pose)g.snapModule(id);
 reconcileAssembly(g);
}

export function detachAssembly(g:ConnectionGraph,id:string,position:Vector3Tuple):boolean {
 const m=g.modules.get(id);if(!m||m.type==='car-base'||!isMounted(g,m))return false;
 moveGroup(g,id,position,m.rotationY);m.parentId=undefined;m.slotKey=undefined;
 reconcileAssembly(g);return true;
}

export function reconcileAssembly(g:ConnectionGraph){
 // Rebuild links from valid physical attachments. Status reads never mutate the graph.
 for(const [id,c] of g.connections)if(!ROAD_TYPES.has(g.modules.get(c.fromModuleId)?.type as ModuleType)||!ROAD_TYPES.has(g.modules.get(c.toModuleId)?.type as ModuleType))g.connections.delete(id);
 const link=(a:ModuleInstance|undefined,ap:string,b:ModuleInstance|undefined,bp:string)=>{
  if(!a||!b)return;
  const pa=portsForModule(a).find(p=>p.id===ap),pb=portsForModule(b).find(p=>p.id===bp);if(!pa||!pb)return;
  const c=normalizeConnection(a,pa,b,pb);if(c)g.connect({id:'assembly:'+a.id+':'+ap+'>'+b.id+':'+bp,...c});
 };
 for(const car of g.modules.values())if(car.type==='car-base'){
 const at=(type:ModuleType)=>[...g.modules.values()].find(m=>m.type===type&&vehicleForModule(g,m)===car.id&&isInstalled(g,m));
 for(const parentId of descendants(g,car.id)){
  const parent=g.modules.get(parentId)!;if(!isInstalled(g,parent))continue;
  for(const slot of mountingSlots(g,parent)){
   const child=occupant(g,parent.id,slot.key);if(!child||!isMounted(g,child))continue;
   if(slot.type==='wheel'){const left=slot.key.endsWith('l');link(parent,left?'wheel-left':'wheel-right',child,parent.type==='drive-axle'?'rotation-in':'mount-in');}
   else link(parent,parent.type==='hitch'?'tow-out':slot.key+'-mount',child,'mount-in');
  }
 }
 link(at('battery'),'power-out',at('switch'),'power-in');
 link(at('switch'),'power-out',at('motor'),'power-in');
 link(at('motor'),'return-out',at('battery'),'return-in');
 link(at('motor'),'rotation-out',at('gearbox'),'rotation-in');
 link(at('gearbox'),'rotation-out',at('differential'),'rotation-in');
 link(at('differential'),'rotation-out',at('drive-axle'),'rotation-in');
 }
}
export function assemblyCount(g:ConnectionGraph,vehicleId?:string){return [...g.modules.values()].filter(m=>isInstalled(g,m)&&(!vehicleId||vehicleForModule(g,m)===vehicleId)).length;}

export function restoreAssembly(g:ConnectionGraph){
 for(const car of g.modules.values())if(car.type==='car-base'){
  if(!g.vehicles.has(car.id))newVehicle(g,car.vehicleKind??'car',car.id);
  car.vehicleId=car.id;car.vehicleKind=g.vehicles.get(car.id)!.kind;car.color=g.vehicles.get(car.id)!.color;
 }
 const fallback=g.vehicles.size===1?g.vehicles.keys().next().value:undefined;
 for(const m of g.modules.values())if(isCarPart(m))m.vehicleId=vehicleForModule(g,m)??fallback;
 // Repair orphaned or stale ownership on load instead of trusting cached readiness.
 for(const m of g.modules.values())if(m.parentId&&!isMounted(g,m)){m.parentId=undefined;m.slotKey=undefined;}
 reconcileAssembly(g);
}
