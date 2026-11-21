import { expect, test } from '@playwright/test';

/**
 * v97 gate 2 第 3 點：連線准用替代卡（拿「車上供述」代替「逮捕報告」連「巡邏車錄影」），
 * 玩家手上沒有原本那張時，發現卡寫出了內部代號「arrest-report」。發現卡要寫玩家真的放上去的那張。
 */
const desk = {
  hours: 16,
  timeline: [],
  spent: 2,
  marked: [],
  readDocs: [],
  jobs: [],
  mail: [],
  openMail: [],
  link: { cards: [], relation: null },
  found: ['l-no-warning'],
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

test('發現卡寫玩家放上去的替代卡，不寫內部代號', async ({ page }, info) => {
  // 發現清單在桌機常駐證據欄；手機收在抽屜裡，卡名來自同一段程式。
  test.skip(info.project.name !== 'desktop', '桌機看證據欄');
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
          scene: 9,
          step: 0,
          choices: {},
          cards: ['ethan-accused', 'indictment', 'car-statement', 'no-warning', 'miranda-form'],
          flags: [],
          ethics: [],
          scenes: { pretrial: desk },
        },
      }),
    );
  }, desk);
  await page.reload();
  await page
    .getByRole('button', { name: /^繼續/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
  const pairs = page.locator('.found-pair');
  await expect(pairs.first()).toBeAttached();
  const text = (await pairs.allTextContents()).join('\n');
  expect(text).not.toMatch(/[a-z]+-[a-z]+/);
  expect(text).toContain('巡邏車錄影');
  expect(text).toContain('警車上的供述');
  expect(text).not.toContain('逮捕報告');
});
