/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

/**
 * 按鈕的無障礙名稱要包含畫面上的字（WCAG 2.5.3；設計師 ci-ax-names 11-16 補判 B2）：
 * - 手機通知：以前名稱只有「打開 X 的訊息」，讀屏聽不到訊息內文（那是劇情）。現在名稱就是按鈕上的字。
 * - 發現卡：以前名稱少了關係（「矛盾」等）。現在照第一行寫：編號、關係、兩張卡；內文、註記和「新」放描述。
 */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0')));

test('手機通知：名稱就是按鈕上的字，念得到訊息內文', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).click();
  // 只有第 1 集能選時「新遊戲」直接開始（#452）；第 2 集也列出來時才有清單。
  const ep1 = page.getByRole('button', { name: /^第 1 集/ });
  if (await ep1.isVisible()) await ep1.click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  const notif = page.locator('button.notif');
  await expect(notif).toBeVisible();
  const body = (await notif.locator('span').nth(1).textContent())!.trim();
  expect(body.length).toBeGreaterThan(0);
  await expect(notif).toHaveAccessibleName(/^聊天 葛蘭特・沃斯 /);
  expect(await notif.evaluate((el) => el.getAttribute('aria-label'))).toBeNull();
  // 內文整句都在名稱裡（空白和斷行提示不算）。
  const name = await notif.evaluate((el) => (el as HTMLElement).innerText);
  expect(name.replace(/\s+/g, '')).toContain(body.replace(/\s+/g, ''));
});

test('發現卡：名稱有編號、關係和兩張卡，內文和「新」在描述裡', async ({ page }) => {
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
  const notes = page.locator('.found-item button.found');
  await expect(notes.first()).toBeVisible();
  for (const note of await notes.all()) {
    const relation = (await note.locator('.found-head > span').first().textContent())!.trim();
    const pair = (await note.locator('.found-pair').textContent())!.trim();
    const text = (await note.locator('.found-text').textContent())!.trim();
    await expect(note).toHaveAccessibleName(new RegExp(`^發現 \\d+，${relation}：`));
    const name = await note.evaluate((el) => el.getAttribute('aria-label')!);
    expect(name).toContain(pair);
    await expect(note).toHaveAccessibleDescription(new RegExp(text.slice(0, 8)));
  }
  // 最新的那條有「新」，也念得到。
  const fresh = page.locator('.found-item button.found:has(.found-new)');
  await expect(fresh).toHaveCount(1);
  await expect(fresh).toHaveAccessibleDescription(/^新 /);
});
