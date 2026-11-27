/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * #448：第 2 集第一次打開「開示」，羅根講一句「交出去的每一張紙，奧卡福都讀得出它指向哪裡」；
 * 回應過一項請求之後就不再出現（交出的文件會讓論點「已洩漏」，玩家要在交之前知道）。
 */
async function open(page: Page, fresh: boolean) {
  await page.goto('/');
  await page.evaluate((fresh) => {
    if (fresh) localStorage.clear();
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep2',
          scene: 6,
          step: 0,
          choices: {},
          cards: ['contract'],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  }, fresh);
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const tab = page.getByRole('button', { name: /^開示/ });
  await expect(page.getByRole('button', { name: /^郵件/ })).toBeVisible();
  if (!(await tab.isVisible())) await page.getByRole('button', { name: /^更多/ }).click();
  await tab.click();
  await page.evaluate(() => document.fonts.ready);
}

const LINE = '交出去的每一張紙，奧卡福都讀得出它指向哪裡。';

test('開示第一次打開有羅根那句，回應過一項就不再出現', async ({ page }, info) => {
  await open(page, true);
  const teach = page.locator('.desk-teach');
  await expect(teach).toContainText(LINE);
  await expect(teach).toContainText('羅根');
  await page.screenshot({ path: info.outputPath('discovery-teach.png') });
  // 回應第一項請求（承攬合約）：選「交出」再送出。
  const req = page.locator('.discovery > li').first();
  await req.getByRole('button', { name: '交出', exact: true }).click();
  await req.getByRole('button', { name: /^交出這/ }).click();
  await expect(teach).toHaveCount(0);
  await open(page, false);
  await expect(page.locator('.discovery')).toBeVisible();
  await expect(page.locator('.desk-teach')).toHaveCount(0);
});
