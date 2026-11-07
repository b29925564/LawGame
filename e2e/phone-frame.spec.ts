/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { fitLineUnits } from '../src/ui/lineUnits';

/**
 * 冷開場的手機框（設計師裁定 25376da 第 6 項）：
 * - 框裡的字照 fitLine 在詞界斷，不出現「財務長辦｜公室」「聲｜音。」「電梯｜廳」。
 * - 手機框的上緣在右上角選單鈕下緣再下 ≥8px（320 寬時選單鈕蓋到手機狀態列）。
 * 步驟：2 通知、4 叫車、5 對話、7 對話、8 刷卡、9 門。
 */
const STEPS = [2, 4, 5, 7, 8, 9];
const TEXT =
  '.phone-body > p, .notif > span:not(.notif-app), .bubble, .ride-route dd, .subtitles li > span, .replies button';

async function open(page: Page, step: number, scale: number) {
  await page.goto('/');
  await page.evaluate(
    ([step, scale]) => {
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
            episode: 'ep1',
            scene: 0,
            step,
            choices: { 'cold-open': { 3: 0 } },
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [step, scale] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await expect(page.locator('.phone')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

for (const w of [320, 360])
  for (const scale of [1, 1.25, 1.5])
    test(`冷開場手機框：詞界斷行、框不被選單鈕蓋（${w} 寬・${scale * 100}%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 640 });
      for (const step of STEPS) {
        await open(page, step, scale);
        const gap = await page.evaluate(() => {
          const phone = document.querySelector('.phone')!.getBoundingClientRect();
          const menu = document.querySelector('.menu-toggle')!.getBoundingClientRect();
          return phone.top - menu.bottom;
        });
        expect(gap, `第 ${step} 步 手機框上緣和選單鈕下緣的距離`).toBeGreaterThanOrEqual(8);
        const got = await page.locator(TEXT).evaluateAll((els) =>
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
        expect(got.length, `第 ${step} 步 框裡有字`).toBeGreaterThan(0);
        for (const { text, starts } of got) {
          const marks = new Set<number>();
          let pos = 0;
          for (const u of fitLineUnits(text)) marks.add((pos += u.length));
          for (const at of starts)
            expect
              .soft(
                marks.has(at) || /\s/.test(text[at - 1] ?? ''),
                `第 ${step} 步「${text.slice(0, at)}｜${text.slice(at)}」`,
              )
              .toBe(true);
        }
      }
    });
