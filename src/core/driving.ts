import { isMounted } from './assembly';
import { ConnectionGraph } from './connectionGraph';
import { HALF_TRACK, rotateY, add, angleDelta, WHEELBASE, WHEEL_RADIUS, CHASSIS_HEIGHT, ROAD_HEIGHT } from './layout';
import { buildRoute, pointAtDistance, projectPolyline, sampleRoad, type VehicleRoute } from './worldRoutes';
import type { Vector3Tuple } from './types';

export class VehicleDrive {
 readonly route:VehicleRoute;
 distance:number;
 elapsed=0;
 speed=0;
 reason='Sẵn sàng';
 position:Vector3Tuple;
 yaw:number;
 steering={left:0,right:0};
 wheelAngle={fl:0,fr:0,rl:0,rr:0};
 wheelRpm={fl:0,fr:0,rl:0,rr:0};
 private stops=new Map<string,number>();
 private served=new Set<string>();
 private signals:Array<{id:string;s:number;type:string;start:number;end:number}> = [];
 readonly baseSpeed:number;
 constructor(private graph:ConnectionGraph,readonly carId:string,rearRpm:number){
  const car=graph.modules.get(carId)!;this.position=[...car.position];this.yaw=car.rotationY;
  this.route=buildRoute(graph,carId);this.baseSpeed=Math.abs(rearRpm)*2*Math.PI*WHEEL_RADIUS/60;
  const rear=add(car.position,rotateY([-WHEELBASE/2,0,0],car.rotationY));
  this.distance=projectPolyline(this.route.points,rear).s;
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
 step(dt:number,enabled=true){
  dt=Math.max(0,Math.min(dt,.1));this.elapsed+=dt;
  const before=this.distance;let speed=enabled?this.baseSpeed:0;
  this.reason=enabled?'Đang chạy':'Công tắc tắt';
  const bumper=WHEELBASE+.45;
  let limit=this.route.closed?Infinity:Math.max(before,this.route.length-bumper);
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
   const point=this.sample(this.distance).point;this.yaw=this.heading(this.distance);
   this.position=add([point[0],CHASSIS_HEIGHT+ROAD_HEIGHT,point[2]],rotateY([WHEELBASE/2,0,0],this.yaw));
  }
  const curvature=ds>1e-8?angleDelta(this.yaw,oldYaw)/ds:0;
  // Ackermann steering and differential rolling distances, expressed at the rear axle.
  const factors={rl:Math.max(.1,1+HALF_TRACK*curvature),rr:Math.max(.1,1-HALF_TRACK*curvature),fl:Math.hypot(1+HALF_TRACK*curvature,WHEELBASE*curvature),fr:Math.hypot(1-HALF_TRACK*curvature,WHEELBASE*curvature)};
  if(ds>0){this.steering.left=Math.atan2(WHEELBASE*curvature,1+HALF_TRACK*curvature);this.steering.right=Math.atan2(WHEELBASE*curvature,1-HALF_TRACK*curvature);}
  for(const key of ['fl','fr','rl','rr'] as const){
   this.wheelAngle[key]-=ds*factors[key]/WHEEL_RADIUS;
   this.wheelRpm[key]=this.speed*factors[key]*60/(2*Math.PI*WHEEL_RADIUS);
  }
  if(this.route.closed&&this.distance>=this.route.length){this.distance%=this.route.length;this.served.clear();this.stops.clear();}
  return this.snapshot();
 }
 snapshot(){return {position:[...this.position] as Vector3Tuple,yaw:this.yaw,speed:this.speed,distance:this.distance,reason:this.reason,wheelAngle:{...this.wheelAngle},wheelRpm:{...this.wheelRpm},steering:{...this.steering},closed:this.route.closed,baseSpeed:this.baseSpeed};}
}
