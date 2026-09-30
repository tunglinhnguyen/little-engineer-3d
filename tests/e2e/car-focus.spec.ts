import { test, expect, type Page } from '@playwright/test';
import { CAR_PALETTE, ROAD_PALETTE, MODULES } from '../../src/core/moduleRegistry';
import { curvedCar, mountedCar, part } from '../fixtures';
import { CHASSIS_HEIGHT } from '../../src/core/layout';
import { commitPlacement } from '../../src/core/assembly';
import type { ModuleType, Placement, Vector3Tuple } from '../../src/core/types';

type Point={x:number;y:number};
const qa=<T=any>(page:Page,method:string,...args:any[]):Promise<T>=>page.evaluate(({method,args})=>(window as any).__CAR_LAB__[method](...args),{method,args});
const snapshot=(page:Page)=>qa<any>(page,'snapshot');
async function boot(page:Page){await page.goto('/?qa=1');await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));}
async function shot(page:Page,name:string){await page.screenshot({path:'test-results/car/'+name+'.png'});}
async function spawn(page:Page,type:ModuleType){
 const road=ROAD_PALETTE.includes(type);await page.locator(road?'#roadTab':'#carTab').click();
 await page.locator('.part[data-type="'+type+'"]').scrollIntoViewIfNeeded();await page.locator('.part[data-type="'+type+'"]').click();
 return (await snapshot(page)).modules.filter((m:any)=>m.type===type).at(-1)?.id as string;
}
async function select(page:Page,id:string){await qa(page,'focus',id);const point=await qa<Point>(page,'screen',id);expect(point).not.toBeNull();await page.mouse.click(point.x,point.y);const m=(await snapshot(page)).modules.find((m:any)=>m.id===id);await expect(page.locator('#selectedName')).toHaveText(MODULES[m.type as ModuleType].name);}
async function detach(page:Page,id:string){
 await select(page,id);await page.locator('#detachPart').click();
 const staged=await page.evaluate(id=>{const lab=(window as any).__CAR_LAB__,modules=lab.snapshot().modules,members=[id,...modules.filter((m:any)=>m.parentId===id).map((m:any)=>m.id)],bounds=members.map((key:string)=>lab.bounds(key));return {min:[0,1,2].map(i=>Math.min(...bounds.map((b:any)=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...bounds.map((b:any)=>b.max[i]))),others:modules.filter((m:any)=>!members.includes(m.id)).map((m:any)=>lab.bounds(m.id))};},id);
 expect(staged.min[1]).toBeCloseTo(0,5);for(const other of staged.others)expect([0,1,2].every(i=>staged.min[i]<other.max[i]&&staged.max[i]>other.min[i]),'Detached group does not overlap another module').toBe(false);
}
async function armRoad(page:Page,id:string){await select(page,id);await page.locator('#movePart').click();}
async function drag(page:Page,id:string,position:Vector3Tuple,rootId=id){
 await page.locator('#focusAll').click();
 let start=await qa<Point|null>(page,'screen',id);
 if(!start){await qa(page,'focus',id);start=await qa<Point|null>(page,'screen',id);}
 expect(start,'A visible point on '+id).not.toBeNull();
 const target=await qa<Point>(page,'dragTarget',rootId,position,start!);
 await page.mouse.move(start!.x,start!.y);await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:3});await page.mouse.up();
}
async function install(page:Page,type:ModuleType,key?:string){
 const state=await snapshot(page);let id:string|undefined;
 for(const m of state.modules.filter((m:any)=>m.type===type))if(!m.parentId){id=m.id;break;}
 expect(id,'Loose '+type).toBeTruthy();const target=await qa<Placement>(page,'targetPose',type,key);expect(target,'Mounting target '+type).not.toBeNull();
 await drag(page,id!,target.position);expect(await qa(page,'isInstalled',id)).toBe(true);return id!;
}
async function assemble(page:Page){
 // All parts are selected out of order; only pointer drags install them.
 for(const t of ['wheel','motor','gearbox','switch','battery','differential','drive-axle','front-axle','wheel','wheel','wheel','car-base'] as ModuleType[])await spawn(page,t);
 for(const t of ['battery','differential','front-axle','motor','switch','gearbox','drive-axle'] as ModuleType[])await install(page,t);
 for(const key of ['wheel-fr','wheel-rl','wheel-fl','wheel-rr'])await install(page,'wheel',key);
}
const fixture=(page:Page,g:ReturnType<typeof mountedCar>)=>qa(page,'fixture',g.serialize());
test.beforeEach(async({page})=>{await boot(page);});

for(const type of [...CAR_PALETTE,...ROAD_PALETTE])test('module '+type+': selectable, identifiable, pickable and no automatic attachment',async({page})=>{
 const id=await spawn(page,type),s=await snapshot(page),m=s.modules.find((m:any)=>m.id===id);expect(m.parentId).toBeUndefined();expect(s.connections).toHaveLength(0);
 expect(s.count).toBe(type==='car-base'?1:0);await expect(page.locator('#selectedName')).toHaveText(MODULES[type].name);
 const point=await qa<Point|null>(page,'screen',id);expect(point).not.toBeNull();await page.mouse.click(point!.x,point!.y);await expect(page.locator('#selectedName')).toHaveText(MODULES[type].name);
 await qa(page,'focus',id);const bounds=await qa<any>(page,'bounds',id),frame=(await page.locator('#world').boundingBox())!;for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){const p=await qa<Point>(page,'screenWorld',[x,y,z]);expect(p.x).toBeGreaterThan(frame.x);expect(p.x).toBeLessThan(frame.x+frame.width);expect(p.y).toBeGreaterThan(frame.y);expect(p.y).toBeLessThan(frame.y+frame.height);}await shot(page,'module-'+type);
});

test('manual assembly: wrong place stays loose; all 12 parts install on the bench; no automatic driving',async({page})=>{
 await spawn(page,'wheel');expect(await qa(page,'targetPose','wheel')).toBeNull();await assemble(page);
 const s=await snapshot(page);expect(s.count).toBe(12);expect(s.ready).toBe(false);expect(s.rpm).toEqual({});
 await expect(page.locator('#progressText')).toHaveText('12 / 12');await expect(page.locator('#runBtn')).toBeDisabled();
 // Palette limits keep exactly one chassis and four wheels.
 await spawn(page,'car-base');await spawn(page,'wheel');const after=await snapshot(page);expect(after.modules.filter((m:any)=>m.type==='wheel')).toHaveLength(4);expect(after.modules.filter((m:any)=>m.type==='car-base')).toHaveLength(1);
 await page.locator('#focusAll').click();await shot(page,'01-manual-bench-assembly');
});

test('each chassis component: tap selects; short and long drags carry the whole car; only the detach button separates it; reassembly works',async({page})=>{
 for(const type of CAR_PALETTE.filter(t=>!['car-base','wheel'].includes(t))){
  await fixture(page,mountedCar());const before=await snapshot(page);await select(page,type);expect((await snapshot(page)).modules).toEqual(before.modules);
  await drag(page,type,[2,CHASSIS_HEIGHT,-2],'car');let moved=await snapshot(page);expect(moved.count).toBe(12);
  for(const m of moved.modules){const previous=before.modules.find((n:any)=>n.id===m.id);expect(m.parentId).toBe(previous.parentId);expect(m.slotKey).toBe(previous.slotKey);expect(m.position[0]-previous.position[0]).toBeCloseTo(2);expect(m.position[2]-previous.position[2]).toBeCloseTo(-2);}
  await select(page,type);const start=await qa<Point>(page,'screen',type),target=await qa<Point>(page,'dragTarget','car',[3,CHASSIS_HEIGHT,-1],start);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.move(target.x,target.y);await page.mouse.up();
  moved=await snapshot(page);expect(moved.count).toBe(12);for(const m of moved.modules)expect(await qa(page,'isInstalled',m.id)).toBe(true);
  const remaining=moved.modules.filter((m:any)=>m.id!==type&&m.parentId!==type);await detach(page,type);const detached=await snapshot(page);expect(await qa(page,'isInstalled',type)).toBe(false);expect(detached.count).toBe(type.endsWith('axle')?9:11);
  for(const m of remaining)expect(detached.modules.find((n:any)=>n.id===m.id)).toEqual(m);
  expect((await qa<any>(page,'bounds',type)).min[1]).toBeGreaterThanOrEqual(-.00001);await install(page,type);expect((await snapshot(page)).count).toBe(12);
 }
 await page.locator('#focusAll').click();await shot(page,'02-individual-attachments');
});

test('subassembly: axle detach carries its two wheels; undo restores all three; drag cancellation rolls back every member',async({page})=>{
 await fixture(page,mountedCar());const before=await snapshot(page);
 await detach(page,'drive-axle');const separated=await snapshot(page);expect(separated.count).toBe(9);await drag(page,'wheel-rr',[-4,.33,-4],'drive-axle');const moved=await snapshot(page);expect(moved.count).toBe(9);expect(moved.modules.find((m:any)=>m.id==='car')).toEqual(before.modules.find((m:any)=>m.id==='car'));
 for(const key of ['wheel-rl','wheel-rr']){const m=moved.modules.find((m:any)=>m.id===key);expect(m.parentId).toBe('drive-axle');expect(await qa(page,'isAttached',key)).toBe(true);}
 for(const id of ['drive-axle','wheel-rl','wheel-rr'])expect((await qa<any>(page,'bounds',id)).min[1]).toBeGreaterThanOrEqual(-.00001);expect(moved.modules.find((m:any)=>m.id==='drive-axle').position[1]).toBeCloseTo(.33);
 await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(separated.modules);await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(before.modules);
 await select(page,'wheel-rr');const start=await qa<Point>(page,'screen','wheel-rr');expect(start).not.toBeNull();
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+90,start.y+40);await qa(page,'cancelDrag');await page.mouse.up();
 expect((await snapshot(page)).modules).toEqual(before.modules);await shot(page,'03-protected-subassemblies');
});

test('motor and gears: test at rest, positive/negative circuit, reduction ratio, shaft axes; switch stops every mechanism',async({page})=>{
 await fixture(page,mountedCar(false));await qa(page,'focus','switch');await page.locator('#toggleSwitch').click();await page.locator('#testBtn').click();
 const before=await qa<any[]>(page,'mechanism','motor'),diffBefore=await qa<any[]>(page,'mechanism','differential'),axleBefore=await qa<any[]>(page,'mechanism','drive-axle');const carBefore=await qa(page,'rendered','car');await page.waitForTimeout(500);
 const after=await qa<any[]>(page,'mechanism','motor');expect(after[0].rotation[0]).not.toBe(before[0].rotation[0]);expect(after[0].rotation[1]).toBe(before[0].rotation[1]);expect(after[0].rotation[2]).toBe(before[0].rotation[2]);expect(await qa(page,'rendered','car')).toEqual(carBefore);const diffAfter=await qa<any[]>(page,'mechanism','differential'),axleAfter=await qa<any[]>(page,'mechanism','drive-axle');for(let i=0;i<diffAfter.length;i++)if(diffAfter[i].axis==='z')expect(diffAfter[i].rotation[2]).toBeLessThan(diffBefore[i].rotation[2]);for(let i=0;i<axleAfter.length;i++)expect(axleAfter[i].rotation[2]).toBeLessThan(axleBefore[i].rotation[2]);
 const s=await snapshot(page);expect(s.rpm.motor).toBe(120);expect(s.rpm.gearbox).toBe(-60);expect(s.rpm['drive-axle']).toBe(20);expect(s.rpm.car).toBeUndefined();expect(s.rpm['wheel-fl']).toBeUndefined();
 await page.locator('#toggleSwitch').click();const stopped=await qa<any[]>(page,'mechanism','motor');await page.waitForTimeout(300);expect(await qa(page,'mechanism','motor')).toEqual(stopped);
 await page.locator('#testBtn').click();await qa(page,'focus','car');await shot(page,'04-circuit-and-mechanisms');
});

test('whole car moves to the road; runs as one assembly; stops in place; no child teleports back; explicit return goes back',async({page})=>{
 await fixture(page,mountedCar(true));await page.locator('#testRoad').click();
 const target=await qa<Placement>(page,'targetPose','car-base');await drag(page,'motor',target.position,'car');
 expect((await snapshot(page)).count).toBe(12);expect((await snapshot(page)).ready).toBe(true);
 await page.locator('#runBtn').click();await page.waitForTimeout(600);const running=await snapshot(page);expect(running.telemetry.speed).toBeGreaterThan(0);
 await page.evaluate(()=>document.getElementById('runBtn')!.addEventListener('click',()=>{const w=window as any;w.__PARK_BEFORE__={car:w.__CAR_LAB__.rendered('car'),motor:w.__CAR_LAB__.rendered('motor')};},{once:true,capture:true}));
 await page.locator('#runBtn').click();const clicked=await page.evaluate(()=>(window as any).__PARK_BEFORE__),parked=await qa<any>(page,'rendered','car');parked.position.forEach((v:number,i:number)=>expect(v).toBeCloseTo(clicked.car.position[i],7));
 expect((await snapshot(page)).count).toBe(12);const childAfter=await qa<any>(page,'rendered','motor');childAfter.position.forEach((v:number,i:number)=>expect(v).toBeCloseTo(clicked.motor.position[i],7));
 await qa(page,'focus','car');await page.locator('#returnCar').click();await page.locator('#focusAll').click();await shot(page,'05-assembled-car-driving');
});

test('road modules: straight, curve and intersection snap with real drags; rotate loose module; connected road stays locked until an explicit movement command',async({page})=>{
 const a=await qa<string>(page,'forceRoad','road-straight',[0,0,0],0);
 const b=await spawn(page,'road-curve');await drag(page,b,[0,0,7.2]);
 let s=await snapshot(page);expect(s.connections.some((e:any)=>[e.fromModuleId,e.toModuleId].includes(a)&&[e.fromModuleId,e.toModuleId].includes(b))).toBe(true);
 const c=await spawn(page,'road-intersection');await drag(page,c,[7.2,0,7.2]); // curve east endpoint at 4.8,7.2 -> cross west endpoint 4.8,7.2
 s=await snapshot(page);expect(s.connections.filter((e:any)=>e.signal==='structural')).toHaveLength(2);
 const loose=await spawn(page,'road-straight');await page.locator('#rotatePart').click();expect((await snapshot(page)).modules.find((m:any)=>m.id===loose).rotationY).toBeCloseTo(Math.PI/2);
 const origin=await qa(page,'rendered',b);await qa(page,'focus',b);const point=await qa<Point>(page,'screen',b);await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+80,point.y+30);await page.mouse.up();expect(await qa(page,'rendered',b)).toEqual(origin);
 await page.locator('#focusAll').click();await shot(page,'06-road-geometry-and-snapping');
});

for(const type of ['traffic-light','stop-sign','speed-sign'] as ModuleType[])test('control '+type+': loose controls have no effect; mount on roadside and lock position',async({page})=>{
 await fixture(page,mountedCar(true,true));const id=await spawn(page,type);const target=await qa<Placement>(page,'targetPose',type);expect(target).not.toBeNull();
 await drag(page,id,target.position);expect(await qa(page,'isAttached',id)).toBe(true);const before=await qa(page,'rendered',id);
 await qa(page,'focus',id);const pt=await qa<Point>(page,'screen',id);await page.mouse.click(pt.x,pt.y);expect(await qa(page,'rendered',id)).toEqual(before);
 await expect(page.locator('#deletePart')).toHaveCount(0);await page.locator('#focusAll').click();await shot(page,'road-control-'+type);const mounted=await snapshot(page);await detach(page,id);expect(await qa(page,'isAttached',id)).toBe(false);for(const m of mounted.modules.filter((m:any)=>m.id!==id))expect((await snapshot(page)).modules.find((n:any)=>n.id===m.id)).toEqual(m);await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(mounted.modules);
});

test('red light can be changed while driving without resetting car position',async({page})=>{
 const g=mountedCar(true,true),light=part('light','traffic-light',[1.95,0,0]);light.parentId='road-centre';light.slotKey='side:-1';g.addModule(light);await fixture(page,g);
 await page.locator('#runBtn').click();await page.waitForTimeout(600);const a=(await snapshot(page)).telemetry;
 await qa(page,'focus','light');await page.locator('#toggleLight').click();const b=(await snapshot(page)).telemetry;expect(b.distance).toBeGreaterThanOrEqual(a.distance);
 await qa(page,'focus','switch');await page.locator('#toggleSwitch').click();await page.waitForTimeout(180);const parked=(await snapshot(page)).telemetry;await page.waitForTimeout(300);const stopped=(await snapshot(page)).telemetry;
 expect(stopped.position).toEqual(parked.position);expect(stopped.wheelAngle).toEqual(parked.wheelAngle);await page.locator('#toggleSwitch').click();await page.waitForTimeout(300);expect((await snapshot(page)).telemetry.distance).toBeGreaterThan(stopped.distance);
 await page.locator('#runBtn').click();await shot(page,'07-live-switch-and-traffic-control');
});

test('save, reload, undo, redo, cất, dọn bàn: ownership and switch states stay valid',async({page})=>{
 await fixture(page,mountedCar(false,true));await page.reload();await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));expect((await snapshot(page)).count).toBe(12);expect((await snapshot(page)).rpm).toEqual({});
 const loose=await spawn(page,'stop-sign');await page.locator('#deletePart').click();expect((await snapshot(page)).modules.some((m:any)=>m.id===loose)).toBe(false);
 await page.locator('#undoBtn').click();expect((await snapshot(page)).modules.some((m:any)=>m.id===loose)).toBe(true);await page.locator('#redoBtn').click();expect((await snapshot(page)).modules.some((m:any)=>m.id===loose)).toBe(false);
 await page.locator('#resetBtn').click();expect((await snapshot(page)).modules).toHaveLength(0);await page.locator('#undoBtn').click();expect((await snapshot(page)).count).toBe(12);await shot(page,'08-save-and-history');
});

for(const viewport of [{width:1180,height:820},{width:1024,height:768},{width:820,height:1180}])test('iPad layout '+viewport.width+'x'+viewport.height+': car and controls are visible without palette obstruction',async({page})=>{
 await page.setViewportSize(viewport);await fixture(page,mountedCar());await qa(page,'focus','car');await page.locator('#cameraTop').click();
 const car=await qa<Point|null>(page,'screen','car');expect(car).not.toBeNull();const frame=await page.locator('#world').boundingBox(),palette=await page.locator('.palette').boundingBox();expect(frame!.y+frame!.height).toBeLessThan(palette!.y+2);
 for(const id of ['buildBtn','testBtn','runBtn','carTab','roadTab','focusAll'])await expect(page.locator('#'+id)).toBeVisible();
 const battery=await qa<Point>(page,'screen','battery');expect(battery).not.toBeNull();await page.mouse.click(battery.x,battery.y);await expect(page.locator('#detachPart')).toBeVisible();expect((await page.locator('#detachPart').boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await shot(page,'ipad-'+viewport.width+'x'+viewport.height);
});

test('native touch: taps and small jitter select; long drag moves the whole car; cancellation restores it; explicit detach moves only the loose part',async({page,context})=>{
 await fixture(page,mountedCar());await qa(page,'focus','battery');const start=await qa<Point>(page,'screen','battery');expect(start).not.toBeNull();
 const cdp=await context.newCDPSession(page);const touch=async(type:'touchStart'|'touchEnd'|'touchMove'|'touchCancel',p?:Point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p.x,y:p.y,id:1}]:[]});
 const before=await snapshot(page);await touch('touchStart',start);await touch('touchEnd');expect((await snapshot(page)).modules).toEqual(before.modules);await expect(page.locator('#selectedName')).toHaveText(MODULES.battery.name);
 await touch('touchStart',start);await touch('touchMove',{x:start.x+3,y:start.y+2});await touch('touchEnd');expect((await snapshot(page)).modules).toEqual(before.modules);
 let target=await qa<Point>(page,'dragTarget','car',[-2,CHASSIS_HEIGHT,-2],start);await touch('touchStart',start);await page.waitForTimeout(900);await touch('touchMove',target);await touch('touchEnd');const moved=await snapshot(page);expect(moved.count).toBe(12);expect(moved.modules.find((m:any)=>m.id==='car').position[0]).toBeCloseTo(-2);
 await select(page,'battery');let point=await qa<Point>(page,'screen','battery');await touch('touchStart',point);await touch('touchMove',{x:point.x+80,y:point.y+45});await touch('touchCancel');expect((await snapshot(page)).modules).toEqual(moved.modules);
 await page.locator('#detachPart').click();expect(await qa(page,'isInstalled','battery')).toBe(false);const separated=await snapshot(page);await select(page,'battery');point=await qa<Point>(page,'screen','battery');target=await qa<Point>(page,'dragTarget','battery',[-4,.2,-3],point);
 await touch('touchStart',point);await touch('touchMove',target);await touch('touchEnd');const loose=await snapshot(page);for(const m of separated.modules.filter((m:any)=>m.id!=='battery'))expect(loose.modules.find((n:any)=>n.id===m.id)).toEqual(m);await install(page,'battery');expect((await snapshot(page)).count).toBe(12);await shot(page,'09-native-touch');
});

 test('driving around a curve: front wheels steer with the turn and rear half-shafts follow distinct wheel speeds',async({page})=>{
  const g=curvedCar();commitPlacement(g,'car',{position:[0,.74,-5],rotationY:-Math.PI/2,parentId:'a',slotKey:'road'});await fixture(page,g);await page.locator('#runBtn').click();
  await expect.poll(async()=>{const s=(await snapshot(page)).telemetry;return s.position[0];},{timeout:20000}).toBeGreaterThan(.9);
  const s=(await snapshot(page)).telemetry;expect(s.steering.left).toBeGreaterThan(.1);expect(s.steering.right).toBeGreaterThan(s.steering.left);expect(s.wheelRpm.rl).toBeGreaterThan(s.wheelRpm.rr);
  const front=await qa<any>(page,'rendered','wheel-fl'),car=await qa<any>(page,'rendered','car');expect(front.rotationY).toBeGreaterThan(car.rotationY);
  const before=await qa<any[]>(page,'mechanism','drive-axle');
  await expect.poll(async()=>{const after=await qa<any[]>(page,'mechanism','drive-axle'),delta=(side:number)=>Math.abs(after.find(r=>r.side===side).rotation[2]-before.find(r=>r.side===side).rotation[2]);return delta(-1)>0&&delta(1)>delta(-1);},{timeout:10000}).toBe(true);
  await shot(page,'10-steering-and-differential-rolling');await page.locator('#runBtn').click();expect((await snapshot(page)).count).toBe(12);
 });

 test('a mounted roadside sign stands on the ground and follows a deliberately moved road; undo restores both',async({page})=>{
  const road=await qa<string>(page,'forceRoad','road-straight',[0,0,0]),sign=await spawn(page,'stop-sign'),target=await qa<Placement>(page,'targetPose','stop-sign');await drag(page,sign,target.position);expect((await snapshot(page)).modules.find((m:any)=>m.id===sign).position[1]).toBe(0);const before=await snapshot(page);
  await armRoad(page,road);await drag(page,road,[0,0,5]);const after=await snapshot(page),r=after.modules.find((m:any)=>m.id===road),m=after.modules.find((m:any)=>m.id===sign);expect(r.position[2]).toBeCloseTo(5);expect(m.position[2]).toBeCloseTo(5);expect(await qa(page,'isAttached',sign)).toBe(true);
  await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(before.modules);await shot(page,'11-roadside-group-movement');
 });

 test('whole vehicle: native touch on a wheel moves all 12 parts immediately, preserves joints and can be repeated without a command',async({page,context})=>{
  await fixture(page,mountedCar());const original=await snapshot(page);
  const start=await qa<Point>(page,'screen','wheel-rr');expect(start).not.toBeNull();const target=await qa<Point>(page,'dragTarget','car',[-3,.62,-2],start);const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x,y:target.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const moved=await snapshot(page);expect(moved.count).toBe(12);expect(moved.moveIntent).toBeNull();const car=moved.modules.find((m:any)=>m.id==='car');expect(car.position[0]).toBeCloseTo(-3);expect(car.position[2]).toBeCloseTo(-2);
  for(const m of moved.modules){const before=original.modules.find((n:any)=>n.id===m.id);expect(m.parentId).toBe(before.parentId);expect(m.slotKey).toBe(before.slotKey);expect(m.position[0]-before.position[0]).toBeCloseTo(-3);expect(m.position[2]-before.position[2]).toBeCloseTo(-2);}
  await page.locator('#focusAll').click();const pt=await qa<Point>(page,'screen','wheel-rr'),next=await qa<Point>(page,'dragTarget','car',[-2,CHASSIS_HEIGHT,-1],pt);expect(next.x).toBeGreaterThan(0);expect(next.x).toBeLessThan(1180);expect(next.y).toBeGreaterThan(70);expect(next.y).toBeLessThan(670);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt.x,y:pt.y,id:2}]});await page.waitForTimeout(900);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:next.x,y:next.y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect((await snapshot(page)).count).toBe(12);expect((await snapshot(page)).modules.find((m:any)=>m.id==='car').position[0]).toBeCloseTo(-2);
  await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(moved.modules);await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(original.modules);await shot(page,'12-whole-car-touch-movement');
 });
 test('road movement intent: cancel button, another selection, undo and leaving build all clear it safely',async({page})=>{
  await fixture(page,mountedCar(true,true));const original=await snapshot(page);await armRoad(page,'road-centre');await page.locator('#cancelMove').click();expect((await snapshot(page)).moveIntent).toBeNull();expect((await snapshot(page)).modules).toEqual(original.modules);
  await armRoad(page,'road-centre');await select(page,'motor');expect((await snapshot(page)).moveIntent).toBeNull();await armRoad(page,'road-centre');await page.locator('#testBtn').click();expect((await snapshot(page)).moveIntent).toBeNull();await expect(page.locator('#movementBar')).toBeHidden();await page.locator('#testBtn').click();
  const loose=await spawn(page,'stop-sign');await armRoad(page,'road-centre');await page.locator('#undoBtn').click();expect((await snapshot(page)).moveIntent).toBeNull();expect((await snapshot(page)).modules.some((m:any)=>m.id===loose)).toBe(false);await shot(page,'13-explicit-road-movement');
 });

test('each wheel: dragging carries the car; detach frees only its bearing; undo, redo and reassembly preserve the other 11 parts',async({page})=>{
 for(const key of ['wheel-fl','wheel-fr','wheel-rl','wheel-rr']){
  await fixture(page,mountedCar());await drag(page,key,[-2,CHASSIS_HEIGHT,-2],'car');const before=await snapshot(page);expect(before.count).toBe(12);
  await detach(page,key);const separated=await snapshot(page);expect(separated.count).toBe(11);expect(separated.modules.find((m:any)=>m.id===key).parentId).toBeUndefined();
  for(const m of before.modules.filter((m:any)=>m.id!==key))expect(separated.modules.find((n:any)=>n.id===m.id)).toEqual(m);
  const bounds=await qa<any>(page,'bounds',key);expect(bounds.min[1]).toBeCloseTo(0,5);
  await page.locator('#undoBtn').click();expect((await snapshot(page)).modules).toEqual(before.modules);await page.locator('#redoBtn').click();expect((await snapshot(page)).modules).toEqual(separated.modules);await install(page,'wheel',key);expect((await snapshot(page)).count).toBe(12);
 }
 await shot(page,'14-wheel-detach-and-reassembly');
});

test('selection does not switch power; test and run prevent detachment and dragging; loose parts stay separate on reload',async({page})=>{
 await fixture(page,mountedCar(false,true));await select(page,'switch');const pt=await qa<Point>(page,'screen','switch');await page.mouse.dblclick(pt.x,pt.y);expect((await snapshot(page)).modules.find((m:any)=>m.id==='switch').switchOn).toBe(false);
 await detach(page,'battery');await page.reload();await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));expect((await snapshot(page)).count).toBe(11);expect(await qa(page,'isInstalled','battery')).toBe(false);await install(page,'battery');
 await select(page,'switch');await page.locator('#toggleSwitch').click();await page.locator('#testBtn').click();await select(page,'battery');await expect(page.locator('#detachPart')).toHaveCount(0);const before=await snapshot(page);const start=await qa<Point>(page,'screen','battery');await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+80,start.y+40);await page.mouse.up();expect((await snapshot(page)).modules).toEqual(before.modules);await page.locator('#testBtn').click();
 await page.locator('#runBtn').click();await select(page,'battery');await expect(page.locator('#detachPart')).toHaveCount(0);await page.locator('#runBtn').click();await select(page,'battery');await expect(page.locator('#detachPart')).toBeVisible();await shot(page,'15-deliberate-detach-controls');
});
