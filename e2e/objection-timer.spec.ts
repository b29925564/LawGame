import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 限時異議窗（設定「異議窗 4 秒」）：選單開著或切到別的分頁時暫停倒數，回來接著算
 * （上線前審查 C12，Issue #386）。以前用 Date.now() 算終點，開選單調設定 6 秒回來，窗已經被記成不異議。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

async function openObjection(page: Page) {
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { objectionSeconds: 4 }, version: 1 }),
      );
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 })] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
  const open = page.getByRole('button', { name: '開庭' });
  await open.or(page.locator('.court-cam')).first().waitFor();
  if (await open.isVisible()) await open.click();
  await page.waitForTimeout(1200);
  await page.locator('button.primary.wide:not(.locked)').first().click();
  const win = page.locator('section.objection:not([data-off])');
  await expect(win.locator('.row button').first()).toBeVisible();
  return win;
}

test('限時異議窗：選單開著時不倒數，關掉後接著算', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', '桌機跑就好');
  const win = await openObjection(page);
  await page.getByRole('button', { name: '選單' }).click();
  await expect(page.getByRole('dialog', { name: '選單' })).toBeVisible();
  await page.waitForTimeout(6000);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '選單' })).toHaveCount(0);
  // 選單開了 6 秒（比 4 秒長），窗還在，還能異議。
  await expect(win.locator('.row button').first()).toBeVisible();
  await expect(win.locator('.panel-head .muted').first()).toHaveText(/^[1-4] 秒$/);
  // 接著倒數，時間到就記成不異議、窗關掉。
  await expect(win).toHaveCount(0, { timeout: 6000 });
});

test('限時異議窗：切到別的分頁時不倒數', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', '桌機跑就好');
  const win = await openObjection(page);
  const hide = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await hide(true);
  await page.waitForTimeout(6000);
  await hide(false);
  await expect(win.locator('.row button').first()).toBeVisible();
  await expect(win).toHaveCount(0, { timeout: 6000 });
});
