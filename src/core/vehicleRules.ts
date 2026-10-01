import { ConnectionGraph } from './connectionGraph';
import { descendants, isInstalled, isMounted, mountingSlots, occupant, slotPose } from './assembly';
import { MODULES, ROAD_TYPES } from './moduleRegistry';
import { buildRoute, projectPolyline, roadCenterline } from './worldRoutes';
import { CHASSIS_HEIGHT, ROAD_HEIGHT, rotateY } from './layout';
import { vehicleParts, vehicleSpec, vehicleKind } from './vehicles';
import { cargoCarrier, vehiclePerformance } from './experiments';
import type { ModuleType, Placement } from './types';

export interface VehicleIssue {message:string;moduleId?:string;type?:ModuleType;pose?:Placement;kind:'part'|'power'|'road'|'load'|'garage'}
export function wheelsOnRoad(graph:ConnectionGraph,id:string){
 const roads=[...graph.modules.values()].filter(m=>ROAD_TYPES.has(m.type));
 return vehicleParts(graph,id,'wheel').filter(m=>isInstalled(graph,m)).every(w=>roads.some(r=>{
  if(Math.abs(w.position[1]-.33-r.position[1]-ROAD_HEIGHT)>.02)return false;
  if(r.type==='road-intersection'){const p=rotateY([w.position[0]-r.position[0],0,w.position[2]-r.position[2]],-r.rotationY);return Math.abs(p[0])<=1.53&&Math.abs(p[2])<=2.4||Math.abs(p[2])<=1.53&&Math.abs(p[0])<=2.4;}
  return projectPolyline(roadCenterline(r),w.position).distance<=(r.type==='road-wide-curve'?2.2:1.65)-.10;
 }));
}
export function assemblyIssues(graph:ConnectionGraph,id:string):VehicleIssue[]{
 const car=graph.modules.get(id);if(!car||car.type!=='car-base')return [{message:'Lấy khung xe để bắt đầu.',type:'car-base',kind:'part'}];
 const issues:VehicleIssue[]=[];
 for(const parentId of descendants(graph,id)){
  const parent=graph.modules.get(parentId)!;if(!isInstalled(graph,parent))continue;
  for(const slot of mountingSlots(graph,parent))if(slot.required){
   const child=occupant(graph,parentId,slot.key);if(!child||!isMounted(graph,child))issues.push({message:'Còn thiếu '+(slot.label===slot.key?MODULES[slot.type].name:slot.label)+'.',moduleId:child?.id,type:slot.type,pose:slotPose(graph,parentId,slot.key)??undefined,kind:'part'});
  }
 }return issues;
}

export function vehicleCanTravel(graph:ConnectionGraph,vehicleId:string,rpm:Map<string,number>){
 const car=graph.modules.get(vehicleId),profile=graph.vehicles.get(vehicleId),route=buildRoute(graph,vehicleId,{destinationRoadId:profile?.mission?.status!=='completed'?profile?.mission?.targetRoadId:undefined});
 const issues=assemblyIssues(graph,vehicleId);
 if(profile?.parked)issues.unshift({message:'Đưa xe từ gara ra bàn để chạy.',kind:'garage'});
 if(!issues.length){
  const wheels=vehicleParts(graph,vehicleId,'wheel').filter(m=>m.slotKey==='wheel-rl'||m.slotKey==='wheel-rr');
  if(wheels.length!==2||wheels.some(m=>!isInstalled(graph,m)||!(rpm.get(m.id)??0))){const sw=vehicleParts(graph,vehicleId,'switch').find(m=>isInstalled(graph,m));issues.push({message:sw?.switchOn===false?'Công tắc đang tắt. Chạm công tắc rồi bấm Bật.':'Mạch điện hoặc bộ truyền chưa kín.',moduleId:sw?.id,kind:'power'});}
 }
 if(!issues.length&&car&&(route.length<vehicleSpec(vehicleKind(graph,vehicleId)).maxX-vehicleSpec(vehicleKind(graph,vehicleId)).minX||Math.abs(car.position[1]-(CHASSIS_HEIGHT+ROAD_HEIGHT))>.02))issues.push({message:'Kéo cả xe lên đường hoặc bấm Đặt lên đường.',kind:'road',moduleId:vehicleId});
 if(!issues.length&&!wheelsOnRoad(graph,vehicleId))issues.push({message:'Bánh xe chưa nằm đủ trên mặt đường. Dời xe vào đoạn đường dài hơn.',kind:'road',moduleId:vehicleId});
 if(!issues.length&&profile?.mission?.status==='choose'&&profile.mission.kind!=='trailer')issues.push({message:'Chạm một cờ trên đường để chọn điểm đến.',kind:'road'});
 if(!issues.length&&profile?.mission?.status!=='completed'&&profile?.mission?.targetRoadId&&!route.ranges.some(r=>r.roadId===profile.mission!.targetRoadId))issues.push({message:'Điểm đến chưa nối được với hướng xe đang đứng.',kind:'road'});
 if(!issues.length&&profile?.mission?.kind==='delivery'&&profile.mission.status!=='completed'&&(!cargoCarrier(graph,vehicleId)||profile.cargo<=0))issues.push({message:'Ráp thùng chở hàng và xếp ít nhất một kiện trước khi giao.',kind:'load'});
 if(!issues.length&&vehicleKind(graph,vehicleId)!=='car'&&route.ranges.some(r=>{const m=graph.modules.get(r.roadId)!;if(m.type==='road-curve')return true;if(m.type!=='road-intersection')return false;const a=MODULES[m.type].ports.find(p=>p.id===r.entry)!,b=MODULES[m.type].ports.find(p=>p.id===r.exit)!;return Math.abs(a.axis[0]*b.axis[0]+a.axis[2]*b.axis[2])<.01;}))issues.push({message:'Xe dài cần Cua rộng. Ngã tư nhỏ chỉ đi thẳng.',kind:'road'});
 if(!issues.length&&vehiclePerformance(graph,vehicleId).stalled)issues.push({message:'Tải quá nặng với số này. Chọn Số khỏe hoặc bớt hàng.',moduleId:vehicleParts(graph,vehicleId,'gearbox')[0]?.id,kind:'load'});
 return {ready:issues.length===0,route:route.points,message:issues[0]?.message??'Xe sẵn sàng chạy.',issues};
}
