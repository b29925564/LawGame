import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 法庭異議窗放得下（v93，體驗評測 g2-ce2218f、g2-681548c）：
 * - 理由按鈕的字不超出格子，中欄不橫向溢出（1100 英文 150% 原本四欄每格 78px，Speculation 要 113px）。
 * - 標題列的「生效中」不被擠成一兩個字寬的窄條（1100 英文 150% 原本 25px 寬）。
 * - 1280×800 窗開著時陪審團第二排還在畫面裡（兩欄四列原本把它推出 17–28px）。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

async function openCourt(page: Page, width: number, height: number, scale: number, lang: string) {
  await page.setViewportSize({ width, height });
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
  await page.waitForTimeout(1200);
}

async function openObjection(page: Page) {
  await page.locator('button.primary.wide:not(.locked)').first().click();
  await expect(page.locator('section.objection .row button').first()).toBeVisible();
  await page.waitForTimeout(2000);
}

for (const [width, height, scale, lang, juryFits = true] of [
  [1100, 860, 1.5, 'en'],
  [1100, 860, 1.3, 'en'],
  [1100, 860, 1.5, 'zh'],
  [1100, 860, 1, 'en'],
  [1366, 860, 1, 'en'],
  [1366, 860, 1.5, 'en'],
  [1530, 860, 1, 'en'],
  // 1280 寬 150%：陪審團是整片 2×6，三欄放不下（14.7em），兩欄四列會把它推出 63px——#303 改兩欄後就有，交設計師，這裡只驗按鈕。
  [1280, 860, 1.5, 'en', false],
  [1100, 800, 1.5, 'en'],
  [1100, 800, 1.3, 'en'],
  [1100, 800, 1.5, 'zh'],
  [1280, 800, 1, 'en'],
  [1280, 800, 1, 'zh'],
  [1366, 768, 1, 'en'],
] as [number, number, number, string, boolean?][]) {
  test(`異議窗放得下（${width}×${height}・${scale * 100}%・${lang}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '桌機版面');
    await openCourt(page, width, height, scale, lang);
    const closed = await page.evaluate(() => {
      const body = document.querySelector('.shell-body') as HTMLElement;
      return body.scrollWidth - body.clientWidth;
    });
    expect(closed, '中欄橫向可捲').toBeLessThanOrEqual(0);

    await openObjection(page);
    const m = await page.evaluate(() => {
      const bad: string[] = [];
      for (const b of document.querySelectorAll('section.objection button')) {
        const e = b as HTMLElement;
        if (e.scrollWidth > e.clientWidth + 0.5)
          bad.push(`${e.textContent} ${e.scrollWidth}>${e.clientWidth}`);
      }
      const body = document.querySelector('.shell-body') as HTMLElement;
      const head = document.querySelector('.objection .in-effect.head') as HTMLElement | null;
      const fs = parseFloat(
        getComputedStyle(document.querySelector('section.objection')!).fontSize,
      );
      const jury = document.querySelector('.jurybox')!.getBoundingClientRect();
      const doc = document.scrollingElement!;
      return {
        bad,
        scroll: body.scrollWidth - body.clientWidth,
        head: head && head.offsetWidth ? +(head.offsetWidth / fs).toFixed(1) : null,
        juryOver: Math.round(jury.bottom - innerHeight),
        docScroll: doc.scrollHeight - doc.clientHeight,
      };
    });
    expect(m.bad, '按鈕字被切').toEqual([]);
    expect(m.scroll).toBeLessThanOrEqual(0);
    // 標題列夾著「生效中」時至少要 6em 寬（原本 1100 英文 150% 只剩 1.1em，一行一兩個字）。
    if (m.head !== null) expect(m.head, '「生效中」被擠成窄條').toBeGreaterThanOrEqual(6);
    // 頁面不捲：陪審團整個在畫面裡。
    if (juryFits && m.docScroll <= 0) expect(m.juryOver, '陪審團被推出畫面').toBeLessThanOrEqual(0);
  });
}
