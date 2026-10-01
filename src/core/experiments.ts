import type { ConnectionGraph } from './connectionGraph';
import { isInstalled } from './assembly';
import { GEAR_RATIOS, vehicleKind, vehicleParts, vehicleSpec } from './vehicles';
import { WHEEL_RADIUS } from './layout';
import type { ExperimentResult, GearMode } from './types';

export function cargoCapacity(g:ConnectionGraph,id:string){return vehicleKind(g,id)==='car'?2:6;}
export function cargoCarrier(g:ConnectionGraph,id:string){
 const kind=vehicleKind(g,id);return kind==='car'?g.modules.get(id):vehicleParts(g,id,kind==='truck'?'cargo-bed':'trailer').find(m=>isInstalled(g,m));
}
export function vehiclePerformance(g:ConnectionGraph,id:string,override?:{gear?:GearMode;cargo?:number}){
 const kind=vehicleKind(g,id),gear=override?.gear??vehicleParts(g,id,'gearbox')[0]?.gearMode??'balanced';
 const cargo=Math.max(0,Math.min(cargoCapacity(g,id),override?.cargo??(cargoCarrier(g,id)?g.vehicles.get(id)?.cargo??0:0)));
 const trailer=vehicleParts(g,id,'trailer').some(m=>isInstalled(g,m));
 const mass=vehicleSpec(kind).mass+(trailer?3:0)+cargo*2;
 const ratio=Math.abs(GEAR_RATIOS[gear]),rpm=120*ratio/3,torque=.35/ratio*.92*3*.95*.98;
 const force=torque/WHEEL_RADIUS,resistance=mass*.14,stalled=force<=resistance;
 const speed=stalled?0:rpm*2*Math.PI*WHEEL_RADIUS/60*(1-resistance/force);
 const acceleration=Math.max(0,(force-resistance)/mass);
 return {gear,cargo,mass,rpm,force,resistance,speed,acceleration,stalled};
}
export function measureExperiment(g:ConnectionGraph,id:string,seconds=10,override?:{gear?:GearMode;cargo?:number}):ExperimentResult{
 const p=vehiclePerformance(g,id,override),duration=Math.max(0,seconds),ramp=p.acceleration>0?Math.min(duration,p.speed/p.acceleration):0;
 const distance=.5*p.acceleration*ramp*ramp+p.speed*(duration-ramp);
 return {gear:p.gear,cargo:p.cargo,speed:p.speed,distance,force:p.force,stalled:p.stalled};
}
