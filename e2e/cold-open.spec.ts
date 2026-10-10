import { expect, test } from '@playwright/test';

test('冷開場：看過的訊息被收回，換場自動存檔，可從標題繼續', async ({ page }) => {
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
  await next();
  // 最後一頁是週六凌晨的警方現場照片（P2-6b）：三張沖印照順序排，遺體那一塊是「照片已遮蔽」黑條。
  const photos = page.getByRole('list', { name: '現場照片' });
  await expect(photos.getByRole('img')).toHaveCount(3);
  await expect(photos.getByRole('img').first()).toHaveAccessibleName(/全景/);
  await expect(photos.locator('.photolog-redact')).toHaveText('照片已遮蔽');
  await expect(photos.locator('.photolog-bates')).toHaveText([
    'CPD-000301',
    'CPD-000302',
    'CPD-000303',
  ]);
  await photos.getByRole('button', { name: /放大檢視 全景/ }).click();
  await expect(page.getByRole('dialog', { name: /放大檢視 全景/ })).toBeVisible();
  await page.getByRole('button', { name: '關閉' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await next();
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();

  await page.getByRole('button', { name: '選單' }).click();
  await page.getByRole('button', { name: '存到存檔 1' }).click();
  await expect(page.getByText('已存檔。')).toBeVisible();
  await page.getByRole('button', { name: '回標題' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /繼續（第 1 集・片頭）/ })).toBeVisible();
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取存檔 1' }).click();
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();
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
