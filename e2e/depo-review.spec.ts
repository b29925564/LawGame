import { expect, test } from '@playwright/test';

// 第二道關卡第 11 條：取證回顧的標籤要和摘要對得上。對沒有毛病的問題提異議，摘要算一筆站不住的異議，
// 這題就不能標成「照答」。
test('取證回顧：每一筆站不住的異議都有自己的標籤，沒有被標成「照答」', async ({ page }) => {
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
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  await page.getByRole('button', { name: '開始錄取' }).click();
  // 五題全部提「無關」：三題沒有毛病，兩題有毛病但理由不對。
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '無關', exact: true }).click();
  const review = page.locator('.depo-review');
  await expect(review).toBeVisible();
  const n = Number(await page.locator('dt:has-text("站不住的異議") + dd').innerText());
  expect(n).toBe(5);
  await expect(review.locator('.depo-tag.baseless')).toHaveCount(3);
  await expect(review.locator('.depo-tag.wrong')).toHaveCount(2);
  await expect(review.locator('.depo-tag.plain')).toHaveCount(0);
});
