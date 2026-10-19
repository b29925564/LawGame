/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * 手機的證據抽屜是一層蓋上來的對話框（體驗評測 v91 就有的四項）：
 * 選單鈕不再浮在遮罩上面、拉柄真的拉得動、橫向手機看得到卡、焦點進得去也出得來。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

async function openDrawer(page: Page, info: TestInfo, width: number, height: number) {
  test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
  await page.setViewportSize({ width, height });
  await page.addInitScript(
    (s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
      localStorage.setItem('lawgame-lang', 'en');
      localStorage.setItem('lawgame-record-instant', '1');
    },
    JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  const go = page.getByRole('button', { name: /^Go to court/ });
  await go.or(page.locator('.record')).first().waitFor();
  if (await go.isVisible()) await go.click();
  await page.locator('.evidence-tab').click();
  await expect(page.locator('.sheet')).toBeVisible();
  // 開場動畫（sheet-up）結束再量。
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== 'running' || !(a as CSSAnimation).animationName?.includes('sheet'),
      ),
  );
}

test.describe('證據抽屜（手機）', () => {
  test('右上角的點是遮罩：點下去關抽屜，不會打開選單', async ({ page }, info) => {
    await openDrawer(page, info, 412, 839);
    const m = (await page.locator('.menu-toggle').boundingBox())!;
    const [x, y] = [m.x + m.width / 2, m.y + m.height / 2];
    const hit = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.className,
      [x, y],
    );
    expect(hit).toContain('sheet-back');
    await page.mouse.click(x, y);
    await expect(page.locator('.sheet')).toHaveCount(0);
    await expect(page.locator('.menu-panel')).toHaveCount(0);
    // 抽屜關了，選單鈕又能點。
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.menu-panel')).toBeVisible();
  });

  test('拉柄拖得動：拖過三分之一關掉，拖一點會彈回原位', async ({ page }, info) => {
    await openDrawer(page, info, 412, 839);
    const grip = page.locator('.sheet-grip');
    await expect(grip).toBeVisible();
    const g = (await grip.boundingBox())!;
    const top0 = (await page.locator('.sheet').boundingBox())!.y;
    const [x, y] = [g.x + g.width / 2, g.y + g.height / 2];
    // 拖 60px、放開：回原位。
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 4 });
    await page.mouse.move(x, y + 60, { steps: 4 });
    const mid = (await page.locator('.sheet').boundingBox())!.y;
    expect(mid - top0).toBeGreaterThan(40);
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await page.locator('.sheet').boundingBox())!.y))
      .toBe(Math.round(top0));
    // 拖過抽屜高度的 1/3：關。
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 150, { steps: 6 });
    await page.mouse.move(x, y + 300, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.sheet')).toHaveCount(0);
  });

  test('橫向手機（863×360）：抽屜裡至少看得到兩張卡', async ({ page }, info) => {
    await openDrawer(page, info, 863, 360);
    const list = (await page.locator('.sheet .sheet-list').first().boundingBox())!;
    expect(list.height).toBeGreaterThanOrEqual(120);
    const cards = page.locator('.sheet .sheet-list > li');
    let seen = 0;
    for (let i = 0; i < 3; i++) {
      const b = await cards.nth(i).boundingBox();
      if (b && b.y >= 0 && b.y + b.height <= 360) seen++;
    }
    expect(seen).toBeGreaterThanOrEqual(2);
  });

  test('焦點：開了進抽屜、Tab 繞不出去、關了回到「證據」鈕', async ({ page }, info) => {
    await openDrawer(page, info, 412, 839);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('.sheet'));
    await expect(page.locator('.sheet')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.sheet')).toHaveAttribute('aria-modal', 'true');
    expect(await inside()).toBe(true);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
    // 焦點在卡上時第一下 Escape 先收提示（WCAG 1.4.13），第二下才關抽屜。
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet')).toHaveCount(0);
    await expect(page.locator('.evidence-tab')).toBeFocused();
  });
});
