/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

const desk = {
  hours: 20,
  timeline: [],
  spent: 4,
  marked: [],
  readDocs: [],
  jobs: [],
  mail: [],
  openMail: [],
  link: { cards: [], relation: null },
  found: [],
  badLinks: 0,
  linkNote: null,
  attempts: {},
  confirmed: [],
  submissions: 0,
  wrong: 0,
  report: [],
  feedback: {},
  motions: {},
  flags: [],
  wrapped: false,
};
const CARDS = [
  'ethan-accused',
  'ethan-ride',
  'ethan-message',
  'indictment',
  'watch-listed',
  'access-partial',
  'sophie-home',
  'ride-receipt',
  'watch-notice',
  'car-statement',
];

// 證據板邊緣的卡（含長卡名、照片卡）不互相壓住：上一格的字不被下一格蓋掉（第二道關卡 2）。
for (const lang of ['zh-TW', 'en'])
  for (const [w, h] of [
    [1440, 900],
    [1530, 860],
  ])
    test(`證據板邊緣的卡不互相壓住（${lang} ${w}×${h}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.evaluate(
        ([lang, cards, desk]) => {
          localStorage.setItem('lawgame-lang', lang as string);
          localStorage.setItem(
            'lawgame-ep-auto',
            JSON.stringify({
              version: 5,
              savedAt: Date.now(),
              label: 'x',
              progress: {
                episode: 'ep1',
                scene: 7,
                step: 0,
                choices: {},
                cards,
                flags: [],
                ethics: [],
                scenes: { investigate: desk },
              },
            }),
          );
        },
        [lang, CARDS, desk] as const,
      );
      await page.reload();
      await page
        .getByRole('button', { name: /^(繼續|Continue)/ })
        .first()
        .click();
      const beat = page.locator('.place-beat');
      await page.waitForTimeout(300);
      if (await beat.count()) await beat.click();
      await page
        .getByRole('button', { name: /^(證據板|Board)/ })
        .first()
        .click();
      const cards = page.locator('.cork-card');
      await expect(cards.first()).toBeVisible();
      await page.waitForTimeout(600);
      const boxes = await cards.evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom };
        }),
      );
      expect(boxes.length).toBeGreaterThan(4);
      // 歪斜後的外框多出幾 px，容許 8px。
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const x = Math.min(boxes[i].r, boxes[j].r) - Math.max(boxes[i].l, boxes[j].l);
          const y = Math.min(boxes[i].b, boxes[j].b) - Math.max(boxes[i].t, boxes[j].t);
          expect(x > 0 && y > 8, `卡 ${i} 和卡 ${j} 重疊 ${Math.round(y)}px`).toBe(false);
        }
    });
