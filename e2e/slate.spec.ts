import { expect, test, type Page } from '@playwright/test';

async function load(page: Page, episode: string, scene: number) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene]) => {
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode,
            scene,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [episode, scene] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
}

// 地點字卡的短黃線是那一格唯一的黃（設定集 11.3；第一道關卡 N3）：
// 字卡在的 2.5 秒，主按鈕退成白框；字卡淡出時黃還給主按鈕，字卡整行拿掉。
test('地點字卡在的時候，主按鈕不黃；字卡走了才黃', async ({ page }) => {
  await load(page, 'ep2', 9);
  const slate = page.locator('.place-slate');
  const primary = page.locator('button.primary:visible').first();
  await expect(slate).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-hand', 'slate');
  await expect(primary).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(slate).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-hand', 'slate');
  await expect(primary).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  // 黃用和字卡淡出一樣的 180ms 淡回主按鈕（設計師 r8）。
  await expect(primary).toHaveCSS('transition-duration', /0\.18s/);
});

test('減少動態：字卡走了，黃直接回到主按鈕，不淡入', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, 'ep2', 9);
  const primary = page.locator('button.primary:visible').first();
  await expect(page.locator('html')).toHaveAttribute('data-hand', 'slate');
  await expect(page.locator('.place-slate')).toHaveCount(0, { timeout: 5000 });
  await expect(primary).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(primary).toHaveCSS('transition-duration', '0s');
});

test('沒有地點字卡的時候（幕卡之後的第一場），主按鈕一開始就是黃的', async ({ page }) => {
  await load(page, 'ep1', 2);
  await expect(page.getByText(/港灣大道一號/)).toBeVisible();
  await expect(page.locator('.place-slate')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-hand', 'slate');
  await expect(page.locator('button.primary:visible').first()).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
});
