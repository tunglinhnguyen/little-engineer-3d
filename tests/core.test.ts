import { describe, expect, it } from 'vitest';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { MODULES } from '../src/core/moduleRegistry';
import { SimulationEngine } from '../src/core/simulation';
import { buildVehicleRoute } from '../src/core/worldRoutes';
import { vehicleCanTravel } from '../src/core/vehicleRules';
import type { Connection, ModuleInstance, ModuleType } from '../src/core/types';

const part = (
  id:string,type:ModuleType,position:[number,number,number]=[0,.65,0],rotationY=0,switchOn=true,
):ModuleInstance=>({
  id,type,position,rotationY,
  switchOn:type==='switch'||type==='traffic-light'?switchOn:undefined,
});

const port=(type:ModuleType,id:string)=>MODULES[type].ports.find(p=>p.id===id)!;

function connect(
  graph:ConnectionGraph,a:ModuleInstance,aPort:string,b:ModuleInstance,bPort:string,id?:string,
){
  const normalized=normalizeConnection(a,port(a.type,aPort),b,port(b.type,bPort))!;
  graph.connect({id:id??a.id+'>'+b.id,...normalized} as Connection);
}

function fullCarGraph(switchOn=true){
  const graph=new ConnectionGraph();
  const battery=part('battery','battery');
  const sw=part('switch','switch',[0,.65,0],0,switchOn);
  const motor=part('motor','motor');
  const gearbox=part('gearbox','gearbox');
  const diff=part('diff','differential');
  const rear=part('rear','drive-axle');
  const car=part('car','car-base');
  const front=part('front','front-axle');
  const fl=part('fl','wheel'),fr=part('fr','wheel'),rl=part('rl','wheel'),rr=part('rr','wheel');

  [battery,sw,motor,gearbox,diff,rear,car,front,fl,fr,rl,rr].forEach(m=>graph.addModule(m));
  connect(graph,battery,'power-out',sw,'power-in');
  connect(graph,sw,'power-out',motor,'power-in');
  connect(graph,motor,'rotation-out',gearbox,'rotation-in');
  connect(graph,gearbox,'rotation-out',diff,'rotation-in');
  connect(graph,diff,'rotation-out',rear,'rotation-in');
  connect(graph,rear,'vehicle-out',car,'vehicle-in');
  connect(graph,car,'front-out',front,'rotation-in');
  connect(graph,rear,'wheel-left',rl,'rotation-in');
  connect(graph,rear,'wheel-right',rr,'rotation-in');
  connect(graph,front,'wheel-left',fl,'rotation-in');
  connect(graph,front,'wheel-right',fr,'rotation-in');

  return {graph,battery,sw,motor,gearbox,diff,rear,car,front,wheels:[fl,fr,rl,rr]};
}

describe('car drivetrain and road network',()=>{
  it('keeps power rotation and road connectors type-safe',()=>{
    expect(portsCompatible(port('battery','power-out'),port('switch','power-in'))).toBe(true);
    expect(portsCompatible(port('motor','rotation-out'),port('gearbox','rotation-in'))).toBe(true);
    expect(portsCompatible(port('road-straight','north'),port('road-curve','south'))).toBe(true);
    expect(portsCompatible(port('battery','power-out'),port('drive-axle','rotation-in'))).toBe(false);
  });

  it('propagates RPM through gearbox differential axles chassis and four separate wheels',()=>{
    const {graph,motor,gearbox,diff,rear,car,front,wheels}=fullCarGraph(true);
    const state=new SimulationEngine(graph).evaluate();
    expect(state.rpm.get(motor.id)).toBe(120);
    expect(state.rpm.get(gearbox.id)).toBeCloseTo(78);
    expect(state.rpm.get(diff.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(rear.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(car.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(front.id)).toBeCloseTo(70.2);
    for(const wheel of wheels) expect(state.rpm.get(wheel.id)).toBeCloseTo(70.2);
  });

  it('stops the entire drivetrain when the electrical switch is off',()=>{
    const {graph,motor,car,wheels}=fullCarGraph(false);
    const state=new SimulationEngine(graph).evaluate();
    expect(state.powered.has(motor.id)).toBe(false);
    expect(state.rpm.has(car.id)).toBe(false);
    for(const wheel of wheels) expect(state.rpm.has(wheel.id)).toBe(false);
  });

  it('builds a route through straight, curve and intersection pieces',()=>{
    const {graph,car}=fullCarGraph(true);
    car.position=[0,.65,-2.4];

    const straight=part('road-a','road-straight',[0,.65,-2.4]);
    const curve=part('road-b','road-curve',[0,.65,.5]);
    const cross=part('road-c','road-intersection',[2.9,.65,.5]);
    graph.addModule(straight);graph.addModule(curve);graph.addModule(cross);
    connect(graph,straight,'north',curve,'south','r1');
    connect(graph,curve,'east',cross,'west','r2');

    const route=buildVehicleRoute(graph,car.id);
    expect(route.length).toBeGreaterThan(8);
    expect(route.some(p=>p[0]>1.5)).toBe(true);
    const state=new SimulationEngine(graph).evaluate();
    expect(vehicleCanTravel(graph,car.id,state.rpm).ready).toBe(true);
  });

  it('previews structural road snapping without mutating the graph',()=>{
    const graph=new ConnectionGraph();
    const a=part('a','road-straight',[0,.65,0]);
    const b=part('b','road-curve',[.3,.65,2.5]);
    graph.addModule(a);graph.addModule(b);
    const preview=graph.previewSnapPose('b',1.5);
    expect(preview).not.toBeNull();
    expect(graph.connections.size).toBe(0);
    expect(graph.snapModule('b')).toBe(true);
    expect(graph.connections.size).toBe(1);
  });
});
