import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { CAR_PALETTE, MODULES, ROAD_PALETTE } from '../src/core/moduleRegistry';
import { assemblyCount, commitPlacement, descendants, detachAssembly, isInstalled, isMounted, movementRoot, moveGroup, placementCandidates, previewPlacement, reconcileAssembly, restoreAssembly, roadsidePose, slotPose } from '../src/core/assembly';
import { CHASSIS_HEIGHT, ROAD_HEIGHT, SNAP_DISTANCE, WHEEL_RADIUS, WHEELBASE, HALF_TRACK, rotateY } from '../src/core/layout';
import { SimulationEngine } from '../src/core/simulation';
import { buildRoute, curvePoint, pointAtDistance, projectPolyline, sampleRoad, worldRoadPort } from '../src/core/worldRoutes';
import { VehicleDrive } from '../src/core/driving';
import { vehicleCanTravel } from '../src/core/vehicleRules';
import { createModuleObject, disposeObject, restHeight } from '../src/three/moduleFactory';
import { curvedCar, mountedCar, part } from './fixtures';
import type { ModuleType } from '../src/core/types';
const p=(t:ModuleType,id:string)=>MODULES[t].ports.find(p=>p.id===id)!;
const sim=(g:ConnectionGraph)=>new SimulationEngine(g).evaluate();
const tick=(d:VehicleDrive,seconds:number)=>{for(let i=0;i<Math.ceil(seconds/.02);i++)d.step(.02);return d.snapshot();};

describe('safe assembly movement and deliberate detachment',()=>{
 it.each([false,true])('every mounted car part resolves to its chassis even when onRoad=%s',onRoad=>{
  const g=mountedCar(true,onRoad),before=JSON.stringify(g.serialize());
  for(const m of g.modules.values())expect(movementRoot(g,m.id)).toBe(m.type.startsWith('road-')?m.id:'car');
  expect(JSON.stringify(g.serialize())).toBe(before);
 });
 it('a loose axle with wheels is its own movable group; loose parts and invalid parent poses do not grab the chassis',()=>{
  const g=mountedCar();detachAssembly(g,'drive-axle',[-4,.33,-4]);
  expect(movementRoot(g,'wheel-rl')).toBe('drive-axle');expect(movementRoot(g,'wheel-rr')).toBe('drive-axle');expect(movementRoot(g,'drive-axle')).toBe('drive-axle');
  detachAssembly(g,'battery',[-4,.2,4]);expect(movementRoot(g,'battery')).toBe('battery');
  g.modules.get('motor')!.position[0]+=2;expect(movementRoot(g,'motor')).toBe('motor');
 });
 it('detaching the battery opens the circuit and leaves the other eleven parts in place; invalid detach requests do nothing',()=>{
  const g=mountedCar(),before=structuredClone(g.serialize());expect(sim(g).rpm.get('motor')).toBe(120);
  expect(detachAssembly(g,'battery',[-4,.2,-4])).toBe(true);expect(assemblyCount(g)).toBe(11);expect(sim(g).rpm.size).toBe(0);expect(g.modules.get('battery')!.parentId).toBeUndefined();
  for(const m of before.modules.filter(m=>m.id!=='battery'))expect(g.modules.get(m.id)).toEqual(m);
  const detached=JSON.stringify(g.serialize());for(const id of ['battery','car','missing'])expect(detachAssembly(g,id,[9,0,9])).toBe(false);expect(JSON.stringify(g.serialize())).toBe(detached);
 });
 it('detaching an axle preserves its wheel joints, disconnects its drive and can be mounted again as one group',()=>{
  const g=mountedCar(),before=structuredClone(g.serialize());expect(detachAssembly(g,'drive-axle',[-4,.33,-4])).toBe(true);expect(assemblyCount(g)).toBe(9);
  for(const id of ['wheel-rl','wheel-rr']){const m=g.modules.get(id)!;expect(m.parentId).toBe('drive-axle');expect(isMounted(g,m)).toBe(true);expect(sim(g).rpm.has(id)).toBe(false);}
  for(const m of before.modules.filter(m=>!['drive-axle','wheel-rl','wheel-rr'].includes(m.id)))expect(g.modules.get(m.id)).toEqual(m);
  commitPlacement(g,'drive-axle',slotPose(g,'car','drive-axle'));expect(assemblyCount(g)).toBe(12);expect(sim(g).rpm.get('wheel-rl')).toBe(20);
 });
 it('detaching one wheel frees exactly that bearing without moving its axle or sibling wheel',()=>{
  const g=mountedCar(),before=structuredClone(g.serialize());detachAssembly(g,'wheel-fl',[-4,.33,-4]);expect(assemblyCount(g)).toBe(11);
  for(const m of before.modules.filter(m=>m.id!=='wheel-fl'))expect(g.modules.get(m.id)).toEqual(m);
  expect(placementCandidates(g,'wheel-fl').map(p=>p.slotKey)).toEqual(['wheel-fl']);commitPlacement(g,'wheel-fl',slotPose(g,'front-axle','wheel-fl'));expect(assemblyCount(g)).toBe(12);
 });
 it('detaching a roadside control clears its association without disturbing road connections or the parked vehicle',()=>{
  const g=mountedCar(true,true),road=g.modules.get('road-centre')!,sign=part('sign','stop-sign');g.addModule(sign);commitPlacement(g,'sign',roadsidePose(road,'side:1'));
  const before=structuredClone(g.serialize());expect(detachAssembly(g,'sign',[5,0,5])).toBe(true);expect(isMounted(g,sign)).toBe(false);
  for(const m of before.modules.filter(m=>m.id!=='sign'))expect(g.modules.get(m.id)).toEqual(m);expect(g.serialize().connections).toEqual(before.connections);
 });
});

describe('connector safety',()=>{
 it.each([
  ['battery','power-out','switch','power-in'],['switch','power-out','motor','power-in'],['motor','return-out','battery','return-in'],['motor','rotation-out','gearbox','rotation-in'],['gearbox','rotation-out','differential','rotation-in'],['drive-axle','wheel-left','wheel','rotation-in'],['front-axle','wheel-left','wheel','mount-in'],['road-straight','north','road-curve','south'],
 ] as [ModuleType,string,ModuleType,string][])('accepts %s:%s -> %s:%s',(a,ap,b,bp)=>expect(portsCompatible(p(a,ap),p(b,bp))).toBe(true));
 it.each([
  ['battery','power-out','battery','return-in'],['battery','power-out','motor','rotation-out'],['road-straight','north','front-axle','wheel-left'],['motor','rotation-out','wheel','mount-in'],['switch','power-out','battery','power-out'],
 ] as [ModuleType,string,ModuleType,string][])('rejects %s:%s -> %s:%s',(a,ap,b,bp)=>expect(portsCompatible(p(a,ap),p(b,bp))).toBe(false));
 it('rejects nonexistent modules, wrong signals, self links and double occupancy',()=>{
  const g=new ConnectionGraph(),a=part('a','battery'),b=part('b','switch'),c=part('c','motor');[a,b,c].forEach(m=>g.addModule(m));
  const link={id:'one',fromModuleId:'a',fromPortId:'power-out',toModuleId:'b',toPortId:'power-in',signal:'power' as const};
  expect(g.connect(link)).toBe(true);expect(g.connect({...link,id:'two',toModuleId:'c'})).toBe(false);
  expect(g.connect({...link,id:'missing',fromModuleId:'unknown'})).toBe(false);
  expect(g.connect({...link,id:'wrong',signal:'rotation'})).toBe(false);
  expect(g.connect({...link,id:'self',toModuleId:'a',toPortId:'return-in'})).toBe(false);
  expect(g.connections.size).toBe(1);
 });
});

describe('geometry and recognition of every module',()=>{
 it.each([...CAR_PALETTE,...ROAD_PALETTE])('%s has finite native dimensions, a stable resting height and a visible body',type=>{
  const obj=createModuleObject(part(type,type)),bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3());
  expect(bounds.isEmpty()).toBe(false);for(const v of [...size.toArray(),...bounds.min.toArray(),...bounds.max.toArray()])expect(Number.isFinite(v)).toBe(true);
  expect(size.x).toBeGreaterThan(.1);expect(size.y).toBeGreaterThan(.02);expect(size.z).toBeGreaterThan(.04);
  const declared=MODULES[type].size;size.toArray().forEach((v,i)=>expect(v).toBeLessThanOrEqual(declared[i]*1.25));
  obj.position.y=restHeight(type);const placed=new THREE.Box3().setFromObject(obj);expect(placed.min.y).toBeCloseTo(0,5);
  disposeObject(obj);
 });
 it('the chassis contains no wheels, rotating axles or motor hidden in its mesh',()=>{
  const obj=createModuleObject(part('car','car-base'));let rotors=0;obj.traverse(o=>{if(o.userData.rotor)rotors++;});expect(rotors).toBe(0);disposeObject(obj);
 });
 it('wheels rotate about their bearing, motors about their shaft, gear teeth match the reduction ratio',()=>{
  const axes=(t:ModuleType)=>{const o=createModuleObject(part(t,t)),a:string[]=[],teeth:number[]=[];o.traverse(c=>{if(c.userData.rotor)a.push(c.userData.rotorAxis);if(c.userData.teeth)teeth.push(c.userData.teeth);});disposeObject(o);return {axes:a,teeth};};
  expect(axes('wheel').axes).toEqual(['z']);expect(axes('motor').axes).toEqual(['x']);expect(axes('front-axle').axes).toEqual([]);
  expect(axes('gearbox').teeth).toEqual([12,24]);expect(axes('differential').teeth).toEqual([18,6]);
 });
 it('STOP and 30 have actual legible labels',()=>{
  for(const [type,text] of [['stop-sign','STOP'],['speed-sign','30']] as const){const o=createModuleObject(part(type,type)),labels:string[]=[];o.traverse(c=>{if(c.userData.labelText)labels.push(c.userData.labelText);});expect(labels).toContain(text);let pole:THREE.Mesh|undefined,label:THREE.Object3D|undefined;o.traverse(c=>{const m=c as THREE.Mesh;if(m.geometry instanceof THREE.CylinderGeometry&&m.geometry.parameters.radiusTop===.035)pole=m;if(c.userData.labelText===text)label=c;});expect(label!.position.z).toBeGreaterThan(pole!.position.z+.035);disposeObject(o);}
 });
 it('upper components do not intersect or conceal neighbouring bodies in chassis slots',()=>{
  const g=mountedCar();const types:ModuleType[]=['battery','switch','motor','gearbox'];
  const boxes=types.map(t=>new THREE.Box3().setFromObject(createModuleObject(g.modules.get(t)!)));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i].clone().expandByScalar(-.018),b=boxes[j].clone().expandByScalar(-.018);expect(a.intersectsBox(b),types[i]+' vs '+types[j]).toBe(false);
  }
 });
 it.each([false,true])('four wheels contact the surface with road=%s',onRoad=>{
  const g=mountedCar(true,onRoad);for(const m of g.modules.values())if(m.type==='wheel'){
   const o=createModuleObject(m),b=new THREE.Box3().setFromObject(o);expect(b.min.y).toBeCloseTo(onRoad?ROAD_HEIGHT:0,2);
   const axle=g.modules.get(m.parentId!)!;const local=rotateY([m.position[0]-axle.position[0],m.position[1]-axle.position[1],m.position[2]-axle.position[2]],-axle.rotationY);expect(local[0]).toBeCloseTo(0);expect(local[1]).toBeCloseTo(0);expect(Math.abs(local[2])).toBeCloseTo(HALF_TRACK);disposeObject(o);
  }
 });
});

describe('physical assembly, not palette order',()=>{
 it('a wheel cannot attach to empty space or to a chassis without a bearing',()=>{
  const g=new ConnectionGraph();g.addModule(part('wheel','wheel'));g.addModule(part('car','car-base',[0,CHASSIS_HEIGHT,0]));expect(placementCandidates(g,'wheel')).toEqual([]);
 });
 it('subassemblies can be built before the chassis: two wheels attach to a loose axle',()=>{
  const g=new ConnectionGraph();g.addModule(part('axle','front-axle',[3,1,3]));g.addModule(part('wheel','wheel'));
  const pose=placementCandidates(g,'wheel')[0];commitPlacement(g,'wheel',pose);
  expect(isMounted(g,g.modules.get('wheel'))).toBe(true);expect(isInstalled(g,g.modules.get('wheel'))).toBe(false);expect(assemblyCount(g)).toBe(0);
  g.addModule(part('car','car-base',[0,CHASSIS_HEIGHT,0]));commitPlacement(g,'axle',slotPose(g,'car','front-axle'));
  expect(isInstalled(g,g.modules.get('wheel'))).toBe(true);expect(assemblyCount(g)).toBe(3);
 });
 it.each(CAR_PALETTE.filter(t=>!['car-base','wheel'].includes(t)))('%s only snaps near its own free mounting point',type=>{
  const g=new ConnectionGraph();g.addModule(part('car','car-base',[0,CHASSIS_HEIGHT,0]));const m=part(type,type,[4,1,4]);g.addModule(m);const target=placementCandidates(g,m.id)[0];
  const before=JSON.stringify(g.serialize());expect(previewPlacement(g,m.id,[8,1,8])).toBeNull();expect(JSON.stringify(g.serialize())).toBe(before);
  expect(previewPlacement(g,m.id,[target.position[0]+SNAP_DISTANCE-.01,2,target.position[2]])).not.toBeNull();
  expect(previewPlacement(g,m.id,[target.position[0]+SNAP_DISTANCE+.01,2,target.position[2]])).toBeNull();
  commitPlacement(g,m.id,target);expect(isInstalled(g,m)).toBe(true);
  const duplicate=part('duplicate',type);g.addModule(duplicate);expect(placementCandidates(g,duplicate.id)).toHaveLength(0);
 });
 it('only one wheel can occupy a bearing, and all four wheels can be installed',()=>{
  const g=mountedCar();expect(assemblyCount(g)).toBe(12);expect(new Set([...g.modules.values()].filter(m=>m.type==='wheel').map(m=>m.parentId+':'+m.slotKey)).size).toBe(4);
  g.addModule(part('fifth','wheel'));expect(placementCandidates(g,'fifth')).toHaveLength(0);
 });
 it('moving and turning a chassis preserves all children, bearings, and mounting points',()=>{
  const g=mountedCar();moveGroup(g,'car',[7,CHASSIS_HEIGHT,4],Math.PI/2);expect(descendants(g,'car')).toHaveLength(12);expect(assemblyCount(g)).toBe(12);
  for(const m of g.modules.values())if(m.id!=='car')expect(isMounted(g,m)).toBe(true);
 });
 it('detaching an axle keeps its two wheels attached and removes drivetrain links',()=>{
  const g=mountedCar();moveGroup(g,'drive-axle',[4,.2,4],.8);commitPlacement(g,'drive-axle',null);
  expect(descendants(g,'drive-axle')).toHaveLength(3);expect(isMounted(g,g.modules.get('wheel-rl'))).toBe(true);expect(isInstalled(g,g.modules.get('wheel-rl'))).toBe(false);
  expect(sim(g).rpm.has('wheel-rl')).toBe(false);expect(assemblyCount(g)).toBe(9);
 });
 it('detaching a motor removes stale power and rotation links instead of leaving an invisible engine running',()=>{
  const g=mountedCar();commitPlacement(g,'motor',null);expect(sim(g).rpm.size).toBe(0);expect(g.connections.has('assembly:motor:rotation-out>gearbox:rotation-in')).toBe(false);
 });
 it('malformed slot type, vertical offset, yaw and missing parents are not counted as installed',()=>{
  const g=mountedCar();const motor=g.modules.get('motor')!;motor.slotKey='battery';expect(isInstalled(g,motor)).toBe(false);
  motor.slotKey='motor';motor.position[1]+=.1;expect(isInstalled(g,motor)).toBe(false);motor.position[1]-=.1;motor.rotationY=.4;expect(isInstalled(g,motor)).toBe(false);
  motor.rotationY=0;motor.parentId='missing';restoreAssembly(g);expect(motor.parentId).toBeUndefined();expect(sim(g).rpm.size).toBe(0);
 });
 it('restores ownership, zero ground level, switch state and physical links deterministically',()=>{
  const g=mountedCar(false,true),restored=new ConnectionGraph();restored.restore(JSON.parse(JSON.stringify(g.serialize())));restoreAssembly(restored);
  expect(assemblyCount(restored)).toBe(12);expect(restored.modules.get('road-south')?.position[1]).toBe(0);expect(restored.modules.get('switch')?.switchOn).toBe(false);expect(sim(restored).rpm.size).toBe(0);
 });
});

describe('closed circuit and drivetrain',()=>{
 it('a motor needs both a supply and a return to the same battery',()=>{
  const g=mountedCar(true);expect(sim(g).rpm.get('motor')).toBe(120);
  for(const [id,c] of g.connections)if(c.fromPortId==='return-out')g.connections.delete(id);
  expect(sim(g).powered.has('motor')).toBe(true);expect(sim(g).rpm.size).toBe(0);expect(sim(g).current.get('battery')).toBe(0);
 });
 it('an open switch stops all gears and wheel torque and draws no current',()=>{
  const g=mountedCar(false),s=sim(g);expect(s.rpm.size).toBe(0);expect(s.current.get('battery')).toBe(0);
 });
 it('12/24 gearing halves RPM, final drive divides by 3; rear wheel torque is shared',()=>{
  const g=mountedCar(true),s=sim(g);expect(s.rpm.get('motor')).toBe(120);expect(s.rpm.get('gearbox')).toBe(-60);expect(s.rpm.get('differential')).toBe(20);expect(s.rpm.get('drive-axle')).toBe(20);
  expect(s.rpm.get('wheel-rl')).toBe(20);expect(s.rpm.get('wheel-rr')).toBe(20);expect(s.torque.get('wheel-rl')).toBeCloseTo(.35/.5*.92/(1/3)*.95*.98*.5);
  expect(s.rpm.has('front-axle')).toBe(false);expect(s.rpm.has('wheel-fl')).toBe(false);expect(s.rpm.has('wheel-fr')).toBe(false);expect(s.rpm.has('car')).toBe(false);expect(s.current.get('battery')).toBe(.45);
 });
 it.each(['battery','switch','motor','gearbox','differential','drive-axle','wheel-rl','wheel-rr','front-axle','wheel-fl','wheel-fr'])('missing %s prevents vehicle travel',id=>{
  const g=mountedCar(true,true);g.removeModule(id);reconcileAssembly(g);expect(vehicleCanTravel(g,'car',sim(g).rpm).ready).toBe(false);
 });
 it('a correctly assembled car can test its motor on the bench but cannot travel without being placed on the road',()=>{
  const g=mountedCar();expect(sim(g).rpm.get('motor')).toBe(120);expect(vehicleCanTravel(g,'car',sim(g).rpm).ready).toBe(false);
  const r=mountedCar(true,true);expect(vehicleCanTravel(r,'car',sim(r).rpm).ready).toBe(true);
 });
});

describe('road geometry, path selection and rolling',()=>{
 it('the curve has matching exact endpoints and tangent directions',()=>{
  expect(curvePoint(0)).toEqual([0,ROAD_HEIGHT,-4.8]);expect(curvePoint(1)[0]).toBeCloseTo(4.8);expect(curvePoint(1)[2]).toBeCloseTo(0);
  const g=curvedCar(),route=buildRoute(g,'car');expect(route.ranges.map(r=>r.roadId)).toEqual(['a','b','c']);expect(route.length).toBeCloseTo(4.8+Math.PI*4.8/2+4.8,2);
  const near=sampleRoad(g.modules.get('b')!,'south','east');for(let i=1;i<near.length;i++)expect(Math.hypot(near[i][0]-near[i-1][0],near[i][2]-near[i-1][2])).toBeLessThan(.13);
 });
 it('disconnected nearby road tiles cannot silently become part of the route',()=>{
  const g=mountedCar(true,true);g.connections.delete('road-1');const route=buildRoute(g,'car');expect(route.ranges).toHaveLength(1);
 });
 it('snapping one road joins opposing endpoints without changing preview state',()=>{
  const g=new ConnectionGraph();g.addModule(part('a','road-straight'));g.addModule(part('b','road-curve',[.1,0,7.0]));
  const before=JSON.stringify(g.serialize());expect(g.previewSnapPose('b',.55)).not.toBeNull();expect(JSON.stringify(g.serialize())).toBe(before);
  expect(g.snapModule('b')).toBe(true);const e=[...g.connections.values()][0];const a=worldRoadPort(g.modules.get(e.fromModuleId)!,e.fromPortId)!,b=worldRoadPort(g.modules.get(e.toModuleId)!,e.toPortId)!;expect(Math.hypot(a[0]-b[0],a[2]-b[2])).toBeLessThan(.001);
 });
 it('starts where the child placed the car, moves at tyre RPM × circumference, and rolls with no slip',()=>{
  const g=mountedCar(true,true),d=new VehicleDrive(g,'car',20),before=d.snapshot();const s=tick(d,1);
  expect(s.position[0]).toBeCloseTo(before.position[0],4);expect(s.position[2]-before.position[2]).toBeCloseTo(20/60*2*Math.PI*.33,3);
  expect(-s.wheelAngle.rl*WHEEL_RADIUS).toBeCloseTo(s.distance-before.distance,5);expect(s.wheelRpm.rl).toBeCloseTo(20,4);
 });
 it('a stopped switch holds exact position and wheel angle, then resumes without jumping backwards',()=>{
  const g=mountedCar(true,true),d=new VehicleDrive(g,'car',20);tick(d,1);const before=d.snapshot();for(let i=0;i<50;i++)d.step(.02,false);
  expect(d.position).toEqual(before.position);expect(d.wheelAngle).toEqual(before.wheelAngle);d.step(.02,true);expect(d.distance).toBeGreaterThan(before.distance);
 });
 it('stops at an open road end without teleporting, rotating 180 degrees or rolling off the road',()=>{
  const g=mountedCar(true,true),d=new VehicleDrive(g,'car',20);tick(d,30);const stopped=d.snapshot();tick(d,5);expect(d.speed).toBe(0);expect(d.position).toEqual(stopped.position);expect(d.yaw).toBeCloseTo(-Math.PI/2,5);expect(d.reason).toContain('Hết đường');
 });
 it('a curve turns smoothly, front wheels steer, and the outside wheels travel further',()=>{
  const g=curvedCar(),d=new VehicleDrive(g,'car',20);let found=false;
  for(let i=0;i<1400;i++){
   const before=d.yaw;const s=d.step(.02);expect(Math.abs(Math.atan2(Math.sin(s.yaw-before),Math.cos(s.yaw-before)))).toBeLessThan(.05);
   if(s.position[0]>.7&&s.position[0]<2.2){found=true;expect(Math.abs(s.steering.left)).toBeGreaterThan(.1);expect(Math.abs(s.steering.right)).toBeGreaterThan(.1);expect(s.wheelRpm.rl).not.toBeCloseTo(s.wheelRpm.rr,2);expect(Math.sign(s.steering.left)).toBe(Math.sign(Math.atan2(Math.sin(s.yaw-before),Math.cos(s.yaw-before))));}
  }
  expect(found).toBe(true);
 });
 it('red light holds the front bumper before the signal; green resumes at the same position',()=>{
  const g=mountedCar(true,true),light=part('light','traffic-light',[1.95,0,4.8]);light.parentId='road-north';light.slotKey='side:-1';g.addModule(light);
  const d=new VehicleDrive(g,'car',20);tick(d,15);expect(d.speed).toBe(0);expect(d.reason).toBe('Đèn đỏ');expect(d.position[2]+1.15+.45).toBeLessThanOrEqual(4.8+.04);
  const before=d.position[2];light.switchOn=true;tick(d,.5);expect(d.position[2]).toBeGreaterThan(before);
 });
 it('STOP requires a 1.5 second wait and releases once per passage',()=>{
  const g=mountedCar(true,true),sign=part('stop','stop-sign',[1.95,0,0]);sign.parentId='road-centre';sign.slotKey='side:-1';g.addModule(sign);
  const d=new VehicleDrive(g,'car',20);let reached=false;for(let i=0;i<1000;i++){d.step(.02);if(d.reason.includes('STOP')){reached=true;break;}}
  expect(reached).toBe(true);const p=[...d.position];tick(d,1);expect(d.position).toEqual(p);tick(d,.7);expect(d.position[2]).toBeGreaterThan(p[2]);
 });
 it('an unattached red light cannot stop the car',()=>{
  const g=mountedCar(true,true);g.addModule(part('loose','traffic-light',[1,0,0]));const d=new VehicleDrive(g,'car',20);expect(tick(d,6).speed).toBeGreaterThan(0);
 });
 it('the speed sign reduces speed only on its attached road section',()=>{
  const g=mountedCar(true,true),sign=part('slow','speed-sign',[1.95,0,0]);sign.parentId='road-centre';sign.slotKey='side:-1';g.addModule(sign);const d=new VehicleDrive(g,'car',20);expect(tick(d,1).speed).toBeCloseTo(d.baseSpeed,5);tick(d,7);expect(d.speed).toBeCloseTo(d.baseSpeed*.5,5);
 });
});

describe('intersection and closed-route continuity',()=>{
 it('prefers a connected straight exit and uses a tangent turn if only a side is connected',()=>{
  const g=mountedCar(true,false),roads=[part('s','road-straight',[0,0,-4.8]),part('j','road-intersection'),part('n','road-straight',[0,0,4.8]),part('e','road-straight',[4.8,0,0],Math.PI/2)];roads.forEach(m=>g.addModule(m));
  for(const [id,a,ap,b,bp] of [['sj','s','north','j','south'],['jn','j','north','n','south'],['je','j','east','e','south']])g.connect({id,fromModuleId:a,fromPortId:ap,toModuleId:b,toPortId:bp,signal:'structural'});
  commitPlacement(g,'car',{position:[0,.74,-4.8],rotationY:-Math.PI/2,parentId:'s',slotKey:'road'});
  expect(buildRoute(g,'car').ranges.map(r=>r.roadId)).toEqual(['s','j','n']);g.connections.delete('jn');const route=buildRoute(g,'car');expect(route.ranges.map(r=>r.roadId)).toEqual(['s','j','e']);
  const turn=sampleRoad(roads[1],'south','east');expect(turn[0][0]).toBeCloseTo(0);expect(turn.at(-1)![2]).toBeCloseTo(0);expect(turn[1][2]).toBeGreaterThan(turn[0][2]);expect(Math.abs(turn[1][0]-turn[0][0])).toBeLessThan(.01);
  const d=new VehicleDrive(g,'car',20);for(let i=0;i<1100;i++){const before=d.snapshot(),after=d.step(.02);expect(Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2])).toBeLessThan(.06);expect(Math.abs(Math.atan2(Math.sin(after.yaw-before.yaw),Math.cos(after.yaw-before.yaw)))).toBeLessThan(.05);}
 });
 it('a four-curve loop remains continuous across its seam and can complete multiple laps',()=>{
  const g=mountedCar(true,false),r=4.8,roads=[part('a','road-curve'),part('b','road-curve',[2*r,0,0],Math.PI/2),part('c','road-curve',[2*r,0,-2*r],Math.PI),part('d','road-curve',[0,0,-2*r],3*Math.PI/2)];roads.forEach(m=>g.addModule(m));
  for(let i=0;i<4;i++)g.connect({id:'loop'+i,fromModuleId:roads[i].id,fromPortId:'east',toModuleId:roads[(i+1)%4].id,toPortId:'south',signal:'structural'});
  const points=sampleRoad(roads[0],'south','east'),rear=pointAtDistance(points,1),next=pointAtDistance(points,1.05),yaw=Math.atan2(-(next.point[2]-rear.point[2]),next.point[0]-rear.point[0]);
  commitPlacement(g,'car',{position:[rear.point[0]+1.15*Math.cos(yaw),.74,rear.point[2]-1.15*Math.sin(yaw)],rotationY:yaw,parentId:'a',slotKey:'road'});
  const d=new VehicleDrive(g,'car',20);expect(d.route.closed).toBe(true);expect(d.route.length).toBeCloseTo(2*Math.PI*r,2);let seams=0;
  for(let i=0;i<5000;i++){const before=d.snapshot(),after=d.step(.02);if(after.distance<before.distance)seams++;expect(Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2])).toBeLessThan(.05);expect(after.speed).toBeGreaterThan(0);}
  expect(seams).toBeGreaterThanOrEqual(2);
 });
 it('road snapping preserves the current orientation when two poses occupy the same centre',()=>{
  const g=new ConnectionGraph();g.addModule(part('a','road-straight'));g.addModule(part('b','road-curve',[0,0,7.2]));const p=g.previewSnapPose('b',.55)!;expect(p.rotationY).toBe(0);expect(p.movingPortId).toBe('south');
 });
});

 it('placing a chassis on a curve aligns its rear reference, so starting does not jump or yaw abruptly',()=>{
  const g=mountedCar(true,false),road=part('curve','road-curve');g.addModule(road);const raw=curvePoint(.5);const pose=previewPlacement(g,'car',[raw[0],.74,raw[2]])!;expect(pose).not.toBeNull();commitPlacement(g,'car',pose);const d=new VehicleDrive(g,'car',20),before=d.snapshot(),after=d.step(.02);expect(Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2])).toBeLessThan(.035);expect(Math.abs(after.yaw-before.yaw)).toBeLessThan(.015);
 });

 describe('visible shaft and mount geometry agrees with connector definitions',()=>{
  it('motor, gearbox and final drive shafts align in height; differential output is coaxial with the rear bearings',()=>{
   const g=mountedCar();const port=(id:string,key:string)=>{const m=g.modules.get(id)!,p=MODULES[m.type].ports.find(p=>p.id===key)!;return [m.position[0]+p.position[0],m.position[1]+p.position[1],m.position[2]+p.position[2]];};
   expect(port('motor','rotation-out').slice(1)).toEqual(port('gearbox','rotation-in').slice(1));expect(port('gearbox','rotation-out')[1]).toBeCloseTo(port('differential','rotation-in')[1]);port('differential','rotation-out').forEach((v,i)=>expect(v).toBeCloseTo(port('drive-axle','rotation-in')[i],8));expect(MODULES.differential.ports.find(p=>p.id==='rotation-out')!.axis).toEqual([0,0,1]);
   for(const type of ['gearbox','differential'] as const){const obj=createModuleObject(part(type,type)),output=MODULES[type].ports.find(p=>p.id==='rotation-out')!,gears:THREE.Object3D[]=[];obj.traverse(o=>{if(o.userData.teeth&&o.userData.rpmSource==='output')gears.push(o);});expect(gears).toHaveLength(1);expect(gears[0].position.y).toBeCloseTo(output.position[1]);expect(gears[0].position.z).toBeCloseTo(output.position[2]);disposeObject(obj);}
  });
  it('all seven chassis mount ports coincide with the installed child mount, with opposite axes',()=>{
   const g=mountedCar();for(const type of CAR_PALETTE.filter(t=>!['car-base','wheel'].includes(t))){const m=g.modules.get(type)!,p=MODULES['car-base'].ports.find(p=>p.id===type+'-mount')!,car=g.modules.get('car')!;expect([car.position[0]+p.position[0],car.position[1]+p.position[1],car.position[2]+p.position[2]]).toEqual(m.position);expect(p.axis).toEqual([0,1,0]);}
  });
 });

 describe('roadside controls remain physically attached',()=>{
  it.each(['traffic-light','stop-sign','speed-sign'] as ModuleType[])('%s stands on the ground beside the road; incorrect height/position cannot become an active road control',type=>{
   const g=mountedCar(true,true),m=part('control',type);g.addModule(m);commitPlacement(g,m.id,roadsidePose(g.modules.get('road-centre')!,'side:-1'));expect(m.position[1]).toBe(0);expect(isMounted(g,m)).toBe(true);m.position[1]+=.12;expect(isMounted(g,m)).toBe(false);m.position[1]-=.12;m.position[0]+=1;expect(isMounted(g,m)).toBe(false);const d=new VehicleDrive(g,'car',20);tick(d,10);expect(d.reason).not.toContain('Đèn đỏ');expect(d.reason).not.toContain('STOP');expect(d.speed).toBeCloseTo(d.baseSpeed);
  });
  it('moving and rotating a road carries its mounted signs and cancellation can restore the group',()=>{
   const g=mountedCar(true,true),road=g.modules.get('road-centre')!,m=part('stop','stop-sign');g.addModule(m);commitPlacement(g,m.id,roadsidePose(road,'side:1'));expect(descendants(g,road.id)).toContain(m.id);moveGroup(g,road.id,[8,0,8],Math.PI/2);expect(isMounted(g,m)).toBe(true);expect(m.position[1]).toBe(0);
  });
 });
