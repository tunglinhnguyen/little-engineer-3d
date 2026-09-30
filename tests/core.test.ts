import { describe, expect, it } from 'vitest';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { MODULES } from '../src/core/moduleRegistry';
import { SimulationEngine } from '../src/core/simulation';
import { buildVehicleRoute } from '../src/core/worldRoutes';
import { vehicleCanTravel } from '../src/core/vehicleRules';
import type { Connection, ModuleInstance, ModuleType } from '../src/core/types';

const part = (
  id:string,
  type:ModuleType,
  position:[number,number,number]=[0,.65,0],
  rotationY=0,
  switchOn=true,
  slotKey?:string,
):ModuleInstance=>({
  id,type,position,rotationY,slotKey,
  switchOn:type==='switch'||type==='traffic-light'?switchOn:undefined,
});

const port=(type:ModuleType,id:string)=>MODULES[type].ports.find(p=>p.id===id)!;

function connect(
  graph:ConnectionGraph,
  a:ModuleInstance,
  aPort:string,
  b:ModuleInstance,
  bPort:string,
  id?:string,
){
  const normalized=normalizeConnection(a,port(a.type,aPort),b,port(b.type,bPort))!;
  graph.connect({id:id??a.id+'>'+b.id,...normalized} as Connection);
}

function fullCarGraph(switchOn=true){
  const graph=new ConnectionGraph();
  const battery=part('battery','battery',[0,.65,0],0,true,'car:battery');
  const sw=part('switch','switch',[0,.65,0],0,switchOn,'car:switch');
  const motor=part('motor','motor',[0,.65,0],0,true,'car:motor');
  const gearbox=part('gearbox','gearbox',[0,.65,0],0,true,'car:gearbox');
  const diff=part('diff','differential',[0,.65,0],0,true,'car:differential');
  const rear=part('rear','drive-axle',[0,.65,0],0,true,'car:drive-axle');
  const car=part('car','car-base',[0,.65,0],0,true,'road:road-a');
  const front=part('front','front-axle',[0,.65,0],0,true,'car:front-axle');
  const fl=part('fl','wheel',[0,.65,0],0,true,'car:wheel-fl');
  const fr=part('fr','wheel',[0,.65,0],0,true,'car:wheel-fr');
  const rl=part('rl','wheel',[0,.65,0],0,true,'car:wheel-rl');
  const rr=part('rr','wheel',[0,.65,0],0,true,'car:wheel-rr');

  [battery,sw,motor,gearbox,diff,rear,car,front,fl,fr,rl,rr].forEach(m=>graph.addModule(m));

  connect(graph,battery,'power-out',sw,'power-in');
  connect(graph,sw,'power-out',motor,'power-in');
  connect(graph,motor,'rotation-out',gearbox,'rotation-in');
  connect(graph,gearbox,'rotation-out',diff,'rotation-in');
  connect(graph,diff,'rotation-out',rear,'rotation-in');
  connect(graph,rear,'vehicle-out',car,'drive-in');

  connect(graph,car,'front-mount',front,'mount-in','front-mount');
  connect(graph,front,'wheel-left',fl,'mount-in','front-left');
  connect(graph,front,'wheel-right',fr,'mount-in','front-right');

  connect(graph,rear,'wheel-left',rl,'rotation-in','rear-left');
  connect(graph,rear,'wheel-right',rr,'rotation-in','rear-right');

  return {graph,battery,sw,motor,gearbox,diff,rear,car,front,fl,fr,rl,rr};
}

describe('car assembly core',()=>{
  it('keeps power, drive and structural connectors type-safe',()=>{
    expect(portsCompatible(port('battery','power-out'),port('switch','power-in'))).toBe(true);
    expect(portsCompatible(port('motor','rotation-out'),port('gearbox','rotation-in'))).toBe(true);
    expect(portsCompatible(port('car-base','front-mount'),port('front-axle','mount-in'))).toBe(true);
    expect(portsCompatible(port('road-straight','north'),port('road-curve','south'))).toBe(true);
    expect(portsCompatible(port('battery','power-out'),port('drive-axle','rotation-in'))).toBe(false);
  });

  it('drives only the rear axle and rear wheels through the drivetrain',()=>{
    const {graph,motor,gearbox,diff,rear,car,front,fl,fr,rl,rr}=fullCarGraph(true);
    const state=new SimulationEngine(graph).evaluate();

    expect(state.rpm.get(motor.id)).toBe(120);
    expect(state.rpm.get(gearbox.id)).toBeCloseTo(78);
    expect(state.rpm.get(diff.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(rear.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(car.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(rl.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(rr.id)).toBeCloseTo(70.2);

    expect(state.rpm.has(front.id)).toBe(false);
    expect(state.rpm.has(fl.id)).toBe(false);
    expect(state.rpm.has(fr.id)).toBe(false);
  });

  it('stops the drivetrain when the switch is off',()=>{
    const {graph,motor,car,rear,rl,rr}=fullCarGraph(false);
    const state=new SimulationEngine(graph).evaluate();
    expect(state.powered.has(motor.id)).toBe(false);
    expect(state.rpm.has(rear.id)).toBe(false);
    expect(state.rpm.has(car.id)).toBe(false);
    expect(state.rpm.has(rl.id)).toBe(false);
    expect(state.rpm.has(rr.id)).toBe(false);
  });

  it('builds a route through straight, curve and intersection pieces',()=>{
    const {graph,car}=fullCarGraph(true);
    car.position=[0,.65,-2.4];

    const straight=part('road-a','road-straight',[0,.65,-2.4]);
    const curve=part('road-b','road-curve',[0,.65,.5]);
    const cross=part('road-c','road-intersection',[2.9,.65,.5]);
    graph.addModule(straight);
    graph.addModule(curve);
    graph.addModule(cross);
    connect(graph,straight,'north',curve,'south','r1');
    connect(graph,curve,'east',cross,'west','r2');

    const route=buildVehicleRoute(graph,car.id);
    expect(route.length).toBeGreaterThan(8);
    expect(route.some(p=>p[0]>1.5)).toBe(true);

    const state=new SimulationEngine(graph).evaluate();
    expect(vehicleCanTravel(graph,car.id,state.rpm).ready).toBe(true);
  });

  it('previews road snapping without mutating the graph',()=>{
    const graph=new ConnectionGraph();
    const a=part('a','road-straight',[0,.65,0]);
    const b=part('b','road-curve',[.3,.65,2.5]);
    graph.addModule(a);
    graph.addModule(b);

    const preview=graph.previewSnapPose('b',1.5);
    expect(preview).not.toBeNull();
    expect(graph.connections.size).toBe(0);

    expect(graph.snapModule('b')).toBe(true);
    expect(graph.connections.size).toBe(1);
  });

  it('restores slot ownership used by long-press protection',()=>{
    const graph=new ConnectionGraph();
    const motor=part('motor','motor',[1,.65,1],0,true,'car:motor');
    graph.addModule(motor);

    const saved=graph.serialize();
    const restored=new ConnectionGraph();
    restored.restore(saved);

    expect(restored.modules.get('motor')?.slotKey).toBe('car:motor');
  });
});
