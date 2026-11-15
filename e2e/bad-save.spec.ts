import { expect, test, type Page } from '@playwright/test';

// 片頭 40 秒預設會播（title-intro.spec.ts 測）；這裡關掉片頭。
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0')));

/** 在頁面載入前塞一個自動存檔。 */
const seed = (page: Page, file: object) =>
  page.addInitScript(
    (raw) => localStorage.setItem('lawgame-ep-auto', raw),
    JSON.stringify({ version: 5, savedAt: 1, label: '第 1 集・測試', ...file }),
  );
const base = { episode: 'ep1', scene: 0, step: 0, choices: {}, cards: [], flags: [], ethics: [] };

test('壞掉的自動存檔當作沒有：標題照常顯示，不出現「繼續」', async ({ page }) => {
  await seed(page, { progress: { ...base, cards: null, choices: null, scenes: {} } });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '新遊戲' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^繼續（/ })).toHaveCount(0);
});

test('讀進來的進度讓畫面出錯時回到標題，不白屏，存檔還在', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // 結構合法，但認罪協商那一場的狀態是空物件：畫面一畫就丟錯。
  await seed(page, {
    sceneId: 'plea-morrow',
    progress: { ...base, scenes: { 'plea-morrow': {} } },
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^繼續（/ }).click();
  await expect(page.getByRole('button', { name: '新遊戲' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^繼續（/ })).toBeVisible();
  expect(errors.length).toBeGreaterThan(0);
});
