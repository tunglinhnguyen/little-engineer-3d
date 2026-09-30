import { test, expect, type Page } from '@playwright/test';

type Point = { x:number; y:number };
type Pose = { position:[number,number,number]; rotationY:number };

async function boot(page:Page){
  await page.addInitScript(()=>localStorage.clear());
  await page.goto('/?qa=1&manual=1');
  await page.waitForFunction(()=>Boolean((window as any).__CAR_LAB__));
}

async function qa<T=any>(page:Page,method:string,...args:any[]):Promise<T>{
  return page.evaluate(({method,args})=>(window as any).__CAR_LAB__[method](...args),{method,args});
}

async function snapshot(page:Page){ return qa<any>(page,'snapshot'); }
async function shot(page:Page,name:string){
  await page.screenshot({path:'test-results/car/'+name+'.png'});
}

async function ids(page:Page,type:string){
  const state=await snapshot(page);
  return state.modules.filter((m:any)=>m.type===type).map((m:any)=>m.id as string);
}

async function firstId(page:Page,type:string){
  const list=await ids(page,type);
  if(!list.length) throw new Error('Missing '+type);
  return list[0];
}

async function dragToPose(page:Page,id:string,pose:Pose,holdMs=0){
  const state=await snapshot(page);
  const module=state.modules.find((m:any)=>m.id===id);
  if(!module) throw new Error('Missing module '+id);

  const start=await qa<Point>(page,'screen',id);
  const target=await qa<Point>(
    page,
    'screenWorld',
    [pose.position[0],module.position[1],pose.position[2]],
  );

  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  if(holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.move(target.x,target.y,{steps:14});
  await page.mouse.up();
  await page.waitForTimeout(180);
}

async function install(page:Page,type:string,slotKey?:string){
  let resolved:string|undefined;

  if(type==='wheel'){
    for(const candidate of await ids(page,'wheel')){
      if(!(await qa<boolean>(page,'isInstalled',candidate))){
        resolved=candidate;
        break;
      }
    }
  }else{
    resolved=await firstId(page,type);
  }

  if(!resolved) throw new Error('No loose '+type);

  const pose=await qa<Pose|null>(page,'targetPose',type,slotKey);
  if(!pose) throw new Error('No target pose for '+type+(slotKey?' '+slotKey:''));
  await dragToPose(page,resolved,pose);
  expect(await qa<boolean>(page,'isInstalled',resolved)).toBe(true);
  return resolved;
}

async function spawnFullCarArbitrary(page:Page){
  // A road is fixture infrastructure; every car part itself is still manually placed.
  await qa(page,'forceRoad','road-straight',[0,.65,0],0);

  // Deliberately not assembly order.
  for(const type of [
    'motor','wheel','battery','drive-axle','gearbox','car-base',
    'switch','front-axle','differential','wheel','wheel','wheel',
  ]){
    await qa(page,'spawn',type);
  }

  await page.locator('#focusAll').click();
  await page.waitForTimeout(250);
}

async function assembleFullCar(page:Page){
  await spawnFullCarArbitrary(page);

  await install(page,'car-base');
  await install(page,'differential');
  await install(page,'front-axle');
  await install(page,'battery');
  await install(page,'drive-axle');
  await install(page,'motor');
  await install(page,'switch');
  await install(page,'gearbox');

  await install(page,'wheel','wheel-fr');
  await install(page,'wheel','wheel-rl');
  await install(page,'wheel','wheel-fl');
  await install(page,'wheel','wheel-rr');
}

test.beforeEach(async({page})=>boot(page));

test('01 all car modules are selectable in any order and click only places a loose part',async({page})=>{
  await expect(page.locator('.part')).toHaveCount(9);
  for(let i=0;i<9;i++) await expect(page.locator('.part').nth(i)).toBeEnabled();

  // Pick motor before chassis/battery: no sequential lock.
  await page.locator('.part').nth(3).click();
  await page.locator('.part').nth(1).click();
  await page.locator('.part').nth(8).click();

  const state=await snapshot(page);
  expect(state.count).toBe(0);
  expect(state.modules.some((m:any)=>m.type==='motor'&&!m.slotKey)).toBe(true);
  expect(state.modules.some((m:any)=>m.type==='battery'&&!m.slotKey)).toBe(true);
  expect(state.modules.some((m:any)=>m.type==='wheel'&&!m.slotKey)).toBe(true);

  await expect(page.locator('#coach')).toContainText('Khung');
  await shot(page,'01-free-order-loose-parts.png');
});

test('02 child manually drags all 12 pieces and magnetic assist only finishes near the target',async({page})=>{
  await assembleFullCar(page);

  const state=await snapshot(page);
  expect(state.count).toBe(12);
  expect(state.ready).toBe(true);
  await expect(page.locator('#progressText')).toHaveText('12 / 12');
  await expect(page.locator('#runBtn')).toBeEnabled();

  await shot(page,'02-manual-snap-complete-car.png');
});

test('03 installed part is tap-safe and only detaches after deliberate hold then drag',async({page})=>{
  await assembleFullCar(page);

  const motorId=await firstId(page,'motor');
  const before=await qa<any>(page,'rendered',motorId);
  const start=await qa<Point>(page,'screen',motorId);

  // Tap selects only.
  await page.mouse.click(start.x,start.y);
  await page.waitForTimeout(100);
  expect(await qa(page,'rendered',motorId)).toEqual(before);

  // Accidental quick swipe before the hold threshold is ignored.
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(start.x-100,start.y+28,{steps:4});
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect(await qa(page,'rendered',motorId)).toEqual(before);
  expect(await qa<boolean>(page,'isInstalled',motorId)).toBe(true);

  // Deliberate 0.5 s hold unlocks movement; then dragging away detaches.
  const looseTarget=await qa<Point>(page,'screenWorld',[-4.4,.98,-3.8]);
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.waitForTimeout(540);
  await page.mouse.move(looseTarget.x,looseTarget.y,{steps:12});
  await page.mouse.up();
  await page.waitForTimeout(180);

  expect(await qa<boolean>(page,'isInstalled',motorId)).toBe(false);
  expect((await snapshot(page)).ready).toBe(false);
  await shot(page,'03-hold-to-detach.png');
});

test('04 installed module controls are minimal and do not contain auto-attach or direct delete',async({page})=>{
  await assembleFullCar(page);

  const motorId=await firstId(page,'motor');
  const point=await qa<Point>(page,'screen',motorId);
  await page.mouse.click(point.x,point.y);

  await expect(page.locator('#selectionPanel')).toBeVisible();
  await expect(page.locator('#gestureHint')).toContainText('giữ khoảng 0,5 giây');
  await expect(page.locator('#moduleActions')).toContainText('Nhìn gần');
  await expect(page.locator('#installPart')).toHaveCount(0);
  await expect(page.locator('#detachPart')).toHaveCount(0);
  await expect(page.locator('#deletePart')).toHaveCount(0);

  const switchId=await firstId(page,'switch');
  const switchPoint=await qa<Point>(page,'screen',switchId);
  await page.mouse.click(switchPoint.x,switchPoint.y);
  await expect(page.locator('#toggleSwitch')).toBeVisible();

  await shot(page,'04-contextual-safe-controls.png');
});

test('05 assembled parts travel as one car while only the rear wheels are drivetrain-powered',async({page})=>{
  await assembleFullCar(page);

  const carId=await firstId(page,'car-base');
  const motorId=await firstId(page,'motor');
  const frontLeft=(await snapshot(page)).modules.find((m:any)=>m.slotKey==='car:wheel-fl').id as string;
  const rearLeft=(await snapshot(page)).modules.find((m:any)=>m.slotKey==='car:wheel-rl').id as string;

  const carBefore=await qa<any>(page,'rendered',carId);
  const motorBefore=await qa<any>(page,'rendered',motorId);
  const frontBefore=await qa<any>(page,'rendered',frontLeft);

  await page.locator('#runBtn').click();
  await expect(page.locator('#runBtn')).toContainText('Dừng');
  await page.waitForTimeout(1100);

  const running=await snapshot(page);
  expect(running.rpm).toHaveProperty(motorId);
  expect(running.rpm).toHaveProperty(rearLeft);
  expect(running.rpm).not.toHaveProperty(frontLeft);

  const carAfter=await qa<any>(page,'rendered',carId);
  const motorAfter=await qa<any>(page,'rendered',motorId);
  const frontAfter=await qa<any>(page,'rendered',frontLeft);

  expect(carAfter.position).not.toEqual(carBefore.position);
  expect(motorAfter.position).not.toEqual(motorBefore.position);
  expect(frontAfter.position).not.toEqual(frontBefore.position);

  await shot(page,'05-running-mechanisms.png');
});
