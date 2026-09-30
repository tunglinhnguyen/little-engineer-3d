import { MODULES } from './moduleRegistry';
import { ConnectionGraph } from './connectionGraph';
import type { SimulationState } from './types';

export class SimulationEngine {
 constructor(private graph:ConnectionGraph){}
 evaluate():SimulationState{
  const powered=new Set<string>(),active=new Set<string>(),rpm=new Map<string,number>(),voltage=new Map<string,number>(),current=new Map<string,number>(),torque=new Map<string,number>();
  const supplyEdges=(id:string)=>this.graph.outgoing(id,'power').filter(e=>MODULES[this.graph.modules.get(id)!.type].ports.find(p=>p.id===e.fromPortId)?.mate==='supply');
  const sources=[...this.graph.modules.values()].filter(m=>MODULES[m.type].behavior.kind==='source');
  for(const source of sources){
   const behavior=MODULES[source.type].behavior;if(behavior.kind!=='source')continue;
   powered.add(source.id);voltage.set(source.id,behavior.voltage);current.set(source.id,0);
   const seen=new Set([source.id]),queue=[source.id];
   for(let i=0;i<queue.length;i++){
    const id=queue[i],module=this.graph.modules.get(id)!;
    if(module.type==='switch'&&module.switchOn===false)continue;
    for(const e of supplyEdges(id)){
     const next=this.graph.modules.get(e.toModuleId);if(!next||seen.has(next.id))continue;
     seen.add(next.id);powered.add(next.id);voltage.set(next.id,behavior.voltage);queue.push(next.id);
     // A positive feed alone cannot run a motor: its return must reach the same battery.
     if(next.type==='motor'&&this.graph.outgoing(next.id,'power').some(c=>c.fromPortId==='return-out'&&c.toModuleId===source.id&&c.toPortId==='return-in')){
      const motor=MODULES.motor.behavior;if(motor.kind!=='motor')continue;
      active.add(next.id);rpm.set(next.id,motor.rpm);torque.set(next.id,motor.torque);current.set(next.id,.45);current.set(source.id,(current.get(source.id)??0)+.45);
     }
    }
   }
  }
  const queue=[...rpm.keys()];
  for(let i=0;i<queue.length;i++){
   const id=queue[i];
   for(const e of this.graph.outgoing(id,'rotation')){
    const next=this.graph.modules.get(e.toModuleId);if(!next||rpm.has(next.id))continue;
    const b=MODULES[next.type].behavior;let speed=rpm.get(id)!,force=torque.get(id)!;
    if(b.kind==='transmission'){speed*=b.ratio;force=force/Math.abs(b.ratio)*b.efficiency;}
    else if(b.kind==='pass-rotation')force*=b.efficiency;
    else if(b.kind==='wheel')force*=.5;
    else continue; // Neither a chassis nor a passive front axle receives RPM.
    rpm.set(next.id,speed);torque.set(next.id,force);active.add(next.id);
    if(b.kind!=='wheel')queue.push(next.id);
   }
  }
  for(const id of powered)if((current.get(id)??0)>0||this.graph.modules.get(id)?.type==='switch'&&this.graph.modules.get(id)?.switchOn!==false)active.add(id);
  return {powered,active,rpm,voltage,current,torque};
 }
}
