/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 選單鈕四周 8px（設計師 v93 排字規則 1，第二道關卡 72a9003 裁定 5：上下左右都算，7.5 也不夠）。
 * 關卡量到的：協商、調解「剩餘回合」0.4px，取證「5 題」5px，調解「85」7.6px；另外眉標在 150% 時離鈕左邊 1.3–1.4px。
 * 鈕的寬高跟著字級變，CSS 裡固定的讓位不夠；menuClear.ts 照實際的鈕讓位。
 */
type Case = {
  ep: string;
  scene: number;
  name: string;
  enter?: RegExp;
  walk?: boolean;
  scenes?: Record<string, unknown>;
};
const CASES: Case[] = [
  { ep: 'ep1', scene: 11, name: '協商', enter: /^(坐下|Sit)/ },
  { ep: 'ep2', scene: 12, name: '調解', enter: /^(坐下|Sit)/ },
  { ep: 'ep2', scene: 8, name: '取證', walk: true },
  { ep: 'ep2', scene: 9, name: '取證（對方）' },
  { ep: 'ep2', scene: 16, name: '開場陳述' },
  // 第二道關卡 464a280 第 4 項：法庭頂列的借據膠囊「IOU 01／IOU 02」在 390／412 英文 125% 離鈕 7.8px。
  {
    ep: 'ep1',
    scene: 17,
    name: '法庭（借據膠囊）',
    enter: /^(開庭|Go to court)/,
    scenes: {
      theory: { chosen: 'rachel' },
      opening: { promises: ['rachel-time', 'rachel-sender'] },
    },
  },
];

async function open(page: Page, c: Case, lang: string, scale: number) {
  await page.goto('/');
  await page.evaluate(
    ([c, lang, scale]) => {
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
            episode: (c as Case).ep,
            scene: (c as Case).scene,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: (c as Case).scenes ?? {},
          },
        }),
      );
    },
    [c, lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await beat.click({ timeout: 3000 }).catch(() => {});
  if (c.enter) await page.getByRole('button', { name: c.enter }).first().click();
  if (c.walk)
    for (let k = 0; k < 25 && !(await page.locator('.panel-head.bench').count()); k++) {
      const btn = page
        .locator('main button.primary:visible, .scene.plated .primary:visible')
        .last();
      if (!(await btn.count())) break;
      await btn.click();
      await page.waitForTimeout(120);
    }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** 離選單鈕不到 8px 的字（每一行）或有框、有底色的東西。 */
const near = () => {
  const mt = document.querySelector('.menu-toggle')!;
  const m = mt.getBoundingClientRect();
  const out: string[] = [];
  const dist = (r: DOMRect) =>
    Math.hypot(
      Math.max(m.left - r.right, r.left - m.right, 0),
      Math.max(m.top - r.bottom, r.top - m.bottom, 0),
    );
  const skip = (e: Element | null) =>
    !e || !!e.closest('.game-menu') || getComputedStyle(e).visibility === 'hidden';
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!n.textContent?.trim() || skip(p)) continue;
    const cs = getComputedStyle(p!);
    if (cs.clipPath.includes('inset(50%)') || +cs.opacity === 0) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    for (const b of r.getClientRects())
      if (b.width > 0.5 && b.height > 0.5 && dist(b) < 8 - 0.05)
        out.push(`「${n.textContent.trim().slice(0, 20)}」${dist(b).toFixed(1)}px`);
  }
  for (const e of document.querySelectorAll('body *')) {
    if (skip(e) || e.contains(mt)) continue;
    const cs = getComputedStyle(e);
    const border =
      parseFloat(cs.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor);
    const fill = !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor);
    if (!border && !fill) continue;
    const b = e.getBoundingClientRect();
    if (b.width < 1 || b.height < 1 || b.width > innerWidth - 1) continue;
    if (dist(b) < 8 - 0.05) out.push(`<${e.className}> ${dist(b).toFixed(1)}px`);
  }
  return out;
};

for (const w of [320, 360, 390, 412])
  for (const lang of ['zh', 'en'])
    test(`選單鈕四周 8px 內沒有字或框（${w}・${lang}・100／125／150%）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      test.setTimeout(120_000);
      await page.setViewportSize({ width: w, height: 760 });
      for (const scale of [1, 1.25, 1.5])
        for (const c of CASES) {
          await open(page, c, lang, scale);
          expect.soft(await page.evaluate(near), `${c.name} ${scale * 100}%`).toEqual([]);
        }
    });

/** 定場（場記那一格）還沒有場景圖時，左上角的「待放 3D 機位・定場」也離選單鈕 8px 以上（設計師 關卡 72a9003）。 */
for (const w of [320, 360])
  for (const lang of ['zh', 'en'])
    test(`定場的占位字離選單鈕 8px 以上（${w}・${lang}・100／125／150%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 760 });
      for (const scale of [1, 1.25, 1.5]) {
        await page.goto('/');
        await page.evaluate(
          ([lang, scale]) => {
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
                  episode: 'ep2',
                  scene: 22,
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
          [lang, scale] as const,
        );
        await page.reload();
        await page
          .getByRole('button', { name: /^(繼續|Continue)/ })
          .first()
          .click();
        await expect(page.locator('.place-tbd')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        expect
          .soft(
            (await page.evaluate(near)).filter((x) => /待放|TBD|定場|Establishing/.test(x)),
            `${scale * 100}%`,
          )
          .toEqual([]);
      }
    });
