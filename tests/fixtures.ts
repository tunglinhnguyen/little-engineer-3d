import { ConnectionGraph } from '../src/core/connectionGraph';
import { CAR_PALETTE } from '../src/core/moduleRegistry';
import { commitPlacement, mountingSlots, reconcileAssembly, slotPose } from '../src/core/assembly';
import { CHASSIS_HEIGHT, ROAD_HEIGHT, WHEEL_SLOTS } from '../src/core/layout';
import type { ModuleInstance, ModuleType, Vector3Tuple, VehicleKind } from '../src/core/types';
import { chassisSlots, newVehicle, TRAILER_SLOTS } from '../src/core/vehicles';

export const part=(id:string,type:ModuleType,position:Vector3Tuple=[0,0,0],rotationY=0):ModuleInstance=>({id,type,position,rotationY,switchOn:type==='switch'||type==='traffic-light'?false:undefined});
export function mountedCar(on=true,onRoad=false){
 const g=new ConnectionGraph();const car=part('car','car-base',[0,CHASSIS_HEIGHT,0]);g.addModule(car);
 for(const type of CAR_PALETTE)if(type!=='car-base'&&type!=='wheel'){
  const m=part(type,type,[4,1,4]);g.addModule(m);commitPlacement(g,m.id,slotPose(g,car.id,type));
 }
 for(const slot of WHEEL_SLOTS){const axle=slot.startsWith('wheel-f')?'front-axle':'drive-axle';const m=part(slot,'wheel');g.addModule(m);commitPlacement(g,m.id,slotPose(g,axle,slot));}
 g.modules.get('switch')!.switchOn=on;reconcileAssembly(g);
 if(onRoad){
  const roads=['south','centre','north'].map((id,i)=>part('road-'+id,'road-straight',[0,0,(i-1)*4.8]));roads.forEach(m=>g.addModule(m));
  for(let i=1;i<roads.length;i++)g.connect({id:'road-'+i,fromModuleId:roads[i-1].id,fromPortId:'north',toModuleId:roads[i].id,toPortId:'south',signal:'structural'});
  commitPlacement(g,car.id,{position:[0,CHASSIS_HEIGHT+ROAD_HEIGHT,-4.8],rotationY:-Math.PI/2,parentId:roads[0].id,slotKey:'road'});
 }
 return g;
}
export function curvedCar(){
 const g=mountedCar(true,false),car=g.modules.get('car')!;
 const a=part('a','road-straight',[0,0,-7.2]),b=part('b','road-curve',[0,0,0]),c=part('c','road-straight',[7.2,0,0],Math.PI/2);
 [a,b,c].forEach(m=>g.addModule(m));
 g.connect({id:'ab',fromModuleId:a.id,fromPortId:'north',toModuleId:b.id,toPortId:'south',signal:'structural'});
 g.connect({id:'bc',fromModuleId:b.id,fromPortId:'east',toModuleId:c.id,toPortId:'south',signal:'structural'});
 commitPlacement(g,car.id,{position:[0,CHASSIS_HEIGHT+ROAD_HEIGHT,-7.2],rotationY:-Math.PI/2,parentId:a.id,slotKey:'road'});
 return g;
}

export function builtVehicle(g:ConnectionGraph,id:string,kind:VehicleKind,position:Vector3Tuple=[0,CHASSIS_HEIGHT,0],on=true){
 const profile=newVehicle(g,kind,id),car:ModuleInstance={...part(id,'car-base',position),vehicleId:id,vehicleKind:kind,color:profile.color};g.addModule(car);
 const attach=(type:ModuleType,key:string,parentId:string)=>{const m:ModuleInstance={...part(id+'/'+key,type),vehicleId:id};g.addModule(m);commitPlacement(g,m.id,slotPose(g,parentId,key));return m;};
 for(const slot of chassisSlots(kind))attach(slot.type,slot.key,id);
 if(kind==='tractor'){const trailer=attach('trailer','trailer',id+'/hitch');for(const slot of TRAILER_SLOTS)attach(slot.type,slot.key,trailer.id);}
 for(const parent of [...g.modules.values()].filter(m=>m.vehicleId===id))for(const slot of mountingSlots(g,parent))if(slot.type==='wheel')attach('wheel',slot.key,parent.id);
 g.modules.get(id+'/switch')!.switchOn=on;reconcileAssembly(g);return car;
}
export function straightRoads(g:ConnectionGraph,count=9,x=0,start=-19.2,prefix='road'){
 const roads=Array.from({length:count},(_,i)=>part(prefix+i,'road-straight',[x,0,start+i*4.8]));roads.forEach(m=>g.addModule(m));
 for(let i=1;i<roads.length;i++)g.connect({id:prefix+'-edge-'+i,fromModuleId:roads[i-1].id,fromPortId:'north',toModuleId:roads[i].id,toPortId:'south',signal:'structural'});
 return roads;
}
export function parkOnRoad(g:ConnectionGraph,id:string,roadId:string,position:Vector3Tuple,yaw=-Math.PI/2){commitPlacement(g,id,{position,rotationY:yaw,parentId:roadId,slotKey:'road'});}
