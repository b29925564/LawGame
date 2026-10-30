import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 法庭異議窗放得下（v93，體驗評測 g2-ce2218f、g2-681548c）：
 * - 理由按鈕的字不超出格子，中欄不橫向溢出（1100 英文 150% 原本四欄每格 78px，Speculation 要 113px）。
 * - 標題列的「生效中」不被擠成一兩個字寬的窄條（1100 英文 150% 原本 25px 寬）。
 * - 窗開著時陪審團還在畫面裡：整片 2×6 放不下就收成刻痕條（字級 130–150% 原本推出 48–189px）。
 * - 「要異議嗎？」不斷在詞中；320 寬「不異議」不超出窗、頁面不橫向捲。
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

for (const [width, height, scale, lang] of [
  [1100, 860, 1.5, 'en'],
  [1100, 860, 1.3, 'en'],
  [1100, 860, 1.5, 'zh'],
  [1100, 860, 1, 'en'],
  [1366, 860, 1, 'en'],
  [1366, 860, 1.5, 'en'],
  [1530, 860, 1, 'en'],
  [1530, 860, 1.5, 'en'],
  [1280, 860, 1.5, 'en'],
  [1280, 860, 1.5, 'zh'],
  [1100, 800, 1.5, 'en'],
  [1100, 800, 1.3, 'en'],
  [1100, 800, 1.5, 'zh'],
  [1280, 800, 1, 'en'],
  [1280, 800, 1, 'zh'],
  [1280, 800, 1.3, 'en'],
  [1280, 800, 1.5, 'en'],
  [1366, 768, 1, 'en'],
  [1366, 768, 1.5, 'en'],
  [360, 740, 1.5, 'zh'],
  [320, 640, 1.5, 'zh'],
  [320, 640, 1.5, 'en'],
] as [number, number, number, string][]) {
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
        docWide: doc.scrollWidth - doc.clientWidth,
        collapsed: document.querySelector('.jurybox')!.classList.contains('collapsed'),
        titleLines: (() => {
          const h2 = document.querySelector('section.objection h2') as HTMLElement;
          return Math.round(h2.offsetHeight / parseFloat(getComputedStyle(h2).lineHeight));
        })(),
        passOut: (() => {
          const sec = document.querySelector('section.objection')!.getBoundingClientRect();
          const p = document.querySelector('section.objection .pass')!.getBoundingClientRect();
          return Math.round(p.right - sec.right);
        })(),
      };
    });
    expect(m.bad, '按鈕字被切').toEqual([]);
    expect(m.scroll).toBeLessThanOrEqual(0);
    // 標題列夾著「生效中」時至少要 6em 寬（原本 1100 英文 150% 只剩 1.1em，一行一兩個字）。
    if (m.head !== null) expect(m.head, '「生效中」被擠成窄條').toBeGreaterThanOrEqual(6);
    // 桌機：陪審團整個在畫面裡（頁面就算多出幾 px 能捲，也捲不到被推出去的那段）。
    if (width >= 1024) expect(m.juryOver, '陪審團被推出畫面').toBeLessThanOrEqual(0);
    // 100% 放得下整片的尺寸照舊展開（只在放不下時才收）。
    if (scale === 1 && width >= 1180) expect(m.collapsed, '陪審團被誤收').toBe(false);
    // 「要異議嗎？」一行，不斷在詞中（「要異／議嗎？」）；放不下時是「不異議」換到下一行。
    expect(m.titleLines, '標題斷行').toBe(1);
    expect(m.docWide, '頁面橫向可捲').toBeLessThanOrEqual(0);
    expect(m.passOut, '「不異議」超出窗').toBeLessThanOrEqual(0);
  });
}

/**
 * 收成刻痕條之後點開看臉（體驗評測 g2-8592d60）：展開的陪審團要整個在畫面裡，不能看得到卻捲不到。
 * 原本字級 130–150% 時框超出下緣 24–86px，最嚴重只剩「Jury ▾」。
 */
for (const [width, height, scale, lang] of [
  [1280, 800, 1.3, 'en'],
  [1280, 800, 1.5, 'en'],
  [1366, 768, 1.5, 'en'],
  [1366, 768, 1.5, 'zh'],
  [1280, 860, 1.5, 'zh'],
  [1530, 860, 1.5, 'en'],
  [1100, 860, 1.5, 'en'],
  [1100, 860, 1.5, 'zh'],
  [320, 640, 1.5, 'en'],
  [320, 640, 1, 'zh'],
] as [number, number, number, string][]) {
  test(`點開看臉的陪審團整個在畫面裡（${width}×${height}・${scale * 100}%・${lang}）`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '桌機版面');
    await openCourt(page, width, height, scale, lang);
    await openObjection(page);
    const strip = page.locator('.jb-strip');
    await expect(strip, '陪審團收成刻痕條').toBeVisible();
    await strip.click();
    await expect(page.locator('.jurybox .jb-grid')).toBeVisible();
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const pop = document.querySelector('.jurybox .jb-pop')!;
      const box = getComputedStyle(pop).display === 'contents' ? pop.parentElement! : pop;
      const jb = box.getBoundingClientRect();
      const rec = document.querySelector('.record')!.getBoundingClientRect();
      const doc = document.scrollingElement!;
      return {
        // 浮層留在左欄：左右緣和筆錄紙對齊，不蓋到中間的異議窗和鏡頭條。
        side: Math.round(Math.max(rec.left - jb.left, jb.right - rec.right)),
        // 框裡的東西不超出框（1100 寬一排六張會凸出右緣）。
        spill: Math.round(
          Math.max(
            ...[...box.querySelectorAll('.jb-grid, .jb-head')].map(
              (e) => e.getBoundingClientRect().right - jb.right,
            ),
          ),
        ),
        titleLines: (() => {
          const h = box.querySelector('.jb-head h2') as HTMLElement;
          return Math.round(h.offsetHeight / parseFloat(getComputedStyle(h).lineHeight));
        })(),
        top: Math.round(jb.top),
        over: Math.round(jb.bottom - innerHeight),
        docWide: doc.scrollWidth - doc.clientWidth,
      };
    });
    expect(m.docWide, '頁面橫向可捲').toBeLessThanOrEqual(0);
    if (width >= 1024) {
      expect(m.over, '展開的陪審團超出下緣').toBeLessThanOrEqual(0);
      expect(m.top, '展開的陪審團超出上緣').toBeGreaterThanOrEqual(0);
      expect(m.side, '浮層超出左欄').toBeLessThanOrEqual(1);
      expect(m.spill, '臉凸出浮層').toBeLessThanOrEqual(0);
      expect(m.titleLines, '「陪審團 ▾」斷行').toBe(1);
      // 異議窗和鏡頭條不被擠動：窗還在、理由按得到。
      await expect(page.locator('section.objection .row button').first()).toBeVisible();
    }
  });
}
