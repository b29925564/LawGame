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
    // 等進場動畫結束：「回標題」的框和頁面高度連續幾個畫格都不動（固定等 400 ms 在 CI 慢時會落在動畫中途）。
    const btn = await back.elementHandle();
    await page.waitForFunction(
      (el) => {
        const r = el!.getBoundingClientRect();
        const sig = [r.left, r.top, r.width, r.height, document.documentElement.scrollHeight]
          .map((n) => Math.round(n * 10))
          .join(',');
        const w = window as unknown as { __sig?: string; __still?: number };
        w.__still = sig === w.__sig ? (w.__still ?? 0) + 1 : 0;
        w.__sig = sig;
        return (w.__still ?? 0) >= 8;
      },
      btn,
      { polling: 'raf' },
    );
    const box = (await back.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(839);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      839,
    );
  });
