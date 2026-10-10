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

// 換地點先放一格場記（PlaceBeat）：短黃線是那一格唯一的黃（設定集 11.3；第一道關卡 N3）。
// 場記在的 2.5 秒，這一場的介面還沒掛；場記走了介面才出現，主按鈕一出現就是黃的。
test('定場：場記在的時候介面還沒掛；走了之後主按鈕是黃的', async ({ page }) => {
  await load(page, 'ep2', 9);
  const slate = page.locator('.place-slate');
  await expect(slate).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-hand', 'slate');
  await expect(page.locator('button.primary')).toHaveCount(0);
  await expect(page.locator('.place-beat')).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-hand', 'slate');
  await expect(page.locator('button.primary:visible').first()).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
});

test('定場：點一下就跳過', async ({ page }) => {
  await load(page, 'ep2', 9);
  await expect(page.locator('.place-beat')).toBeVisible();
  await page.locator('.place-beat').click();
  await expect(page.locator('.place-beat')).toHaveCount(0, { timeout: 1500 });
});

test('減少動態：場記停 2.5 秒後直接收掉，黃直接回到主按鈕', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, 'ep2', 9);
  await expect(page.locator('html')).toHaveAttribute('data-hand', 'slate');
  await expect(page.locator('.place-beat')).toHaveCount(0, { timeout: 5000 });
  const primary = page.locator('button.primary:visible').first();
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
