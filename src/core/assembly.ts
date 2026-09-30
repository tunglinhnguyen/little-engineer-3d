import { ConnectionGraph, normalizeConnection } from './connectionGraph';
import { CAR_PALETTE, CONTROL_TYPES, MODULES, ROAD_TYPES } from './moduleRegistry';
import { add, angleDelta, CHASSIS_HEIGHT, distanceXZ, HALF_TRACK, LOCAL_SLOTS, ROAD_HEIGHT, ROAD_WIDTH, rotateY, SNAP_DISTANCE, WHEEL_LOCAL, WHEEL_SLOTS, WHEELBASE } from './layout';
import type { ModuleInstance, ModuleType, Placement, Vector3Tuple } from './types';
import { roadCenterline, projectPolyline, pointAtDistance } from './worldRoutes';

export const REQUIRED_PARTS=12;
export const UNIQUE_CAR=new Set<ModuleType>(CAR_PALETTE.filter(t=>t!=='wheel'));
export const first=(g:ConnectionGraph,type:ModuleType)=>[...g.modules.values()].find(m=>m.type===type);
export const occupant=(g:ConnectionGraph,parentId:string,slotKey:string,except?:string)=>[...g.modules.values()].find(m=>m.parentId===parentId&&m.slotKey===slotKey&&m.id!==except);
export const isCarPart=(m:ModuleInstance)=>CAR_PALETTE.includes(m.type);

export function slotPose(g:ConnectionGraph,parentId:string,slotKey:string):Placement|null {
 const parent=g.modules.get(parentId);if(!parent)return null;
 let local:Vector3Tuple|undefined;
 if(parent.type==='car-base') local=LOCAL_SLOTS[slotKey];
 if(parent.type==='front-axle'&&['wheel-fl','wheel-fr'].includes(slotKey)) local=WHEEL_LOCAL[slotKey];
 if(parent.type==='drive-axle'&&['wheel-rl','wheel-rr'].includes(slotKey)) local=WHEEL_LOCAL[slotKey];
 if(!local)return null;
 return {position:add(parent.position,rotateY(local,parent.rotationY)),rotationY:parent.rotationY,parentId,slotKey,label:slotKey.startsWith('wheel')?'Đầu trục':MODULES[slotKey as ModuleType]?.name};
}

export function roadsidePose(road:ModuleInstance,slotKey:string):Placement|null {
 if(!ROAD_TYPES.has(road.type)||!['side:-1','side:1'].includes(slotKey))return null;
 const points=roadCenterline(road),mid=points[Math.floor(points.length/2)],p=projectPolyline(points,mid),yaw=Math.atan2(-p.tangent[2],p.tangent[0]);
 const side=slotKey==='side:1'?1:-1,position=add(mid,rotateY([0,0,side*(ROAD_WIDTH/2+.30)],yaw));position[1]=road.position[1];
 return {position,rotationY:yaw+Math.PI/2,parentId:road.id,slotKey,label:'Lề đường'};
}
export function isMounted(g:ConnectionGraph,m:ModuleInstance|undefined):boolean {
 if(!m||!m.parentId||!m.slotKey)return false;
 if(m.type==='car-base')return ROAD_TYPES.has(g.modules.get(m.parentId)?.type as ModuleType)&&m.slotKey==='road';
 if(CONTROL_TYPES.has(m.type)){const road=g.modules.get(m.parentId),p=road?roadsidePose(road,m.slotKey):null;return Boolean(p&&distanceXZ(m.position,p.position)<.015&&Math.abs(m.position[1]-p.position[1])<.015&&Math.abs(angleDelta(m.rotationY,p.rotationY))<.015);}
 if(m.type==='wheel'&&!m.slotKey.startsWith('wheel-'))return false;
 if(m.type!=='wheel'&&m.slotKey!==m.type)return false;
 const pose=slotPose(g,m.parentId,m.slotKey);
 return Boolean(pose&&distanceXZ(m.position,pose.position)<.015&&Math.abs(m.position[1]-pose.position[1])<.015&&Math.abs(angleDelta(m.rotationY,pose.rotationY))<.015);
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
 if(m.type==='wheel'){
  const poses:Placement[]=[];
  for(const type of ['front-axle','drive-axle'] as ModuleType[]){
   const axle=first(g,type);if(!axle)continue;
   for(const key of WHEEL_SLOTS){const p=slotPose(g,axle.id,key);if(p&&!occupant(g,axle.id,key,id))poses.push(p);}
  }
  return poses;
 }
 if(UNIQUE_CAR.has(m.type)&&m.type!=='car-base'){
  const chassis=first(g,'car-base');if(!chassis||occupant(g,chassis.id,m.type,id))return [];
  const pose=slotPose(g,chassis.id,m.type);return pose?[pose]:[];
 }
 if(m.type==='car-base'){
  return [...g.modules.values()].filter(r=>ROAD_TYPES.has(r.type)).map(r=>{
   const points=roadCenterline(r),p=projectPolyline(points,m.position),s=Math.max(0,p.s-WHEELBASE/2);
   const rear=pointAtDistance(points,s).point,a=pointAtDistance(points,Math.max(0,s-.10)).point,b=pointAtDistance(points,s+.10).point;
   const yaw=Math.atan2(-(b[2]-a[2]),b[0]-a[0]);
   const position=add([rear[0],CHASSIS_HEIGHT+ROAD_HEIGHT,rear[2]],rotateY([WHEELBASE/2,0,0],yaw));
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
 if(pose){moveGroup(g,id,pose.position,pose.rotationY);m.parentId=pose.parentId;m.slotKey=pose.slotKey;}
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
 const car=first(g,'car-base');if(!car)return;
 const at=(type:ModuleType)=>{const m=first(g,type);return m&&isInstalled(g,m)?m:undefined;};
 const link=(a:ModuleInstance|undefined,ap:string,b:ModuleInstance|undefined,bp:string)=>{
  if(!a||!b)return;
  const pa=MODULES[a.type].ports.find(p=>p.id===ap),pb=MODULES[b.type].ports.find(p=>p.id===bp);if(!pa||!pb)return;
  const c=normalizeConnection(a,pa,b,pb);if(c)g.connect({id:'assembly:'+a.id+':'+ap+'>'+b.id+':'+bp,...c});
 };
 for(const t of UNIQUE_CAR)if(t!=='car-base')link(car,t+'-mount',at(t),'mount-in');
 link(at('battery'),'power-out',at('switch'),'power-in');
 link(at('switch'),'power-out',at('motor'),'power-in');
 link(at('motor'),'return-out',at('battery'),'return-in');
 link(at('motor'),'rotation-out',at('gearbox'),'rotation-in');
 link(at('gearbox'),'rotation-out',at('differential'),'rotation-in');
 link(at('differential'),'rotation-out',at('drive-axle'),'rotation-in');
 const front=at('front-axle'),rear=at('drive-axle');
 link(front,'wheel-left',front?occupant(g,front.id,'wheel-fl'):undefined,'mount-in');
 link(front,'wheel-right',front?occupant(g,front.id,'wheel-fr'):undefined,'mount-in');
 link(rear,'wheel-left',rear?occupant(g,rear.id,'wheel-rl'):undefined,'rotation-in');
 link(rear,'wheel-right',rear?occupant(g,rear.id,'wheel-rr'):undefined,'rotation-in');
}
export function assemblyCount(g:ConnectionGraph){return [...g.modules.values()].filter(m=>isInstalled(g,m)).length;}

export function restoreAssembly(g:ConnectionGraph){
 // Repair orphaned or stale ownership on load instead of trusting cached readiness.
 for(const m of g.modules.values())if(m.parentId&&!isMounted(g,m)){m.parentId=undefined;m.slotKey=undefined;}
 reconcileAssembly(g);
}
