/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

/**
 * 第一次玩（還沒教過異議）的法庭提示：教學長句「聽…問下去。有問題的地方就在問完的那一刻提異議。」
 * 提過一次異議以後換成短句「…直接詰問中。」，框不能跟著縮，下面的陪審團條不能跳
 * （體驗評測 v94，320×640 中文：框 95.1 → 90.8px，陪審團條 373.2 → 377.4）。
 */
test.use({
  viewport: { width: 320, height: 640 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});

test('320 中文：提過異議以後提示換短句，框高和陪審團條位置不變', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', '自己設視窗大小，跑一組就好');
  await page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0'));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep2',
          scene: 17,
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
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const go = page.getByRole('button', { name: '開庭' });
  await go.or(page.locator('.court-now')).first().waitFor();
  if (await go.isVisible()) await go.click();
  const now = page.locator('.court-now');
  await expect(now).toContainText('有問題的地方就在問完的那一刻提異議');
  await page.evaluate(() => document.fonts.ready);
  const box = () =>
    page.evaluate(() => ({
      now:
        Math.round(document.querySelector('.court-now')!.getBoundingClientRect().height * 10) / 10,
      jury: Math.round(document.querySelector('.jurybox')!.getBoundingClientRect().top * 10) / 10,
      // 看得到的那句（兩句疊在一起時，佔位的那句是 visibility: hidden）。
      shown: (() => {
        const p = document.querySelector('.court-now p')!;
        const spans = [...p.querySelectorAll('span')];
        return spans.length
          ? spans
              .filter((s) => getComputedStyle(s).visibility !== 'hidden')
              .map((s) => s.textContent)
          : [p.textContent];
      })(),
    }));
  const before = await box();
  await page.getByRole('button', { name: '聽下一個問題' }).click();
  await page.locator('section.objection button', { hasText: '誘導' }).first().click();
  await expect(now).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await box()).shown).toEqual(['丹尼爾・奧卡福直接詰問中。']);
  const after = await box();
  expect(after.now, JSON.stringify({ before, after })).toBe(before.now);
  expect(after.jury, JSON.stringify({ before, after })).toBe(before.jury);
});
