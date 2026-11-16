/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 證據板左欄（Issue #375，設計師裁定 (a)）：時間線入口自己一塊、不在疑問清單裡；
 * 「已確認 n」是疑問清單的小標，在時間線卡下面——字離時間線卡至少 16 px，離自己清單第一項至少 8 px。
 * 原本小標在時間線卡上方只差 1.4 px，讀起來像時間線的標題。兩集的證據板，第一級桌機寬度。
 */
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
  confirmed: [] as string[],
  submissions: 0,
  wrong: 0,
  report: [],
  feedback: {},
  motions: {},
  flags: [],
  wrapped: false,
};
const BOARDS = [
  { ep: 'ep1', scene: 7, key: 'investigate', cards: ['ethan-accused', 'ethan-ride', 'indictment'] },
  { ep: 'ep2', scene: 10, key: 'pretrial', cards: ['contract', 'voice-memo'] },
] as const;

async function open(page: Page, b: (typeof BOARDS)[number], confirmed: string[]) {
  await page.goto('/');
  await page.evaluate(
    ([b, d]) => {
      localStorage.setItem('lawgame-lang', 'zh');
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: b.ep,
            scene: b.scene,
            step: 0,
            choices: {},
            cards: b.cards,
            flags: [],
            ethics: [],
            scenes: { [b.key]: d },
          },
        }),
      );
    },
    [b, { ...desk, confirmed }] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
}

for (const w of [1366, 1530, 1920])
  for (const b of BOARDS)
    for (const confirmed of b.ep === 'ep1' ? [[], ['q1']] : [[]])
      test(`${b.ep} 證據板 ${w}：「已確認 ${confirmed.length}」在時間線卡下面，離它 ≥16 px、離第一題 ≥8 px`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
        await page.setViewportSize({ width: w, height: 900 });
        await open(page, b, confirmed);
        const list = page.locator('nav.q-list').first();
        await expect(list).toBeVisible();
        // 時間線不是疑問：不在清單（ul）裡。
        await expect(list.locator('ul .timeline-entry')).toHaveCount(0);
        const m = await list.evaluate((nav) => {
          const tl = nav.querySelector('.timeline-entry')!.getBoundingClientRect();
          const eb = nav.querySelector(':scope > .eyebrow')!;
          const rg = document.createRange();
          rg.selectNodeContents(eb);
          const text = rg.getBoundingClientRect();
          const first = nav.querySelector('ul > li > *')!.getBoundingClientRect();
          return {
            label: eb.textContent,
            order: tl.bottom <= text.top,
            above: text.top - tl.bottom,
            below: first.top - text.bottom,
          };
        });
        const info2 = JSON.stringify(m);
        expect(m.label, info2).toBe(`已確認 ${confirmed.length}`);
        expect(m.order, info2).toBe(true);
        expect(m.above, info2).toBeGreaterThanOrEqual(16);
        expect(m.below, info2).toBeGreaterThanOrEqual(8);
        if (process.env.SHOTS)
          await list.screenshot({
            path: `${process.env.SHOTS}/qlist-${b.ep}-${w}-c${confirmed.length}.png`,
          });
      });
