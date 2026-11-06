import { expect, test, type Page } from '@playwright/test';

/** 片頭一個鏡頭一個鏡頭快轉（每個鏡頭的計時器是上一個鏡頭換完才排的）。 */
async function playThroughIntro(page: Page) {
  const intro = page.locator('.title-intro');
  for (let i = 0; i < 8 && (await intro.count()); i++) {
    const shot = await intro.getAttribute('data-shot');
    await page.clock.fastForward(10_000);
    await expect(intro.and(page.locator(`[data-shot="${shot}"]`))).toHaveCount(0);
  }
  await expect(intro).toHaveCount(0);
}

test('冷開場：看過的訊息被收回，換場自動存檔，可從標題繼續', async ({ page }) => {
  // 冷開場之後是 38 秒的片頭（設定集 11.1）：時鐘快轉過去。
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();

  const next = () => page.getByRole('button', { name: '繼續' }).click();
  await next();
  await next();
  await page.getByRole('button', { name: /打開 葛蘭特・沃斯 的訊息/ }).click();
  await expect(page.getByText('十點四十五分上來，把筆電帶來。我們私下解決。')).toBeVisible();
  await page.getByRole('button', { name: '好。' }).click();
  await next();
  await page.getByRole('button', { name: '叫車' }).click();
  await next();
  await page.getByRole('button', { name: '嗯，算是吧。' }).click();
  await expect(page.getByText('老闆說要私下解決。也許……我不會被開除了。')).toBeVisible();
  await next();
  await next();
  await page.getByRole('button', { name: '感應員工證' }).click();
  await page.getByRole('button', { name: '推開門' }).click();
  await next();
  await next();
  await next();
  await expect(page.getByText('此訊息已被收回')).toBeVisible();
  await expect(page.getByText('我們私下解決')).toHaveCount(0);
  await next();
  // 冷開場裡沒有警方照片（設定集 11.5：冷開場沒有血、沒有黃）。
  await expect(page.getByRole('list', { name: '現場照片' })).toHaveCount(0);
  await next();
  // 第一次看片頭：沒有「跳過」，播完才是集名卡。
  await expect(page.locator('.title-intro')).toBeVisible();
  await expect(page.getByRole('button', { name: '跳過' })).toHaveCount(0);
  await playThroughIntro(page);
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();

  await page.getByRole('button', { name: '選單' }).click();
  await page.getByRole('button', { name: '存到存檔 1' }).click();
  await expect(page.getByText('已存檔。')).toBeVisible();
  await page.getByRole('button', { name: '回標題' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /繼續（第 1 集・片頭）/ })).toBeVisible();
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取存檔 1' }).click();
  // 存檔停在片頭那一格：片頭再播一次，第二次起可以跳過，跳到集名卡。
  await page.getByRole('button', { name: '跳過' }).click();
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();

  // 片頭卡之後直接是週一早上：警方照片要等 16:05 開示送到（police-photos.spec.ts）。
  await expect(page.getByRole('list', { name: '現場照片' })).toHaveCount(0);
  await next();
  await expect(page.getByText('港灣大道一號，頂樓', { exact: false })).toBeVisible();
});

test('語言切換：標題畫面切成英文，重新整理後保留，切回中文', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await page.getByRole('button', { name: '中文' }).click();
  await expect(page.getByRole('button', { name: '新遊戲' })).toBeVisible();
});
