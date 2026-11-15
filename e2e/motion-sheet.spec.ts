import { expect, test } from '@playwright/test';

/**
 * 1366 寬（useWide 但證據欄沒常駐）在聲請狀上出示證物（Issue #360）：點「點這裡出示證物」打開挑卡片抽屜、
 * 點一張卡，抽屜要收起來、證物格要填上那張卡，三格都填好才出現「遞狀」。
 * 舊版：小選單「點別的地方就收」的 pointerdown 把抽屜當成「別的地方」，按下去那一刻抽屜就關了，click 落空，格子沒填上，玩家卡關。
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
  confirmed: ['q2a'],
  submissions: 1,
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
  'watch-photo',
];

for (const [w, h] of [
  [1366, 768],
  [1280, 800],
] as const)
  test(`${w}×${h}：聲請狀從抽屜出示證物，格子填上、出現「遞狀」`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.evaluate(
      ([d, cards]) => {
        localStorage.setItem('lawgame-lang', 'zh');
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
              scenes: { investigate: d },
            },
          }),
        );
      },
      [desk, CARDS] as const,
    );
    await page.reload();
    await page.getByRole('button', { name: /^繼續/ }).first().click();
    const beat = page.locator('.place-beat');
    await page.waitForTimeout(300);
    if (await beat.count()) await beat.click();
    await page
      .getByRole('button', { name: /^法院系統/ })
      .first()
      .click();
    const paper = page.locator('article.plead');
    await paper.getByRole('button', { name: '點這裡選請求' }).click();
    await page.getByRole('option', { name: '核發傳票給手錶廠商', exact: true }).click();
    await paper.getByRole('button', { name: '點這裡選依據' }).click();
    await page.getByRole('option', { name: '相關性', exact: true }).click();
    // 這個寬度證據欄沒常駐：證物從抽屜挑。
    await paper.getByRole('button', { name: '點這裡出示證物' }).click();
    const sheet = page.locator('.card-sheet');
    await expect(sheet).toBeVisible();
    await sheet.locator('.pick-name', { hasText: '財物清單：智慧手錶' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(
      paper.getByRole('button', { name: /^證物 .+：財物清單：智慧手錶$/ }),
    ).toBeVisible();
    await expect(paper.getByRole('button', { name: /遞狀/ })).toBeVisible();
  });
