import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ConnectionGraph } from '../src/core/connectionGraph';
import { assemblyCount, commitPlacement, descendants, detachAssembly, isInstalled, isMounted, movementRoot, moveGroup, placementCandidates, reconcileAssembly, restoreAssembly, slotPose } from '../src/core/assembly';
import { builtVehicle, parkOnRoad, part, straightRoads } from './fixtures';
import { SimulationEngine } from '../src/core/simulation';
import { vehicleCanTravel } from '../src/core/vehicleRules';
import { vehicleParts } from '../src/core/vehicles';
import { FleetSimulation, footprints, footprintsOverlap } from '../src/core/fleet';
import { vehiclePerformance, measureExperiment } from '../src/core/experiments';
import { chooseDestination, completeAssemblyMission, selectMission } from '../src/core/missions';
import { buildRoute, projectPolyline, roadCenterline } from '../src/core/worldRoutes';
import { createModuleObject, disposeObject } from '../src/three/moduleFactory';
import type { VehicleKind } from '../src/core/types';
const sim=(g:ConnectionGraph)=>new SimulationEngine(g).evaluate();
const tick=(f:FleetSimulation,seconds:number)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)f.step(.05);return f.snapshots();};

describe('independent vehicles and their real mounting geometry',()=>{
 it.each([['car',12,4],['truck',16,6],['tractor',20,8]] as [VehicleKind,number,number][])('%s has %s installed parts and %s independently mounted wheels', (kind,count,wheels)=>{
  const g=new ConnectionGraph();builtVehicle(g,'v',kind);expect(assemblyCount(g,'v')).toBe(count);expect(vehicleParts(g,'v','wheel')).toHaveLength(wheels);
  for(const m of g.modules.values()){expect(movementRoot(g,m.id)).toBe('v');expect(isInstalled(g,m)).toBe(true);if(m.type==='wheel'){const mesh=createModuleObject(m),box=new THREE.Box3().setFromObject(mesh);expect(box.min.y).toBeCloseTo(0,2);disposeObject(mesh);}}
  moveGroup(g,'v',[8,.62,6],.83);expect(assemblyCount(g,'v')).toBe(count);for(const m of g.modules.values())if(m.id!=='v')expect(isMounted(g,m)).toBe(true);
 });
 it('three vehicles keep their own counts, circuits, power switch and valid targets',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'a','car');builtVehicle(g,'b','truck',[8,.62,0]);builtVehicle(g,'c','tractor',[16,.62,0]);
  expect([assemblyCount(g,'a'),assemblyCount(g,'b'),assemblyCount(g,'c')]).toEqual([12,16,20]);g.modules.get('b/switch')!.switchOn=false;
  expect(sim(g).rpm.get('a/motor')).toBe(120);expect(sim(g).rpm.get('b/motor')).toBeUndefined();expect(sim(g).rpm.get('c/motor')).toBe(120);
  detachAssembly(g,'a/battery',[-4,.2,4]);detachAssembly(g,'b/battery',[12,.2,4]);const targets=placementCandidates(g,'a/battery');expect(targets.map(p=>p.parentId)).toEqual(['a']);
  const before=JSON.stringify(g.serialize());commitPlacement(g,'a/battery',slotPose(g,'b','battery'));expect(JSON.stringify(g.serialize())).toBe(before);
  expect(sim(g).rpm.get('c/motor')).toBe(120);for(const c of g.connections.values())expect(g.modules.get(c.fromModuleId)?.vehicleId).toBe(g.modules.get(c.toModuleId)?.vehicleId);
 });
 it('a prebuilt loose axle rekeys its bearings correctly when mounted on a trailer',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','tractor');detachAssembly(g,'v/trailer-front-axle',[-6,.33,2]);expect(descendants(g,'v/trailer-front-axle')).toHaveLength(3);
  commitPlacement(g,'v/trailer-front-axle',slotPose(g,'v/trailer','trailer-front-axle'));expect(assemblyCount(g,'v')).toBe(20);expect(isMounted(g,g.modules.get('v/wheel-tfl'))).toBe(true);
 });
 it('detaching a hitch carries the trailer, axles and wheels; the tractor still has a complete drivetrain',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','tractor');expect(descendants(g,'v/hitch')).toHaveLength(8);detachAssembly(g,'v/hitch',[-7,.72,3]);expect(assemblyCount(g,'v')).toBe(12);expect(isMounted(g,g.modules.get('v/trailer'))).toBe(true);expect(sim(g).rpm.get('v/wheel-rl')).toBe(20);
 });
 it('save and reload preserves all vehicle identities, colors, cargo, gearing, missions and parked state',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'a','car');builtVehicle(g,'b','truck',[8,.62,0]);g.vehicles.get('a')!.parked=true;g.vehicles.get('b')!.name='Xe của bé';g.vehicles.get('b')!.cargo=3;g.modules.get('b/gearbox')!.gearMode='power';selectMission(g,'b','delivery');
  const saved=JSON.parse(JSON.stringify(g.serialize())),restored=new ConnectionGraph();restored.restore(saved);restoreAssembly(restored);expect(restored.serialize().vehicles).toEqual(saved.vehicles);expect(assemblyCount(restored,'b')).toBe(16);expect(sim(restored).rpm.get('b/wheel-rl')).toBe(10);
 });
 it('vehicle readiness counts only its own complete assembly and ignores another unfinished vehicle',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'a','car');builtVehicle(g,'b','truck',[8,.62,0]);const roads=straightRoads(g);parkOnRoad(g,'a',roads[3].id,[0,.74,-4.8]);detachAssembly(g,'b/battery',[12,.2,3]);expect(vehicleCanTravel(g,'a',sim(g).rpm).ready).toBe(true);expect(vehicleCanTravel(g,'b',sim(g).rpm).ready).toBe(false);
 });
});

describe('gearbox, load and measured experiments',()=>{
 it('a selectable ratio changes actual tooth counts, RPM and wheel torque consistently',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','car');let previous=Infinity;
  for(const [mode,teeth,rpm] of [['power',48,10],['balanced',24,20],['speed',12,40]] as const){const gearbox=g.modules.get('v/gearbox')!;gearbox.gearMode=mode;const state=sim(g);expect(state.rpm.get('v/wheel-rl')).toBe(rpm);expect(state.torque.get('v/wheel-rl')!).toBeLessThan(previous);previous=state.torque.get('v/wheel-rl')!;const object=createModuleObject(gearbox),found:number[]=[];object.traverse(o=>{if(o.userData.teeth)found.push(o.userData.teeth);});expect(found).toEqual([12,teeth]);disposeObject(object);}
 });
 it('heavier loads reduce acceleration and travel; a lower ratio raises pulling force and can recover from overload',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','truck');const empty=vehiclePerformance(g,'v');g.vehicles.get('v')!.cargo=6;const heavy=vehiclePerformance(g,'v');expect(heavy.acceleration).toBeLessThan(empty.acceleration);expect(heavy.speed).toBeLessThan(empty.speed);
  g.modules.get('v/gearbox')!.gearMode='speed';expect(vehiclePerformance(g,'v').stalled).toBe(true);expect(measureExperiment(g,'v').distance).toBe(0);g.modules.get('v/gearbox')!.gearMode='power';expect(vehiclePerformance(g,'v').stalled).toBe(false);expect(measureExperiment(g,'v').distance).toBeGreaterThan(0);
 });
 it('the 10-second measurement agrees with actual fleet motion using the same load model',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','truck');g.vehicles.get('v')!.cargo=3;const roads=straightRoads(g,15,0,-33.6);parkOnRoad(g,'v',roads[3].id,[0,.74,-19.2]);const expected=measureExperiment(g,'v'),fleet=new FleetSimulation(g,['v']),before=fleet.drives.get('v')!.distance;tick(fleet,10);expect(fleet.drives.get('v')!.distance-before).toBeCloseTo(expected.distance,1);
 });
 it('unmounting a loaded bed removes its load from the vehicle while preserving cargo for reattachment',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','truck');g.vehicles.get('v')!.cargo=6;const heavy=vehiclePerformance(g,'v');detachAssembly(g,'v/cargo-bed',[6,0,4]);expect(vehiclePerformance(g,'v').mass).toBeLessThan(heavy.mass);expect(g.vehicles.get('v')!.cargo).toBe(6);
 });
});

describe('fleet safety and mission lifecycle',()=>{
 it('a moving follower stops before a stationary vehicle without intersection or teleporting',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'front','car');builtVehicle(g,'rear','car');const roads=straightRoads(g);parkOnRoad(g,'front',roads[5].id,[0,.74,4.8]);parkOnRoad(g,'rear',roads[3].id,[0,.74,-4.8]);g.modules.get('front/switch')!.switchOn=false;const fleet=new FleetSimulation(g,['rear']);
  for(let i=0;i<700;i++){fleet.step(.05);expect(footprints(g,'front').some(a=>footprints(g,'rear').some(b=>footprintsOverlap(a,b,0)))).toBe(false);}
  expect(fleet.drives.get('rear')!.speed).toBe(0);expect(fleet.drives.get('rear')!.reason).toContain('khoảng cách');expect(g.modules.get('rear')!.position[2]).toBeLessThan(1.41);
 });
 it('crossing vehicles reserve the intersection and both eventually pass without overlap or deadlock',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'a','car');builtVehicle(g,'b','car');const roads=[part('s','road-straight',[0,0,-4.8]),part('j','road-intersection'),part('n','road-straight',[0,0,4.8]),part('w','road-straight',[-4.8,0,0],Math.PI/2),part('e','road-straight',[4.8,0,0],Math.PI/2)];roads.forEach(m=>g.addModule(m));
  for(const [a,ap,b,bp] of [['s','north','j','south'],['j','north','n','south'],['w','north','j','west'],['j','east','e','south']])g.connect({id:a+b,fromModuleId:a,fromPortId:ap,toModuleId:b,toPortId:bp,signal:'structural'});
  parkOnRoad(g,'a','s',[0,.74,-4.8]);parkOnRoad(g,'b','w',[-4.8,.74,0],0);const fleet=new FleetSimulation(g,['a','b']);expect(fleet.drives.size).toBe(2);
  for(let i=0;i<1200;i++){fleet.step(.05);expect(footprints(g,'a').some(a=>footprints(g,'b').some(b=>footprintsOverlap(a,b,0)))).toBe(false);}
  expect(g.modules.get('a')!.position[2]).toBeGreaterThan(4);expect(g.modules.get('b')!.position[0]).toBeGreaterThan(4);
 });
 it('switching one vehicle off holds its pose while the other vehicle keeps moving; stop all freezes every pose',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'a','car');builtVehicle(g,'b','truck');const a=straightRoads(g,9,0,-19.2,'a-road'),b=straightRoads(g,9,7,-19.2,'b-road');parkOnRoad(g,'a',a[2].id,[0,.74,-9.6]);parkOnRoad(g,'b',b[2].id,[7,.74,-9.6]);const fleet=new FleetSimulation(g,['a','b']);tick(fleet,2);g.modules.get('a/switch')!.switchOn=false;const first=[...g.modules.get('a')!.position],second=[...g.modules.get('b')!.position];tick(fleet,2);expect(g.modules.get('a')!.position).toEqual(first);expect(g.modules.get('b')!.position[2]).toBeGreaterThan(second[2]);fleet.stop();const parked=JSON.stringify(g.serialize());tick(fleet,2);expect(JSON.stringify(g.serialize())).toBe(parked);
 });
 it('delivery requires a reachable destination ahead, unloads once on arrival and remains completed after reload',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','truck');const roads=straightRoads(g);parkOnRoad(g,'v',roads[2].id,[0,.74,-9.6]);selectMission(g,'v','delivery');expect(chooseDestination(g,'v',roads[1].id)).not.toBeNull();expect(chooseDestination(g,'v',roads[5].id)).toBeNull();expect(vehicleCanTravel(g,'v',sim(g).rpm).ready).toBe(false);g.vehicles.get('v')!.cargo=3;
  const fleet=new FleetSimulation(g,['v']);tick(fleet,50);expect(g.vehicles.get('v')!.mission).toMatchObject({kind:'delivery',status:'completed',delivered:3});expect(g.vehicles.get('v')!.cargo).toBe(0);expect(fleet.completed).toEqual(['v']);const before=[...g.modules.get('v')!.position];tick(fleet,2);expect(g.modules.get('v')!.position).toEqual(before);
  const restored=new ConnectionGraph();restored.restore(JSON.parse(JSON.stringify(g.serialize())));restoreAssembly(restored);expect(restored.vehicles.get('v')!.mission?.status).toBe('completed');
 });
 it('a trailer mission completes only with a mounted trailer and its full axle/wheel assembly',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','tractor');detachAssembly(g,'v/wheel-tfl',[5,.33,5]);selectMission(g,'v','trailer');expect(g.vehicles.get('v')!.mission?.status).toBe('choose');commitPlacement(g,'v/wheel-tfl',slotPose(g,'v/trailer-front-axle','wheel-tfl'));expect(completeAssemblyMission(g,'v')).toBe(true);expect(completeAssemblyMission(g,'v')).toBe(false);
 });
});

describe('long vehicles, articulated trailers and routes chosen at branches',()=>{
 it('a tractor cannot start with trailer wheels past the road end, but can start after being placed fully on the road',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','tractor');const roads=straightRoads(g,5,0,-9.6);
  parkOnRoad(g,'v',roads[0].id,[0,.74,-9.6]);expect(vehicleCanTravel(g,'v',sim(g).rpm).message).toContain('Bánh xe');
  expect(new FleetSimulation(g,['v']).drives.size).toBe(0);
  parkOnRoad(g,'v',roads[2].id,[0,.74,0]);expect(vehicleCanTravel(g,'v',sim(g).rpm).ready).toBe(true);
 });
 it('a container follows a wide curve with an exact hitch, delayed trailer heading, grounded wheels and persisted articulation',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','tractor');const roads=[part('a0','road-straight',[0,0,-20]),part('a1','road-straight',[0,0,-15.2]),part('a2','road-straight',[0,0,-10.4]),part('bend','road-wide-curve'),part('b0','road-straight',[10.4,0,0],Math.PI/2),part('b1','road-straight',[15.2,0,0],Math.PI/2),part('b2','road-straight',[20,0,0],Math.PI/2)];roads.forEach(m=>g.addModule(m));
  for(let i=1;i<roads.length;i++)g.connect({id:'edge'+i,fromModuleId:roads[i-1].id,fromPortId:i===4?'east':'north',toModuleId:roads[i].id,toPortId:'south',signal:'structural'});
  parkOnRoad(g,'v','a1',[0,.74,-15.2]);expect(vehicleCanTravel(g,'v',sim(g).rpm).ready).toBe(true);const f=new FleetSimulation(g,['v']);let maxLag=0;
  for(let i=0;i<1500;i++){f.step(.05);const car=g.modules.get('v')!,trailer=g.modules.get('v/trailer')!,hitch=g.modules.get('v/hitch')!;trailer.position.forEach((value,index)=>expect(value).toBeCloseTo(hitch.position[index],8));expect(assemblyCount(g,'v')).toBe(20);maxLag=Math.max(maxLag,Math.abs(car.rotationY-trailer.rotationY));
   for(const wheel of vehicleParts(g,'v','wheel')){expect(wheel.position[1]).toBeCloseTo(.45,6);const covered=roads.some(road=>projectPolyline(roadCenterline(road),wheel.position).distance+.12<=(road.type==='road-wide-curve'?2.2:1.65)+.05);expect(covered,'Wheel '+wheel.id+' at '+wheel.position).toBe(true);}
  }
  expect(maxLag).toBeGreaterThan(.15);expect(g.modules.get('v')!.position[0]).toBeGreaterThan(8);const saved=g.serialize(),restored=new ConnectionGraph();restored.restore(JSON.parse(JSON.stringify(saved)));restoreAssembly(restored);expect(assemblyCount(restored,'v')).toBe(20);expect(restored.modules.get('v/trailer')!.rotationY).toBeCloseTo(g.modules.get('v/trailer')!.rotationY,8);
 });
 it('a mission can route a car into a chosen side branch while a long vehicle diagnoses the tight intersection turn',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','car');
  const roads=[part('s','road-straight',[0,0,-4.8]),part('j','road-intersection'),part('n','road-straight',[0,0,4.8]),part('e','road-straight',[4.8,0,0],Math.PI/2),part('goal','road-straight',[9.6,0,0],Math.PI/2)];
  roads.forEach(m=>g.addModule(m));
  for(const [a,ap,b,bp] of [['s','north','j','south'],['j','north','n','south'],['j','east','e','south'],['e','north','goal','south']])g.connect({id:a+b,fromModuleId:a,fromPortId:ap,toModuleId:b,toPortId:bp,signal:'structural'});
  parkOnRoad(g,'v','s',[0,.74,-4.8]);selectMission(g,'v','garage');expect(chooseDestination(g,'v','goal')).toBeNull();
  expect(buildRoute(g,'v',{destinationRoadId:'goal'}).ranges.map(r=>r.roadId)).toEqual(['s','j','e','goal']);
  const f=new FleetSimulation(g,['v']);tick(f,40);expect(g.vehicles.get('v')!.mission?.status).toBe('completed');expect(g.modules.get('v')!.position[0]).toBeGreaterThan(7);expect(Math.abs(g.modules.get('v')!.position[2])).toBeLessThan(.1);
  builtVehicle(g,'truck','truck');parkOnRoad(g,'truck','s',[0,.74,-4.8]);selectMission(g,'truck','garage');expect(chooseDestination(g,'truck','e')).toBeNull();expect(vehicleCanTravel(g,'truck',sim(g).rpm).message).toContain('Cua rộng');
 });
 it('delivery cargo is not considered aboard when its bed is detached',()=>{
  const g=new ConnectionGraph();builtVehicle(g,'v','truck');const roads=straightRoads(g);parkOnRoad(g,'v',roads[2].id,[0,.74,-9.6]);g.vehicles.get('v')!.cargo=3;selectMission(g,'v','delivery');chooseDestination(g,'v',roads[5].id);detachAssembly(g,'v/cargo-bed',[6,.2,3]);expect(vehicleCanTravel(g,'v',sim(g).rpm).ready).toBe(false);expect(new FleetSimulation(g,['v']).drives.size).toBe(0);
 });
});
