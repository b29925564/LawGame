import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 法庭異議窗的理由按鈕放得下（v93，體驗評測 g2-ce2218f）：1100 寬英文 150% 字級，中欄 370px，
 * 八個理由排四欄每格 78px，「Speculation」要 113px——字超出按鈕、關著的窗也一樣，中欄橫向多出 15px 可捲。
 * 窄或字級大時改兩欄；中欄不橫向溢出，窗開著時每顆按鈕的字都在自己的格子裡。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

for (const [width, scale, lang] of [
  [1100, 1.5, 'en'],
  [1100, 1.3, 'en'],
  [1100, 1.5, 'zh'],
  [1100, 1, 'en'],
  [1366, 1, 'en'],
  [1366, 1.5, 'en'],
  [1530, 1, 'en'],
  [1280, 1.5, 'en'],
] as const) {
  test(`法庭中欄不橫向溢出、異議窗按鈕放得下（${width}・${scale * 100}%・${lang}）`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '桌機版面');
    await page.setViewportSize({ width, height: 860 });
    await page.addInitScript(
      ([s, l, sc]) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
        if (l === 'en') localStorage.setItem('lawgame-lang', 'en');
        localStorage.setItem(
          'lawgame-settings',
          JSON.stringify({ state: { textScale: sc }, version: 1 }),
        );
      },
      [
        JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
        lang,
        scale,
      ] as const,
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
      .first()
      .click();
    const open = page.getByRole('button', { name: lang === 'en' ? 'Go to court' : '開庭' });
    await open.or(page.locator('.court-cam')).first().waitFor();
    if (await open.isVisible()) await open.click();
    await expect(page.locator('.court-slot')).toBeVisible();
    await page.waitForTimeout(1200);

    const closed = await page.evaluate(() => {
      const body = document.querySelector('.shell-body') as HTMLElement;
      const slot = document.querySelector('.court-slot') as HTMLElement;
      return {
        scroll: body.scrollWidth - body.clientWidth,
        slotRight: slot.getBoundingClientRect().right,
        bodyRight: body.getBoundingClientRect().right,
      };
    });
    expect(closed.scroll, '中欄橫向可捲').toBeLessThanOrEqual(0);
    expect(closed.slotRight).toBeLessThanOrEqual(closed.bodyRight + 0.5);

    await page.locator('button.primary.wide:not(.locked)').first().click();
    await expect(page.locator('section.objection .row button').first()).toBeVisible();
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => {
      const bad: string[] = [];
      for (const b of document.querySelectorAll('section.objection button')) {
        const e = b as HTMLElement;
        if (e.scrollWidth > e.clientWidth + 0.5)
          bad.push(`${e.textContent} ${e.scrollWidth}>${e.clientWidth}`);
      }
      const sec = document.querySelector('section.objection') as HTMLElement;
      const body = document.querySelector('.shell-body') as HTMLElement;
      return {
        bad,
        scroll: body.scrollWidth - body.clientWidth,
        secOver: sec.scrollWidth - sec.clientWidth,
      };
    });
    expect(over.bad, '按鈕字被切').toEqual([]);
    expect(over.scroll).toBeLessThanOrEqual(0);
    expect(over.secOver).toBeLessThanOrEqual(0);
  });
}
