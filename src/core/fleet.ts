import type { ConnectionGraph } from './connectionGraph';
import { descendants, isInstalled, moveGroup } from './assembly';
import { vehicleForModule, vehicleKind, vehicleParts, vehicleSpec } from './vehicles';
import { VehicleDrive } from './driving';
import { vehicleCanTravel } from './vehicleRules';
import { vehiclePerformance } from './experiments';
import { SimulationEngine } from './simulation';
import { completeDrivingMission } from './missions';
import { add, rotateY } from './layout';
import { projectPolyline, roadCenterline } from './worldRoutes';
import { ROAD_TYPES } from './moduleRegistry';
import type { SimulationState, Vector3Tuple } from './types';

export interface Footprint {center:Vector3Tuple;yaw:number;halfLength:number;halfWidth:number}
export function footprints(g:ConnectionGraph,id:string,pose?:{position:Vector3Tuple;yaw:number;trailer?:{position:Vector3Tuple;yaw:number}|null}):Footprint[]{
 const car=g.modules.get(id);if(!car||g.vehicles.get(id)?.parked)return [];
 const spec=vehicleSpec(vehicleKind(g,id)),position=pose?.position??car.position,yaw=pose?.yaw??car.rotationY;
 const bodies:Footprint[]=[{center:add(position,rotateY([(spec.minX+spec.maxX)/2,0,0],yaw)),yaw,halfLength:(spec.maxX-spec.minX)/2,halfWidth:1.26}];
 const trailer=vehicleParts(g,id,'trailer').find(m=>isInstalled(g,m));if(trailer){const p=pose?.trailer?.position??trailer.position,t=pose?.trailer?.yaw??trailer.rotationY;bodies.push({center:add(p,rotateY([-2,0,0],t)),yaw:t,halfLength:2.3,halfWidth:1.26});}
 return bodies;
}
export function footprintsOverlap(a:Footprint,b:Footprint,padding=.20){
 for(const yaw of [a.yaw,b.yaw])for(const side of [0,Math.PI/2]){
  const axis=rotateY([1,0,0],yaw+side),gap=Math.abs((a.center[0]-b.center[0])*axis[0]+(a.center[2]-b.center[2])*axis[2]);
  const radius=(p:Footprint)=>p.halfLength*Math.abs(Math.cos(p.yaw-yaw-side))+p.halfWidth*Math.abs(Math.sin(p.yaw-yaw-side));
  if(gap>=radius(a)+radius(b)+padding)return false;
 }return true;
}
export function vehicleOverlap(g:ConnectionGraph,id:string,pose?:Parameters<typeof footprints>[2]){
 const bodies=footprints(g,id,pose);
 for(const other of g.modules.values())if(other.type==='car-base'&&other.id!==id&&!g.vehicles.get(other.id)?.parked){const occupied=footprints(g,other.id);if(bodies.some(a=>occupied.some(b=>footprintsOverlap(a,b))))return other.id;}
 return null;
}
export class FleetSimulation {
 readonly drives=new Map<string,VehicleDrive>();
 readonly rejected=new Map<string,string>();
 readonly initial=new Map<string,{position:Vector3Tuple;yaw:number;parentId?:string;slotKey?:string}>();
 readonly completed:string[]=[];
 private junctions=new Map<string,string>();
 constructor(readonly graph:ConnectionGraph,ids:string[],state=new SimulationEngine(graph).evaluate()){
  for(const id of ids){const ready=vehicleCanTravel(graph,id,state.rpm),car=graph.modules.get(id);if(!car||!ready.ready){this.rejected.set(id,ready.message);continue;}
   const rear=vehicleParts(graph,id,'drive-axle').find(m=>isInstalled(graph,m));if(!rear)continue;
   const profile=graph.vehicles.get(id),mission=profile?.mission;
   this.drives.set(id,new VehicleDrive(graph,id,state.rpm.get(rear.id)??0,{performance:vehiclePerformance(graph,id),destinationRoadId:mission?.status!=='completed'?mission?.targetRoadId:undefined}));
   this.initial.set(id,{position:[...car.position],yaw:car.rotationY,parentId:car.parentId,slotKey:car.slotKey});if(mission?.targetRoadId&&mission.status!=='completed')mission.status='running';
  }
 }
 private junctionLimit(id:string,drive:VehicleDrive){
  let limit=Infinity;
  for(const range of drive.route.ranges){
   if(this.graph.modules.get(range.roadId)?.type!=='road-intersection')continue;
   const rearExtent=drive.trailerId?4.4:drive.spec.rear-drive.spec.minX;
   if(drive.distance-rearExtent>range.end+.4){if(this.junctions.get(range.roadId)===id)this.junctions.delete(range.roadId);continue;}
   const stopAt=range.start-drive.bumper-.35;
   if(drive.distance+drive.bumper+.6<range.start)continue;
   if(!this.junctions.has(range.roadId))this.junctions.set(range.roadId,id);
   if(this.junctions.get(range.roadId)!==id)limit=Math.min(limit,Math.max(0,stopAt-drive.distance));
  }return limit;
 }
 step(dt:number,state=new SimulationEngine(this.graph).evaluate()){
  const duration=Math.max(0,Math.min(.25,dt));
  for(let elapsed=0;elapsed<duration-1e-9;elapsed+=.05){dt=Math.min(.05,duration-elapsed);
  for(const [id,drive] of this.drives){
   const rear=vehicleParts(this.graph,id,'drive-axle').find(m=>isInstalled(this.graph,m)),enabled=Boolean(rear&&(state.rpm.get(rear.id)??0)!==0);
   drive.updatePerformance(vehiclePerformance(this.graph,id));let allowed=this.junctionLimit(id,drive),reason='Nhường xe tại ngã tư';
   const wanted=Math.min(allowed,Math.max(drive.baseSpeed,drive.speed)*dt);
   for(let i=1;i<=4;i++){const distance=wanted*i/4;if(distance<=0)break;if(vehicleOverlap(this.graph,id,drive.candidateAtDistance(drive.distance+distance))){allowed=Math.min(allowed,wanted*(i-1)/4);reason='Giữ khoảng cách với xe khác';break;}}
   const s=drive.step(dt,enabled,allowed,reason);moveGroup(this.graph,id,s.position,s.yaw);
   if(s.trailer)moveGroup(this.graph,s.trailer.id,s.trailer.position,s.trailer.yaw);
   const car=this.graph.modules.get(id)!;
   const road=[...this.graph.modules.values()].filter(m=>ROAD_TYPES.has(m.type)).map(m=>({m,p:projectPolyline(roadCenterline(m),car.position)})).sort((a,b)=>a.p.distance-b.p.distance)[0];
   if(road&&road.p.distance<.65){car.parentId=road.m.id;car.slotKey='road';}
   if(s.arrived&&completeDrivingMission(this.graph,id))this.completed.push(id);
  }
  }
  return this.snapshots();
 }
 snapshots(){return Object.fromEntries([...this.drives].map(([id,drive])=>[id,drive.snapshot()]));}
 stop(){for(const id of this.drives.keys()){const mission=this.graph.vehicles.get(id)?.mission;if(mission?.status==='running')mission.status='ready';}this.drives.clear();this.junctions.clear();}
}
