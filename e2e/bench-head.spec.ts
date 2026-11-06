/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { fitLineUnits } from '../src/ui/lineUnits';

/**
 * 頂列（.bench）的人名職稱、幕名地點和警示：中文只在詞與詞之間換行（fitLine），不出現「合規｜長」「服｜務 22」
 * 「資深系統工程｜師」「沒人反｜駁。」（第二道關卡 25376da 第 3 項：頂列讓位給選單鈕後窄了約 15px，詞中斷行從 12 組變 18 組）。
 */
const PAGES: [string, string, number][] = [
  ['調解（第 1 集協商）', 'ep1', 11],
  ['第 1 集證詞', 'ep1', 10],
  ['第 2 集證詞', 'ep2', 8],
  ['結辯', 'ep1', 26],
  ['法庭', 'ep1', 17],
];

async function open(page: Page, ep: string, scene: number, scale: number) {
  await page.goto('/');
  await page.evaluate(
    ([ep, scene, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', 'zh');
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { textScale: scale }, version: 1 }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: ep,
            scene,
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
    [ep, scene, scale] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.waitForTimeout(400);
  const beat = page.locator('.place-beat');
  if (await beat.count()) await beat.click({ timeout: 3000 }).catch(() => {});
  // 場景開頭的對白一句一句點過去，到頂列出來為止。
  const head = page.locator('.bench > .eyebrow');
  for (let i = 0; i < 20 && !(await head.count()); i++) {
    const next = page.locator('main button.primary').last();
    if (await next.count()) await next.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await expect(head).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** 每一段字的換行位置（新一行第一個字在全文裡的位置，空白不算）。 */
const breaks = (page: Page) =>
  page.locator('.bench > .eyebrow, .bench .court-warn').evaluateAll((els) =>
    els.map((el) => {
      const text = el.textContent ?? '';
      const starts: number[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let off = 0;
      let lastTop = -1;
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const s = n.textContent ?? '';
        for (let i = 0; i < s.length; i++, off++) {
          if (/\s/.test(s[i])) continue;
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const top = Math.round(r.getBoundingClientRect().top);
          if (lastTop >= 0 && Math.abs(top - lastTop) > 6) starts.push(off);
          lastTop = top;
        }
      }
      return { text, starts };
    }),
  );

for (const w of [320, 360, 390])
  for (const scale of [1, 1.25, 1.5])
    test(`頂列中文只在詞與詞之間換行：${w} 寬・${scale * 100}%`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: 740 });
      for (const [name, ep, scene] of PAGES) {
        await open(page, ep, scene, scale);
        for (const { text, starts } of await breaks(page)) {
          // 「・」前後的名字和職稱各自照 fitLine 排，「・」本身可以斷。
          const marks = new Set<number>();
          let pos = 0;
          for (const part of text.split(/(・)/)) {
            if (part === '・') marks.add((pos += 1));
            else for (const u of fitLineUnits(part)) marks.add((pos += u.length));
          }
          for (const at of starts)
            expect
              .soft(
                marks.has(at) || /\s/.test(text[at - 1] ?? ''),
                `${name}「${text.slice(0, at)}｜${text.slice(at)}」`,
              )
              .toBe(true);
        }
      }
    });
