import { expect, test } from '@playwright/test';

// 第二道關卡第 12 條：卷宗裡崔佛的錄取逐字稿要有頁:行，和證據卡引的 Tr. 42:7 對得上。
test('卷宗逐字稿：標頁:行，行號從 6 接著數，答句在第 7 行', async ({ page }) => {
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
          scene: 10,
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
  await page
    .getByRole('button', { name: /^(卷宗|Case file)/ })
    .first()
    .click();
  await page
    .locator('button')
    .filter({ hasText: /崔佛・米爾斯|Trevor Mills/ })
    .first()
    .click();
  await expect(page.locator('.doc-cite')).toHaveText('Tr. 42:6–7');
  // 頁:行和行號是紙上印的字：Courier Prime，不是場記用的 JetBrains Mono（設定集第 9 章 <Transcript>）。
  await expect(page.locator('.doc-cite')).toHaveCSS('font-family', /^"?Courier Prime/);
  const numFont = await page
    .locator('.doc-lines li')
    .first()
    .evaluate((el) => getComputedStyle(el, '::before').fontFamily);
  expect(numFont).toMatch(/^"?Courier Prime/);
  // 行號是 CSS 計數器：從第 6 行開始數（counter-reset: line 5），兩句就是 6、7。
  await expect(page.locator('.doc-lines')).toHaveAttribute('style', /counter-reset:\s*line 5/);
  // 標了證據卡的那一句（答句）是第 7 行。
  await expect(page.locator('.doc-lines li').nth(1)).toContainText(
    /從系統上線就是提醒|always been|reminder/,
  );
});
