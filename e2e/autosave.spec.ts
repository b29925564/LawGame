import { expect, test, type Page } from '@playwright/test';

// 片頭 40 秒預設會播（title-intro.spec.ts 測）；這裡關掉片頭。
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0')));

/** 開新遊戲，在第一個電話場景裡回覆老闆：這是場景內的進度，換場前不會自動存檔。 */
async function replyToBoss(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: /^聊天 葛蘭特・沃斯/ }).click();
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

test('關分頁前（pagehide）會自動存檔', async ({ page }) => {
  await replyToBoss(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expectReplyKept(page);
});

test('切到背景（visibilitychange 變 hidden）會自動存檔', async ({ page }) => {
  await replyToBoss(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.reload();
  await expectReplyKept(page);
});
