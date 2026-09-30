import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean((window as any).__CAR_LAB__));
}

async function snapshot(page: Page) {
  return page.evaluate(() => (window as any).__CAR_LAB__.snapshot());
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: 'test-results/car/' + name + '.png' });
}

async function buildCar(page: Page) {
  const cards = page.locator('.part');
  await expect(cards).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await cards.nth(i).click();
    await page.waitForTimeout(120);
  }
}

test.beforeEach(async ({ page }) => boot(page));

test('01 focused UI exposes only six car modules', async ({ page }) => {
  await expect(page.locator('.part')).toHaveCount(6);
  await expect(page.locator('.palette')).toContainText('6 mô-đun của ô tô');
  await expect(page.locator('.build-progress')).toContainText('0 / 6');
  await shot(page,'01-six-modules.png');
});

test('02 six taps build the complete drivetrain', async ({ page }) => {
  await buildCar(page);
  const state = await snapshot(page);
  expect(state.ready).toBe(true);
  expect(state.connections.length).toBeGreaterThanOrEqual(10);
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(page.locator('#progressText')).toHaveText('6 / 6');
  await shot(page,'02-complete-car.png');
});

test('03 selected module actions stay compact and useful', async ({ page }) => {
  await buildCar(page);
  await page.locator('.part').nth(2).click();
  await expect(page.locator('#selectionPanel')).toBeVisible();
  await expect(page.locator('#moduleActions button')).toHaveCount(4);

  await page.locator('#detachPart').click();
  expect((await snapshot(page)).ready).toBe(false);

  await page.locator('#snapPart').click();
  expect((await snapshot(page)).ready).toBe(true);
  await shot(page,'03-module-actions.png');
});

test('04 switch button directly controls readiness', async ({ page }) => {
  await buildCar(page);
  await page.locator('.part').nth(1).click();

  await page.locator('#togglePart').click();
  expect((await snapshot(page)).ready).toBe(false);
  await expect(page.locator('#runBtn')).toBeDisabled();

  await page.locator('#togglePart').click();
  expect((await snapshot(page)).ready).toBe(true);
  await expect(page.locator('#runBtn')).toBeEnabled();
  await shot(page,'04-switch-control.png');
});

test('05 completed car actually moves on the fixed test road', async ({ page }) => {
  await buildCar(page);
  const beforeState = await snapshot(page);
  const carId = beforeState.carId as string;
  const before = await page.evaluate(id => (window as any).__CAR_LAB__.rendered(id), carId);

  await page.locator('#runBtn').click();
  await expect(page.locator('#runBtn')).toContainText('Dừng xe');
  await page.waitForTimeout(1100);

  const after = await page.evaluate(id => (window as any).__CAR_LAB__.rendered(id), carId);
  expect(after.position).not.toEqual(before.position);
  await shot(page,'05-car-running.png');
});
