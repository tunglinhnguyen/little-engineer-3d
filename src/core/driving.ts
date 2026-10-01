import { isInstalled, isMounted } from './assembly';
import { ConnectionGraph } from './connectionGraph';
import { HALF_TRACK, rotateY, add, angleDelta, WHEELBASE, WHEEL_RADIUS, CHASSIS_HEIGHT, ROAD_HEIGHT } from './layout';
import { buildRoute, pointAtDistance, projectPolyline, sampleRoad, type VehicleRoute } from './worldRoutes';
import type { Vector3Tuple } from './types';
import { vehicleKind, vehicleParts, vehicleSpec } from './vehicles';
import type { vehiclePerformance } from './experiments';

export interface DriveOptions {performance?:ReturnType<typeof vehiclePerformance>;destinationRoadId?:string}

export class VehicleDrive {
 readonly route:VehicleRoute;
 distance:number;
 elapsed=0;
 speed=0;
 reason='Sẵn sàng';
 position:Vector3Tuple;
 yaw:number;
 steering={left:0,right:0};
 wheelAngle:Record<string,number>={fl:0,fr:0,rl:0,rr:0};
 wheelRpm:Record<string,number>={fl:0,fr:0,rl:0,rr:0};
 readonly spec:ReturnType<typeof vehicleSpec>;
 readonly wheelbase:number;
 readonly bumper:number;
 readonly trailerId:string|undefined;
 trailerPose:{position:Vector3Tuple;yaw:number}|null=null;
 private trailerWheels=new Map<string,{local:Vector3Tuple;previous:Vector3Tuple}>();
 private goalDistance:number|undefined;
 arrived=false;
 private stops=new Map<string,number>();
 private served=new Set<string>();
 private signals:Array<{id:string;s:number;type:string;start:number;end:number}> = [];
 readonly baseSpeed:number;
 constructor(private graph:ConnectionGraph,readonly carId:string,rearRpm:number,private options:DriveOptions={}){
  const car=graph.modules.get(carId)!;this.position=[...car.position];this.yaw=car.rotationY;
  this.spec=vehicleSpec(vehicleKind(graph,carId));this.wheelbase=this.spec.front-this.spec.rear;this.bumper=this.spec.maxX-this.spec.rear;
  this.route=buildRoute(graph,carId,{destinationRoadId:options.destinationRoadId});this.baseSpeed=Math.abs(rearRpm)*2*Math.PI*WHEEL_RADIUS/60;
  const rear=add(car.position,rotateY([this.spec.rear,0,0],car.rotationY));
  this.distance=projectPolyline(this.route.points,rear).s;
  if(options.destinationRoadId){const target=this.route.ranges.find(r=>r.roadId===options.destinationRoadId);if(target)this.goalDistance=Math.max(this.distance,(target.start+target.end)/2-this.bumper);}
  const trailer=vehicleParts(graph,carId,'trailer').find(m=>isInstalled(graph,m));this.trailerId=trailer?.id;
  if(trailer){this.trailerPose={position:[...trailer.position],yaw:trailer.rotationY};for(const m of vehicleParts(graph,carId,'wheel')){const axle=m.parentId?graph.modules.get(m.parentId):undefined;if(axle?.parentId===trailer.id&&isInstalled(graph,m)){const offset:Vector3Tuple=[m.position[0]-trailer.position[0],m.position[1]-trailer.position[1],m.position[2]-trailer.position[2]];this.trailerWheels.set(m.slotKey!.slice(6),{local:rotateY(offset,-trailer.rotationY),previous:[...m.position]});}}}
  for(const m of graph.modules.values()){
   if(!m.parentId||!m.slotKey?.startsWith('side:')||!isMounted(graph,m))continue;
   const range=this.route.ranges.find(r=>r.roadId===m.parentId);if(!range)continue;
   const road=graph.modules.get(range.roadId)!;
   const p=projectPolyline(sampleRoad(road,range.entry,range.exit),m.position);
   this.signals.push({id:m.id,s:range.start+p.s,type:m.type,start:range.start,end:range.end});
  }
 }
 private sample(s:number){
  if(this.route.closed)s=(s%this.route.length+this.route.length)%this.route.length;
  return pointAtDistance(this.route.points,Math.max(0,Math.min(this.route.length,s)));
 }
 private heading(s:number){
  const a=this.sample(s-.10).point,b=this.sample(s+.10).point;
  if(Math.hypot(b[0]-a[0],b[2]-a[2])<1e-8)return this.yaw;
  return Math.atan2(-(b[2]-a[2]),b[0]-a[0]);
 }
 poseAtDistance(s:number){const p=this.sample(s).point,yaw=this.heading(s);return {position:add([p[0],CHASSIS_HEIGHT+ROAD_HEIGHT,p[2]],rotateY([-this.spec.rear,0,0],yaw)),yaw};}
 candidateAtDistance(s:number){
  const pose=this.poseAtDistance(s);let trailer:typeof this.trailerPose=null;
  if(this.trailerPose){const position=add(pose.position,rotateY([-1.15,.10,0],pose.yaw)),old=this.trailerPose.position,dx=position[0]-old[0],dz=position[2]-old[2],travel=Math.hypot(dx,dz);trailer={position,yaw:this.trailerPose.yaw+(travel>1e-9?Math.sin(angleDelta(Math.atan2(-dz,dx),this.trailerPose.yaw))*travel/3.05:0)};}
  return {...pose,trailer};
 }
 updatePerformance(value:ReturnType<typeof vehiclePerformance>){this.options.performance=value;}
 step(dt:number,enabled=true,maximumTravel=Infinity,blockingReason='Nhường xe phía trước'){
  dt=Math.max(0,Math.min(dt,.1));this.elapsed+=dt;
  const before=this.distance,power=this.options.performance;let speed=enabled?(power?Math.min(power.speed,this.speed+power.acceleration*dt):this.baseSpeed):0;
  this.reason=enabled?'Đang chạy':'Công tắc tắt';
  if(enabled&&power?.stalled)this.reason='Tải quá nặng — chọn Số khỏe hoặc bớt hàng';
  const bumper=this.bumper;
  let limit=this.route.closed?Infinity:Math.max(before,this.route.length-bumper);
  limit=Math.min(limit,before+Math.max(0,maximumTravel));
  if(maximumTravel<=.00001&&enabled)this.reason=blockingReason;
  if(this.goalDistance!==undefined)limit=Math.min(limit,this.goalDistance);
  if(!enabled)limit=before;
  for(const signal of this.signals){
   const module=this.graph.modules.get(signal.id);if(!module)continue;
   if(signal.type==='speed-sign'&&before>=signal.start&&before<signal.end){speed=Math.min(speed,this.baseSpeed*.5);this.reason='Giảm tốc qua biển 30';}
   let stopAt=signal.s-bumper;if(this.route.closed&&stopAt<0)stopAt+=this.route.length;
   if(stopAt<before-.025)continue;
   if(signal.type==='traffic-light'&&module.switchOn===false){
    limit=Math.min(limit,Math.max(before,stopAt));if(stopAt-before<.025)this.reason='Đèn đỏ';
   }
   if(signal.type==='stop-sign'&&!this.served.has(signal.id)){
    if(stopAt-before<=.025){
     if(!this.stops.has(signal.id))this.stops.set(signal.id,this.elapsed);
     if(this.elapsed-this.stops.get(signal.id)!>=1.5){this.served.add(signal.id);this.stops.delete(signal.id);}
     else {limit=Math.min(limit,before);this.reason='Dừng trước biển STOP';}
    }else limit=Math.min(limit,stopAt);
   }
  }
  this.distance=Math.min(limit,before+speed*dt);
  const ds=this.distance-before;
  this.speed=dt>0?ds/dt:0;
  if(!this.route.closed&&this.distance>=this.route.length-bumper-.001&&this.speed<1e-8)this.reason='Hết đường — ghép thêm đường để đi tiếp';
  const oldYaw=this.yaw;
  if(ds>0){
   const pose=this.candidateAtDistance(this.distance);this.yaw=pose.yaw;this.position=pose.position;this.trailerPose=pose.trailer;
  }
  const curvature=ds>1e-8?angleDelta(this.yaw,oldYaw)/ds:0;
  // Ackermann steering and differential rolling distances, expressed at the rear axle.
  const factors:Record<string,number>={rl:Math.max(.1,1+HALF_TRACK*curvature),rr:Math.max(.1,1-HALF_TRACK*curvature),fl:Math.hypot(1+HALF_TRACK*curvature,this.wheelbase*curvature),fr:Math.hypot(1-HALF_TRACK*curvature,this.wheelbase*curvature)};
  if(vehicleKind(this.graph,this.carId)==='truck'){factors.ml=Math.hypot(1+HALF_TRACK*curvature,.9*curvature);factors.mr=Math.hypot(1-HALF_TRACK*curvature,.9*curvature);}
  if(ds>0){this.steering.left=Math.atan2(this.wheelbase*curvature,1+HALF_TRACK*curvature);this.steering.right=Math.atan2(this.wheelbase*curvature,1-HALF_TRACK*curvature);}
  for(const key of Object.keys(factors)){
   this.wheelAngle[key]??=0;
   this.wheelAngle[key]-=ds*factors[key]/WHEEL_RADIUS;
   this.wheelRpm[key]=this.speed*factors[key]*60/(2*Math.PI*WHEEL_RADIUS);
  }
  if(this.trailerPose)for(const [key,wheel] of this.trailerWheels){const next=add(this.trailerPose.position,rotateY(wheel.local,this.trailerPose.yaw)),travel=ds>0?Math.hypot(next[0]-wheel.previous[0],next[2]-wheel.previous[2]):0;this.wheelAngle[key]=(this.wheelAngle[key]??0)-travel/WHEEL_RADIUS;this.wheelRpm[key]=dt>0?travel/dt*60/(2*Math.PI*WHEEL_RADIUS):0;wheel.previous=next;}
  if(this.goalDistance!==undefined&&this.distance>=this.goalDistance-.00001){this.arrived=true;this.reason='Đã tới điểm đến';this.speed=0;}
  if(this.route.closed&&this.distance>=this.route.length){this.distance%=this.route.length;this.served.clear();this.stops.clear();}
  return this.snapshot();
 }
 snapshot(){return {position:[...this.position] as Vector3Tuple,yaw:this.yaw,speed:this.speed,distance:this.distance,reason:this.reason,wheelAngle:{...this.wheelAngle},wheelRpm:{...this.wheelRpm},steering:{...this.steering},closed:this.route.closed,baseSpeed:this.baseSpeed,arrived:this.arrived,trailer:this.trailerPose?{id:this.trailerId!,position:[...this.trailerPose.position] as Vector3Tuple,yaw:this.trailerPose.yaw}:null};}
}
