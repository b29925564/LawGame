import { expect, test } from '@playwright/test';

// 關卡 2 設計師備註：手機集尾卡要在 Pixel 7（412×839）一屏放得下，「回標題」不用捲就按得到。
for (const [episode, lang] of [
  ['ep1', 'zh'],
  ['ep1', 'en'],
  ['ep2', 'zh'],
  ['ep2', 'en'],
] as const)
  test(`集尾卡在 Pixel 7 一屏放得下（${episode}・${lang}）`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 839 });
    await page.goto('/');
    await page.evaluate(
      ([episode, lang]) => {
        localStorage.setItem('lawgame-lang', lang);
        localStorage.setItem(
          'lawgame-ep-auto',
          JSON.stringify({
            version: 5,
            savedAt: Date.now(),
            label: 'x',
            progress: {
              episode,
              scene: 999,
              step: 0,
              choices: {},
              cards: [],
              flags: [],
              ethics: [],
              scenes: {},
            },
          }),
        );
      },
      [episode, lang] as const,
    );
    await page.reload();
    await page
      .getByRole('button', { name: /^(繼續|Continue)/ })
      .first()
      .click();
    const back = page.getByRole('button', { name: /^(回標題|Back to title)$/ });
    await expect(back).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(400);
    const box = (await back.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(839);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      839,
    );
  });
