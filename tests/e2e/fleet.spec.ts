import { test, expect, type Page } from '@playwright/test';
import { ConnectionGraph } from '../../src/core/connectionGraph';
import { builtVehicle, straightRoads, parkOnRoad } from '../fixtures';
import { detachAssembly } from '../../src/core/assembly';
import { vehicleSpec } from '../../src/core/vehicles';
import type { ModuleType, VehicleKind } from '../../src/core/types';
const qa=(page:Page,method:string,...args:any[])=>page.evaluate(({method,args})=>(window as any).__CAR_LAB__[method](...args),{method,args});
const snap=(p:Page)=>qa(p,'snapshot');
const fixture=(p:Page,g:ConnectionGraph)=>qa(p,'fixture',g.serialize());
async function boot(p:Page){await p.goto('/?qa=1');await p.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));}
async function take(p:Page,type:ModuleType){await p.locator('#carTab').click();await p.locator(`.part[data-type="${type}"]`).click();}
async function tapInstall(p:Page,type:ModuleType,slot?:string){await take(p,type);const target=p.locator(slot?`.socket-target[data-slot="${slot}"]`:'.socket-target').first();await expect(target).toBeVisible();await target.tap();}
async function drawer(p:Page,view:string){if(!await p.locator(`[data-view="${view}"]`).evaluate(e=>e.classList.contains('active')))await p.locator(`[data-view="${view}"]`).click();}
test.beforeEach(async({page})=>boot(page));

test('touch assembly: three different vehicles built entirely with palette and socket taps; no shared parts or three-car cap',async({page})=>{
 for(const kind of ['car','truck','tractor'] as VehicleKind[]){
  await page.locator('#newVehicleBtn').tap();await page.locator(`[data-new-kind="${kind}"]`).tap();
  for(const type of ['battery','switch','motor','gearbox','differential','front-axle','drive-axle'] as ModuleType[])await tapInstall(page,type);
  if(kind==='truck'){await tapInstall(page,'idler-axle');await tapInstall(page,'cargo-bed');}
  if(kind==='tractor'){await tapInstall(page,'hitch');await tapInstall(page,'trailer');await tapInstall(page,'idler-axle','trailer-front-axle');await tapInstall(page,'idler-axle','trailer-rear-axle');}
  for(let i=0;i<vehicleSpec(kind).wheels;i++)await tapInstall(page,'wheel');
  const s=await snap(page);expect(s.count).toBe(vehicleSpec(kind).total);expect(s.vehicles).toHaveLength(kind==='car'?1:kind==='truck'?2:3);
  expect(s.modules.filter((m:any)=>m.vehicleId===s.activeVehicleId&&m.type==='wheel')).toHaveLength(vehicleSpec(kind).wheels);
  await drawer(page,'parts');const sw=s.modules.find((m:any)=>m.vehicleId===s.activeVehicleId&&m.type==='switch');await page.locator(`[data-inspect="${sw.id}"]`).tap();await page.locator('#toggleSwitch').tap();expect((await snap(page)).rpm[sw.id]).toBeUndefined();expect(Object.keys((await snap(page)).rpm)).toHaveLength((kind==='car'?1:kind==='truck'?2:3)*6);
  await page.locator('#closeDrawer').tap();
 }
 const full=await snap(page);expect(full.modules).toHaveLength(48);expect(full.connections.filter((c:any)=>c.signal!=='structural').every((c:any)=>full.modules.find((m:any)=>m.id===c.fromModuleId).vehicleId===full.modules.find((m:any)=>m.id===c.toModuleId).vehicleId)).toBe(true);
 await page.locator('#newVehicleBtn').tap();await page.locator('[data-new-kind="car"]').tap();expect((await snap(page)).vehicles).toHaveLength(4);
 await page.reload();await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));expect((await snap(page)).vehicles).toHaveLength(4);expect((await snap(page)).modules).toHaveLength(49);
 await page.screenshot({path:'test-results/car/fleet-touch-assembly.png'});
});

test('world socket touch requires release; jitter selects safely; movement cancels placement',async({page,context})=>{
 await take(page,'car-base');await take(page,'battery');const before=await snap(page),part=before.modules.find((m:any)=>m.type==='battery'),pose=await qa(page,'targetPose','battery'),p=await qa(page,'screenWorld',[pose.position[0],pose.position[1]+.30,pose.position[2]]),cdp=await context.newCDPSession(page);
 const touch=(type:'touchStart'|'touchEnd'|'touchMove'|'touchCancel',x=p.x,y=p.y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
 await touch('touchStart');expect(await qa(page,'isInstalled',part.id)).toBe(false);await touch('touchMove',p.x+14,p.y);await touch('touchEnd',p.x+14,p.y);expect(await qa(page,'isInstalled',part.id)).toBe(false);
 await touch('touchStart');await touch('touchMove',p.x+2,p.y+1);await touch('touchEnd');expect(await qa(page,'isInstalled',part.id)).toBe(true);
 await page.locator('#undoBtn').click();expect(await qa(page,'isInstalled',part.id)).toBe(false);await page.locator('#redoBtn').click();expect(await qa(page,'isInstalled',part.id)).toBe(true);
});

test('garage: hidden parts, explicit detach, naming, colors, parking, reopening and per-vehicle limits survive reload',async({page})=>{
 const g=new ConnectionGraph();builtVehicle(g,'truck','truck');builtVehicle(g,'car','car',[9,.62,0]);await fixture(page,g);await page.locator('[data-vehicle="truck"]').tap();await drawer(page,'parts');
 await page.locator('[data-inspect="truck/differential"]').tap();expect((await snap(page)).inspection).toBe('truck/differential');await expect(page.locator('#detachPart')).toBeVisible();await page.locator('#detachPart').tap();expect(await qa(page,'isInstalled','truck/differential')).toBe(false);expect((await snap(page)).count).toBe(15);await page.locator('#undoBtn').tap();expect((await snap(page)).count).toBe(16);
 await drawer(page,'garage');await page.locator('#vehicleName').fill('Xe tải của An');await page.locator('#vehicleName').press('Tab');await page.locator('[data-color="#8d70b0"]').tap();await page.locator('#parkVehicle').tap();let s=await snap(page);expect(s.vehicles.find((v:any)=>v.id==='truck')).toMatchObject({name:'Xe tải của An',color:'#8d70b0',parked:true});expect(await qa(page,'screen','truck')).toBeNull();await expect(page.locator('.part[data-type="battery"]')).toBeDisabled();
 await page.reload();await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));await drawer(page,'garage');await page.locator('#parkVehicle').tap();s=await snap(page);expect(s.count).toBe(16);expect(s.vehicles.find((v:any)=>v.id==='truck').parked).toBe(false);expect(s.modules.find((m:any)=>m.id==='truck').color).toBe('#8d70b0');
 await page.locator('[data-vehicle="car"]').tap();await take(page,'wheel');expect((await snap(page)).modules.filter((m:any)=>m.vehicleId==='car'&&m.type==='wheel')).toHaveLength(4);
 await page.screenshot({path:'test-results/car/fleet-garage.png'});
});

test('three vehicles run independently; a switch stops one; Stop all freezes poses and reload preserves all joints',async({page})=>{
 const g=new ConnectionGraph();for(const [i,kind] of (['car','truck','tractor'] as VehicleKind[]).entries()){const id='v'+i;builtVehicle(g,id,kind);const roads=straightRoads(g,7,i*8,-14.4,id+'road');parkOnRoad(g,id,roads[2].id,[i*8,.74,-4.8]);}await fixture(page,g);await page.locator('#runAllBtn').tap();await page.waitForTimeout(900);const moving=await snap(page);expect(Object.keys(moving.fleet)).toHaveLength(3);expect(Object.values(moving.fleet).every((s:any)=>s.speed>0)).toBe(true);
 await drawer(page,'parts');await page.locator('[data-inspect="v2/switch"]').tap();await page.locator('#toggleSwitch').tap();await page.waitForTimeout(200);const before=await snap(page);await page.waitForTimeout(400);const after=await snap(page);expect(after.fleet.v2.position).toEqual(before.fleet.v2.position);expect(after.fleet.v1.distance).toBeGreaterThan(before.fleet.v1.distance);await expect(page.locator('#detachPart')).toHaveCount(0);
 await page.locator('#stopAllBtn').tap();const parked=await snap(page);await page.waitForTimeout(300);expect((await snap(page)).modules).toEqual(parked.modules);await page.reload();await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));const loaded=await snap(page);expect(loaded.modules).toEqual(parked.modules);expect(loaded.count).toBe(20);
 await page.screenshot({path:'test-results/car/fleet-three-running.png'});
});

test('gear and cargo experiments use the selected truck, display overload and save comparable results',async({page})=>{
 const g=new ConnectionGraph();builtVehicle(g,'truck','truck');await fixture(page,g);await drawer(page,'experiment');await page.locator('[data-gear="speed"]').tap();await page.locator('#measureExperiment').tap();for(let i=0;i<6;i++)await page.locator('#loadCargo').tap();await expect(page.locator('#loadCargo')).toBeDisabled();await page.locator('#measureExperiment').tap();await page.locator('[data-gear="power"]').tap();await page.locator('#measureExperiment').tap();
 const s=await snap(page),r=s.vehicles[0].experiments;expect(r).toHaveLength(3);expect(r[0].distance).toBeGreaterThan(0);expect(r[1]).toMatchObject({cargo:6,stalled:true,distance:0});expect(r[2].distance).toBeGreaterThan(0);expect(r[2].force).toBeGreaterThan(r[1].force);expect(s.rpm['truck/wheel-rl']).toBe(10);await expect(page.locator('#experimentResults tbody tr')).toHaveCount(3);
 await page.reload();await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));await drawer(page,'experiment');await expect(page.locator('#experimentResults tbody tr')).toHaveCount(3);await page.screenshot({path:'test-results/car/fleet-experiments.png'});
});

test('mission destinations are validated, delivery needs cargo, cancelling keeps parts, trailer completion requires every wheel',async({page})=>{
 const g=new ConnectionGraph();builtVehicle(g,'truck','truck');const roads=straightRoads(g,5,0,-9.6);parkOnRoad(g,'truck',roads[1].id,[0,.74,-4.8]);await fixture(page,g);await drawer(page,'missions');await page.locator('[data-mission="delivery"]').tap();await page.locator(`[data-destination="${roads[0].id}"]`).tap();expect((await snap(page)).vehicles[0].mission.status).toBe('choose');await page.locator(`[data-destination="${roads[4].id}"]`).tap();expect((await snap(page)).ready).toBe(false);await page.locator('#loadCargo').tap();expect((await snap(page)).ready).toBe(true);await page.locator('#cancelMission').tap();expect((await snap(page)).vehicles[0].mission).toBeUndefined();expect((await snap(page)).count).toBe(16);
 const h=new ConnectionGraph();builtVehicle(h,'tractor','tractor');detachAssembly(h,'tractor/wheel-tfl',[4,.33,4]);await fixture(page,h);await page.locator('[data-mission="trailer"]').tap();expect((await snap(page)).vehicles[0].mission.status).toBe('choose');await take(page,'wheel');await page.locator('.socket-target[data-slot="wheel-tfl"]').tap();expect((await snap(page)).vehicles[0].mission.status).toBe('completed');await page.screenshot({path:'test-results/car/fleet-missions.png'});
});
