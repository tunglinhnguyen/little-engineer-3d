import { MODULES, ROAD_TYPES } from './moduleRegistry';
import { add, CURVE_RADIUS, distanceXZ, ROAD_HEIGHT, rotateY } from './layout';
import { ConnectionGraph } from './connectionGraph';
import type { ModuleInstance, Vector3Tuple } from './types';

export interface RouteRange {roadId:string;start:number;end:number;entry:string;exit:string}
export interface VehicleRoute {points:Vector3Tuple[];length:number;closed:boolean;ranges:RouteRange[]}
const lerp=(a:Vector3Tuple,b:Vector3Tuple,t:number):Vector3Tuple=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export function worldRoadPort(m:ModuleInstance,id:string):Vector3Tuple|null{
 const p=MODULES[m.type].ports.find(p=>p.id===id);return p?add(m.position,rotateY(p.position,m.rotationY)):null;
}
export function curvePoint(t:number,radius=CURVE_RADIUS):Vector3Tuple{
 const angle=t*Math.PI/2,R=radius;return [R-R*Math.cos(angle),ROAD_HEIGHT,-R+R*Math.sin(angle)];
}
export function roadCenterline(m:ModuleInstance):Vector3Tuple[]{
 const ports=MODULES[m.type].ports;
 if(!ROAD_TYPES.has(m.type))return [];
 return sampleRoad(m,ports[0].id,ports[1].id);
}
export function sampleRoad(m:ModuleInstance,entry:string,exit:string):Vector3Tuple[]{
 const a=MODULES[m.type].ports.find(p=>p.id===entry)!.position,b=MODULES[m.type].ports.find(p=>p.id===exit)!.position;
 const points:Vector3Tuple[]=[];
 if(m.type==='road-curve'||m.type==='road-wide-curve'){
  for(let i=0;i<=64;i++)points.push(curvePoint(entry==='south'?i/64:1-i/64,m.type==='road-wide-curve'?8:CURVE_RADIUS));
 }else if(m.type==='road-intersection'&&Math.abs(a[0]*b[0]+a[2]*b[2])<.01){
  // Quarter circle tangent to the connected approaches, not a corner through the centre.
  const R=Math.hypot(...[a[0],a[2]]),center:Vector3Tuple=[a[0]+b[0],ROAD_HEIGHT,a[2]+b[2]];
  const va:[number,number]=[a[0]-center[0],a[2]-center[2]],vb:[number,number]=[b[0]-center[0],b[2]-center[2]];
  const start=Math.atan2(va[1],va[0]),delta=Math.atan2(va[0]*vb[1]-va[1]*vb[0],va[0]*vb[0]+va[1]*vb[1]);
  for(let i=0;i<=32;i++){const t=start+delta*i/32;points.push([center[0]+R*Math.cos(t),ROAD_HEIGHT,center[2]+R*Math.sin(t)]);}
 }else{
  for(let i=0;i<=16;i++){const p=lerp(a,b,i/16);p[1]=ROAD_HEIGHT;points.push(p);}
 }
 return points.map(p=>add(m.position,rotateY(p,m.rotationY)));
}
export function polylineLength(points:Vector3Tuple[]){let s=0;for(let i=1;i<points.length;i++)s+=distanceXZ(points[i-1],points[i]);return s;}
export function projectPolyline(points:Vector3Tuple[],position:Vector3Tuple){
 let best=Infinity,travel=0,result={point:points[0]??[0,0,0] as Vector3Tuple,tangent:[1,0,0] as Vector3Tuple,s:0,distance:Infinity};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);if(len<1e-8)continue;
  const t=Math.max(0,Math.min(1,((position[0]-a[0])*dx+(position[2]-a[2])*dz)/(len*len)));
  const p=lerp(a,b,t),d=distanceXZ(p,position);
  if(d<best){best=d;result={point:p,tangent:[dx/len,0,dz/len],s:travel+t*len,distance:d};}
  travel+=len;
 }
 return result;
}
export function pointAtDistance(points:Vector3Tuple[],s:number){
 let travel=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],len=distanceXZ(a,b);if(len<1e-8)continue;
  if(travel+len>=s)return {point:lerp(a,b,Math.max(0,(s-travel)/len)),tangent:[(b[0]-a[0])/len,0,(b[2]-a[2])/len] as Vector3Tuple};
  travel+=len;
 }
 const a=points.at(-2)??[0,0,0],b=points.at(-1)??a,len=distanceXZ(a,b)||1;
 return {point:b,tangent:[(b[0]-a[0])/len,0,(b[2]-a[2])/len] as Vector3Tuple};
}
function edgeAt(g:ConnectionGraph,id:string,port:string){
 for(const e of g.connections.values()){
  let otherId:string|undefined,otherPort:string|undefined;
  if(e.fromModuleId===id&&e.fromPortId===port){otherId=e.toModuleId;otherPort=e.toPortId;}
  if(e.toModuleId===id&&e.toPortId===port){otherId=e.fromModuleId;otherPort=e.fromPortId;}
  const a=g.modules.get(id),b=otherId?g.modules.get(otherId):undefined;
  if(!a||!b||!otherPort||!ROAD_TYPES.has(b.type))continue;
  const pa=worldRoadPort(a,port),pb=worldRoadPort(b,otherPort);
  if(!pa||!pb||distanceXZ(pa,pb)>.03)continue;
  const ax=rotateY(MODULES[a.type].ports.find(p=>p.id===port)!.axis,a.rotationY),bx=rotateY(MODULES[b.type].ports.find(p=>p.id===otherPort)!.axis,b.rotationY);
  if(ax[0]*bx[0]+ax[2]*bx[2]>-.99)continue;
  return {otherId:b.id,otherPort};
 }
 return null;
}
function chooseExit(g:ConnectionGraph,m:ModuleInstance,entry:string){
 const ep=MODULES[m.type].ports.find(p=>p.id===entry)!;
 const candidates=MODULES[m.type].ports.filter(p=>p.id!==entry).sort((a,b)=>{
  const ac=Boolean(edgeAt(g,m.id,a.id)),bc=Boolean(edgeAt(g,m.id,b.id));
  if(ac!==bc)return ac?-1:1;
  return ep.axis[0]*a.axis[0]+ep.axis[2]*a.axis[2]-(ep.axis[0]*b.axis[0]+ep.axis[2]*b.axis[2]);
 });return candidates[0]?.id??entry;
}
function pathTo(g:ConnectionGraph,start:ModuleInstance,entry:string,target:string){
 const queue:Array<{m:ModuleInstance;entry:string;path:Array<{roadId:string;entry:string;exit:string}>}>=[{m:start,entry,path:[]}],seen=new Set<string>();
 for(let i=0;i<queue.length;i++){
  const node=queue[i],key=node.m.id+':'+node.entry;if(seen.has(key))continue;seen.add(key);
  if(node.m.id===target)return [...node.path,{roadId:node.m.id,entry:node.entry,exit:chooseExit(g,node.m,node.entry)}];
  const preferred=chooseExit(g,node.m,node.entry),exits=MODULES[node.m.type].ports.filter(p=>p.id!==node.entry).sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred));
  for(const exit of exits){const edge=edgeAt(g,node.m.id,exit.id);if(edge)queue.push({m:g.modules.get(edge.otherId)!,entry:edge.otherPort,path:[...node.path,{roadId:node.m.id,entry:node.entry,exit:exit.id}]});}
 }return null;
}
export function buildRoute(g:ConnectionGraph,vehicleId:string,options:{destinationRoadId?:string}={}):VehicleRoute{
 const empty:VehicleRoute={points:[],length:0,closed:false,ranges:[]};
 const car=g.modules.get(vehicleId),start=car?.parentId?g.modules.get(car.parentId):undefined;
 if(!car||car.type!=='car-base'||car.slotKey!=='road'||!start||!ROAD_TYPES.has(start.type))return empty;
 if(projectPolyline(roadCenterline(start),car.position).distance>.55)return empty;
 const forward=rotateY([1,0,0],car.rotationY);
 const ports=MODULES[start.type].ports;
 const exit=ports.slice().sort((a,b)=>{
  const ax=rotateY(a.axis,start.rotationY),bx=rotateY(b.axis,start.rotationY);
  return bx[0]*forward[0]+bx[2]*forward[2]-(ax[0]*forward[0]+ax[2]*forward[2]);
 })[0].id;
 const entry=ports.filter(p=>p.id!==exit).sort((a,b)=>{
  const ax=rotateY(a.axis,start.rotationY),bx=rotateY(b.axis,start.rotationY);
  return ax[0]*forward[0]+ax[2]*forward[2]-(bx[0]*forward[0]+bx[2]*forward[2]);
 })[0].id;
 let planned:Array<{roadId:string;entry:string;exit:string}>|null=null;
 if(options.destinationRoadId&&options.destinationRoadId!==start.id){const edge=edgeAt(g,start.id,exit);if(!edge)return empty;const tail=pathTo(g,g.modules.get(edge.otherId)!,edge.otherPort,options.destinationRoadId);if(!tail)return empty;planned=[{roadId:start.id,entry,exit},...tail];}
 let m=start,en=entry,ex=exit;const points:Vector3Tuple[]=[],ranges:RouteRange[]=[],seen=new Set<string>();let total=0,closed=false;
 for(let n=0;n<100;n++){
  const key=m.id+':'+en+':'+ex;
  if(seen.has(key)){closed=key===start.id+':'+entry+':'+exit;break;}
  seen.add(key);
  const segment=sampleRoad(m,en,ex),length=polylineLength(segment);
  if(points.length&&distanceXZ(points.at(-1)!,segment[0])>.03)break;
  ranges.push({roadId:m.id,start:total,end:total+length,entry:en,exit:ex});total+=length;
  points.push(...(points.length?segment.slice(1):segment));
  if(options.destinationRoadId===m.id)break;
  const edge=edgeAt(g,m.id,ex);if(!edge)break;
  m=g.modules.get(edge.otherId)!;en=edge.otherPort;ex=planned?.[n+1]?.exit??chooseExit(g,m,en);
 }
 return {points,length:total,closed,ranges};
}
export const buildVehicleRoute=(g:ConnectionGraph,id:string)=>buildRoute(g,id).points;
