import { expect, test } from '@playwright/test';

// 地點字卡的短黃線是那一格唯一的黃（設定集 11.3；第一道關卡 N3）：
// 字卡在的 2.5 秒，主按鈕退成白框；字卡淡出時黃還給主按鈕，字卡整行拿掉。
test('地點字卡在的時候，主按鈕不黃；字卡走了才黃', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep2',
          scene: 9,
          step: 0,
          choices: {},
          cards: [],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  });
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const slate = page.locator('.place-slate');
  const primary = page.locator('button.primary:visible').first();
  await expect(slate).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-hand', 'slate');
  await expect(primary).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(slate).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-hand', 'slate');
  await expect(primary).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
