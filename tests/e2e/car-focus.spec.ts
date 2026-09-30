import { test, expect, type Page } from '@playwright/test';

type Point = { x: number; y: number };

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?qa=1&manual=1');
  await page.waitForFunction(() => Boolean((window as any).__CAR_LAB__));
}

async function qa<T = any>(page: Page, method: string, ...args: any[]): Promise<T> {
  return page.evaluate(({ method, args }) => {
    const api = (window as any).__CAR_LAB__;
    return api[method](...args);
  }, { method, args });
}

async function snapshot(page: Page) {
  return qa<any>(page, 'snapshot');
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: 'test-results/car/' + name + '.png' });
}

async function spawnAllInArbitraryOrder(page: Page) {
  const order = [3, 5, 1, 4, 2, 0]; // motor, differential, battery, gearbox, switch, chassis
  for (const index of order) {
    await page.locator('.part').nth(index).click();
    await page.waitForTimeout(80);
  }
  await page.locator('#focusAll').click();
  await page.waitForTimeout(250);
}

async function moduleId(page: Page, type: string) {
  const state = await snapshot(page);
  const module = state.modules.find((item: any) => item.type === type);
  if (!module) throw new Error('Missing module ' + type);
  return module.id as string;
}

async function dragModuleToSnap(page: Page, type: string, holdMs = 0) {
  const id = await moduleId(page, type);
  const state = await snapshot(page);
  const module = state.modules.find((item: any) => item.id === id);
  const start = await qa<Point>(page, 'screen', id);
  const pose = await qa<any>(page, 'snapPose', type);
  if (!pose) throw new Error('No snap pose for ' + type);

  const target = await qa<Point>(
    page,
    'screenWorld',
    [pose.position[0], module.position[1], pose.position[2]],
  );

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(180);
}

async function assembleManually(page: Page) {
  await spawnAllInArbitraryOrder(page);

  await dragModuleToSnap(page, 'car-base');

  // Intentionally install in a non-sequential order.
  for (const type of ['differential', 'battery', 'motor', 'switch', 'gearbox']) {
    await dragModuleToSnap(page, type);
  }
}

test.beforeEach(async ({ page }) => boot(page));

test('01 every module is selectable from the start and clicks do not auto-install', async ({ page }) => {
  await expect(page.locator('.part')).toHaveCount(6);
  for (let index = 0; index < 6; index++) {
    await expect(page.locator('.part').nth(index)).toBeEnabled();
  }

  await page.locator('.part').nth(3).click(); // motor first
  let state = await snapshot(page);
  expect(state.modules.some((item: any) => item.type === 'motor')).toBe(true);
  expect(state.installedCount).toBe(0);

  await page.locator('.part').nth(1).click(); // battery next
  state = await snapshot(page);
  expect(state.modules.some((item: any) => item.type === 'battery')).toBe(true);
  expect(state.installedCount).toBe(0);

  await expect(page.locator('#coach')).toContainText('Khung xe');
  await shot(page, '01-free-order-loose-parts.png');
});

test('02 child manually drags parts and proximity snap assists the final placement', async ({ page }) => {
  await assembleManually(page);

  const state = await snapshot(page);
  expect(state.installedCount).toBe(6);
  expect(state.ready).toBe(true);
  expect(state.connections.length).toBeGreaterThanOrEqual(10);
  await expect(page.locator('#progressText')).toHaveText('6 / 6');
  await expect(page.locator('#runBtn')).toBeEnabled();

  await shot(page, '02-manual-snap-complete-car.png');
});

test('03 installed part ignores tap and quick drag, but hold then drag detaches it', async ({ page }) => {
  await assembleManually(page);

  const motorId = await moduleId(page, 'motor');
  const before = await qa<any>(page, 'rendered', motorId);
  const start = await qa<Point>(page, 'screen', motorId);

  // Simple tap: select only.
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(100);
  expect(await qa(page, 'rendered', motorId)).toEqual(before);

  // Quick accidental drag before hold threshold: still locked.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 120, start.y + 25, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect(await qa(page, 'rendered', motorId)).toEqual(before);
  expect(await qa(page, 'isInstalled', motorId)).toBe(true);

  // Deliberate long press followed by movement: detach.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(540);
  await page.mouse.move(start.x - 190, start.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(180);

  expect(await qa(page, 'isInstalled', motorId)).toBe(false);
  expect((await snapshot(page)).ready).toBe(false);
  await expect(page.locator('#gestureHint')).toContainText('kéo');
  await shot(page, '03-hold-to-detach.png');
});

test('04 module controls are contextual instead of offering an automatic attach button', async ({ page }) => {
  await assembleManually(page);

  const motorId = await moduleId(page, 'motor');
  const point = await qa<Point>(page, 'screen', motorId);
  await page.mouse.click(point.x, point.y);

  await expect(page.locator('#selectionPanel')).toBeVisible();
  await expect(page.locator('#gestureHint')).toContainText('giữ khoảng 0,5 giây');
  await expect(page.locator('#installPart')).toHaveCount(0);
  await expect(page.locator('#detachPart')).toHaveCount(0);
  await expect(page.locator('#moduleActions')).toContainText('Nhìn gần');
  await expect(page.locator('#moduleActions')).toContainText('Cất linh kiện');

  await shot(page, '04-contextual-actions.png');
});

test('05 motor gearbox differential and wheels animate as one running car', async ({ page }) => {
  await assembleManually(page);

  const beforeState = await snapshot(page);
  const carId = beforeState.carId as string;
  const before = await qa<any>(page, 'rendered', carId);

  await page.locator('#runBtn').click();
  await expect(page.locator('#runBtn')).toContainText('Dừng');
  await page.waitForTimeout(1100);

  const running = await snapshot(page);
  expect(running.rpm).toHaveProperty((await moduleId(page, 'motor')));
  expect(running.rpm).toHaveProperty((await moduleId(page, 'gearbox')));
  expect(running.rpm).toHaveProperty((await moduleId(page, 'differential')));
  expect(running.rpm).toHaveProperty(carId);

  const after = await qa<any>(page, 'rendered', carId);
  expect(after.position).not.toEqual(before.position);

  await shot(page, '05-running-mechanisms.png');
});
