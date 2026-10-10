/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

// 收合的發現便條（設計師 #246 r8）：連線內容切在整行的邊界，盧卡斯的結論整行看得到；人名不拆成「伊／森」。
test('收合的發現便條：結論整行看得到，內容不留半行字', async ({ page }) => {
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
  const notes = page.locator('.found-item');
  await expect(notes.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const report = await notes.evaluateAll((items) =>
    items.map((li) => {
      const text = li.querySelector<HTMLElement>('.found-text')!;
      const note = li.querySelector<HTMLElement>('.found-note');
      const lh = parseFloat(getComputedStyle(text).lineHeight);
      const lines = text.clientHeight / lh;
      const body = li.querySelector<HTMLElement>('.found-body')!;
      return {
        whole: Math.abs(lines - Math.round(lines)) < 0.05,
        noteCut: note
          ? note.scrollHeight > note.clientHeight + 1 ||
            note.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 1
          : false,
        // 「伊森」在同一行：兩個字的上緣一樣高。
        name: (() => {
          const at = text.textContent!.indexOf('伊森');
          if (at < 0) return true;
          const r = document.createRange();
          const node = [...text.querySelectorAll('*'), text]
            .flatMap((e) => [...e.childNodes])
            .find((n) => n.nodeType === 3 && n.textContent!.includes('伊森'));
          if (!node) return true;
          const i = node.textContent!.indexOf('伊森');
          r.setStart(node, i);
          r.setEnd(node, i + 1);
          const a = r.getBoundingClientRect().top;
          r.setStart(node, i + 1);
          r.setEnd(node, i + 2);
          return Math.abs(r.getBoundingClientRect().top - a) < 2;
        })(),
      };
    }),
  );
  for (const r of report) expect(r).toEqual({ whole: true, noteCut: false, name: true });
});
