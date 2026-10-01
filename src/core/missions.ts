import type { ConnectionGraph } from './connectionGraph';
import { isInstalled } from './assembly';
import { assemblyIssues } from './vehicleRules';
import { buildRoute, projectPolyline } from './worldRoutes';
import { add, rotateY } from './layout';
import { ROAD_TYPES } from './moduleRegistry';
import { cargoCarrier } from './experiments';
import { vehicleKind, vehicleParts, vehicleSpec } from './vehicles';
import type { MissionKind } from './types';

export const MISSION_NAMES:Record<MissionKind,string>={garage:'Đến gara',delivery:'Giao hàng',trailer:'Ghép rơ-moóc'};
export function selectMission(g:ConnectionGraph,id:string,kind:MissionKind):string|null{
 const profile=g.vehicles.get(id);if(!profile)return 'Chọn một xe trước.';
 if(kind==='trailer'&&profile.kind!=='tractor')return 'Nhiệm vụ này dùng đầu kéo container.';
 profile.mission={kind,status:'choose'};completeAssemblyMission(g,id);return null;
}
export function chooseDestination(g:ConnectionGraph,id:string,roadId:string):string|null{
 const profile=g.vehicles.get(id),car=g.modules.get(id),road=g.modules.get(roadId);if(!profile||!car||!road||!ROAD_TYPES.has(road.type))return 'Chọn một điểm trên đường.';
 const route=buildRoute(g,id,{destinationRoadId:roadId}),target=route.ranges.find(r=>r.roadId===roadId);if(!target)return 'Chưa có tuyến nối tới điểm này theo hướng xe.';
 const spec=vehicleSpec(vehicleKind(g,id)),rear=add(car.position,rotateY([spec.rear,0,0],car.rotationY)),distance=projectPolyline(route.points,rear).s;
 if((target.start+target.end)/2-(spec.maxX-spec.rear)<distance+.15)return 'Chọn điểm đến phía trước và xa hơn đầu xe.';
 const kind=profile.mission?.kind==='delivery'?'delivery':'garage';profile.mission={kind,targetRoadId:roadId,status:'ready'};return null;
}
export function completeAssemblyMission(g:ConnectionGraph,id:string){
 const mission=g.vehicles.get(id)?.mission;if(mission?.kind!=='trailer'||mission.status==='completed')return false;
 const trailer=vehicleParts(g,id,'trailer').find(m=>isInstalled(g,m));if(!trailer||assemblyIssues(g,id).length)return false;
 mission.status='completed';return true;
}
export function completeDrivingMission(g:ConnectionGraph,id:string){
 const p=g.vehicles.get(id),mission=p?.mission;if(!p||!mission||mission.status==='completed'||mission.kind==='trailer')return false;
 if(mission.kind==='delivery'){if(!cargoCarrier(g,id)||p.cargo<=0)return false;mission.delivered=p.cargo;p.cargo=0;}
 mission.status='completed';return true;
}
