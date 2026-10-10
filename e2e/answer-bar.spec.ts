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
  await page.evaluate(() => document.fonts.ready.then(() => true));
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

// 便條是紙：「展開」用便條的鉛筆色，深色主題也讀得出來（設計師 #252：淺字印在淺紙上只有 1.5:1）。
test('深色主題：便條上的「展開」是鉛筆色，對便條紙 ≥ 4.5:1', async ({ page, isMobile }) => {
  test.skip(!isMobile, '手機的窄便條才會折行出現「展開」');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  const more = page.locator('.found-more').first();
  await expect(more).toBeVisible();
  const [fg, bg] = await page.evaluate(() => {
    const m = document.querySelector('.found-more')!;
    const note = m.parentElement!.querySelector('.found')!;
    return [getComputedStyle(m).color, getComputedStyle(note).getPropertyValue('--note')];
  });
  const lum = (hex: string) => {
    const n = hex.trim().replace('#', '');
    const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const [r, g, b] = v.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const fgHex =
    '#' +
    (fg.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((x) => (+x).toString(16).padStart(2, '0'))
      .join('');
  const l1 = lum(fgHex);
  const l2 = lum(bg.includes('#') ? bg.match(/#[0-9a-f]{6}/i)![0] : '#c6c0ba');
  expect((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
