/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 幕卡 9:16 直排版在 ≤360 寬（第二道關卡 7075839 舊問題 7；設計師 v93 裁定 一之 3）：
 * 標題（幕序＋幕名）、標題欄（含案號）、場記線互不重疊，也都在卡裡；英文標題只在完整的字之間換行。
 * 字級照 11.3 的下限：標題欄 ≥14px、場記 ≥12px。幕名放不下先換行，換了還放不下才縮字。
 */
const CARDS = [
  ['ep1', 1],
  ['ep1', 6],
  ['ep1', 14],
  ['ep1', 18],
  ['ep1', 45],
  ['ep2', 1],
  ['ep2', 5],
  ['ep2', 7],
  ['ep2', 11],
  ['ep2', 13],
] as const;

async function open(page: Page, episode: string, scene: number, lang: string, scale: number) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, lang, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', lang as string);
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
            episode,
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
    [episode, scene, lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  await expect(page.locator('.act-card .act-big')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

type Box = { l: number; t: number; r: number; b: number };

for (const [w, h] of [
  [320, 640],
  [360, 740],
] as const)
  for (const lang of ['zh', 'en'] as const)
    for (const scale of [1, 1.5])
      test(`幕卡直排：標題、標題欄、場記線不重疊且在卡內，英文整字換行（${w}・${lang}・${scale * 100}%）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
        test.slow();
        await page.setViewportSize({ width: w, height: h });
        for (const [episode, scene] of CARDS) {
          await open(page, episode, scene, lang, scale);
          const m = await page.evaluate(() => {
            const card = document.querySelector('.act-card')!;
            const rect = (r: DOMRect): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
            // 字實際佔的範圍（Range）：被卡邊切掉的字也量得到。
            const ink = (sel: string) => {
              const e = card.querySelector(sel);
              if (!e) return null;
              const r = document.createRange();
              r.selectNodeContents(e);
              return rect(r.getBoundingClientRect());
            };
            const px = (sel: string) =>
              parseFloat(getComputedStyle(card.querySelector(sel)!).fontSize);
            // 英文幕名：每一個字只在一行裡（不在字中間斷）。
            const big = card.querySelector('.act-big')!;
            const split: string[] = [];
            const walk = document.createTreeWalker(big, NodeFilter.SHOW_TEXT);
            for (let n = walk.nextNode(); n; n = walk.nextNode())
              for (const x of (n.textContent ?? '').matchAll(/[A-Za-z’'-]+/g)) {
                const r = document.createRange();
                r.setStart(n, x.index);
                r.setEnd(n, x.index + x[0].length);
                const tops = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
                if (tops.size > 1) split.push(x[0]);
              }
            return {
              name: big.textContent,
              card: rect(card.getBoundingClientRect()),
              title: ink('.act-head'),
              caption: ink('.act-caption'),
              no: ink('.act-no'),
              slate: card.querySelector('.act-slate')
                ? rect(card.querySelector('.act-slate')!.getBoundingClientRect())
                : null,
              split,
              px: {
                caption: px('.act-caption'),
                no: px('.act-no'),
                big: px('.act-big'),
                slate: card.querySelector('.act-slate') ? px('.act-slate') : 99,
              },
            };
          });
          const tag = `${episode} scene ${scene}「${m.name}」`;
          const boxes = { 標題: m.title, 標題欄: m.caption, 案號: m.no, 場記線: m.slate };
          const cut = (a: Box, b: Box) =>
            Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 &&
            Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
          for (const [name, b] of Object.entries(boxes)) {
            if (!b) continue;
            expect
              .soft(
                b.l >= m.card.l - 0.5 &&
                  b.r <= m.card.r + 0.5 &&
                  b.t >= m.card.t - 0.5 &&
                  b.b <= m.card.b + 0.5,
                `${tag} ${name}超出卡外：${JSON.stringify(b)}，卡 ${JSON.stringify(m.card)}`,
              )
              .toBe(true);
          }
          for (const [a, b] of [
            ['標題', '標題欄'],
            ['標題', '案號'],
            ['標題', '場記線'],
            ['案號', '場記線'],
          ] as const) {
            const x = boxes[a];
            const y = boxes[b];
            if (x && y) expect.soft(cut(x, y), `${tag} ${a}和${b}重疊`).toBe(false);
          }
          expect.soft(m.split, `${tag} 英文字被拆成兩行`).toEqual([]);
          expect.soft(m.px.caption, `${tag} 標題欄字級`).toBeGreaterThanOrEqual(14);
          expect.soft(m.px.no, `${tag} 案號字級`).toBeGreaterThanOrEqual(14);
          expect.soft(m.px.slate, `${tag} 場記字級`).toBeGreaterThanOrEqual(12);
          expect.soft(m.px.big, `${tag} 幕名字級`).toBeGreaterThanOrEqual(14);
        }
      });
