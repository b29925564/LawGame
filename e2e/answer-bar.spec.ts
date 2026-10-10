/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// 手機的答案列釘在底部：鍵盤焦點移到發現便條時不能被它蓋住（介面與操作待辦 2，設計師 #246 r9）。
const desk = {
  hours: 20,
  timeline: [],
  spent: 4,
  marked: [],
  readDocs: [],
  jobs: ['job-ride', 'job-sophie'],
  mail: [],
  openMail: [],
  link: { cards: [], relation: null },
  found: ['l-watch', 'l-called'],
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
async function open(page: Page) {
  await page.goto('/');
  await page.evaluate((desk) => {
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
          cards: ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo', 'access-partial'],
          flags: [],
          ethics: [],
          scenes: { investigate: desk },
        },
      }),
    );
  }, desk);
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
  const first = page.getByRole('button', { name: /^01 / });
  if (await first.isVisible()) await first.click();
  await page.waitForTimeout(800);
}

test('手機：焦點移到發現便條，便條整張停在答案列上方', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const notes = page.locator('.found-list .found');
  await notes.first().focus();
  await page.waitForTimeout(400);
  const gap = await page.evaluate(() => {
    const bar = document.querySelector('.answer-bar')!.getBoundingClientRect();
    const on = document.activeElement!.getBoundingClientRect();
    return Math.round(bar.top - on.bottom);
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  const pad = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollPaddingBottom,
  );
  expect(parseInt(pad)).toBeGreaterThan(100);
});
