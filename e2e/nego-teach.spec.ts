/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 攤牌會洩底（企劃書 6.8，評測 v97 第 6 點）：第 1 集認罪協商第一次打開「攤牌」分頁，
 * 盧卡斯講一句「亮給她看的，開庭那天她都會備好說法」；亮過一張之後就不再出現，回標題重進也不再出現。
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
          episode: 'ep1',
          scene: 11,
          step: 0,
          choices: {},
          cards: ['arg-a', 'arg-b', 'arg-d'],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  }, fresh);
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.getByRole('button', { name: /^坐下$/ }).click();
  await page.getByRole('button', { name: '攤牌', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}

const LINE = '亮給她看的，開庭那天她都會備好說法。';

test('攤牌分頁第一次打開有教學，亮過一張就不再出現', async ({ page }, info) => {
  await open(page, true);
  const teach = page.locator('.reveal .desk-teach');
  await expect(teach).toContainText(LINE);
  await expect(teach).toContainText('盧卡斯');
  await page.screenshot({ path: info.outputPath('nego-teach.png') });
  // 換分頁再回來，還沒亮過就還在。
  await page.getByRole('button', { name: '虛張聲勢', exact: true }).click();
  await page.getByRole('button', { name: '攤牌', exact: true }).click();
  await expect(teach).toBeVisible();
  await page.getByRole('button', { name: /^亮出/ }).first().click();
  await expect(teach).toHaveCount(0);
  // 重新從存檔進來（設定還在）：不再出現。
  await open(page, false);
  await expect(page.locator('.reveal')).toBeVisible();
  await expect(page.locator('.reveal .desk-teach')).toHaveCount(0);
});
