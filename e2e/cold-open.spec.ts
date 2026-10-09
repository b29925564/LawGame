import { expect, test, type Page } from '@playwright/test';

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

/** 開新遊戲，在第一個電話場景裡回覆老闆——這是場景內的進度，換場前不會自動存檔。 */
async function replyToBoss(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: /打開 葛蘭特・沃斯 的訊息/ }).click();
  await page.getByRole('button', { name: '好。' }).click();
}

/** 從標題繼續之後，回覆還在，可以直接往下走。 */
async function expectReplyKept(page: Page) {
  await page.getByRole('button', { name: /^繼續（/ }).click();
  await expect(page.getByText('十點四十五分上來，把筆電帶來。我們私下解決。')).toBeVisible();
  await expect(page.getByRole('button', { name: '好。' })).toHaveCount(0);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect(page.getByRole('button', { name: '叫車' })).toBeVisible();
}

test('回標題會自動存檔：繼續時保留這一場進行到一半的進度', async ({ page }) => {
  await replyToBoss(page);
  await page.getByRole('button', { name: '選單' }).click();
  await page.getByRole('button', { name: '回標題' }).click();
  await expectReplyKept(page);
});

test('分頁被關掉或丟到背景前會自動存檔', async ({ page }) => {
  await replyToBoss(page);
  await page.evaluate("window.dispatchEvent(new Event('pagehide'))");
  await page.reload();
  await expectReplyKept(page);
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
