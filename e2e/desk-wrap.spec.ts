import { expect, test, type Page } from '@playwright/test';

/**
 * 調查桌的兩個「不公平」（Issue #350，原草稿 #210 的 C4、C6）：
 * 雙擊「結束調查」不能直接定案（第二下落在定案鈕上，結束調查不能復原）；
 * 連錯的一組連按兩下只扣 1 工時。
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
  link: { cards: [] as string[], relation: null as string | null },
  found: [],
  badLinks: 0,
  linkNote: null,
  attempts: {},
  confirmed: ['q1'],
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

/** 第一集調查（第 7 場），q1 已確認，所以「結束調查」在。 */
async function open(page: Page, extra: Partial<typeof desk> = {}) {
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
    [{ ...desk, ...extra }, CARDS] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
}

test('雙擊「結束調查」只換成定案鈕，不會直接結束調查', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '結束調查' }).dblclick();
  await expect(page.getByRole('button', { name: /^確定結束/ })).toBeVisible();
  await expect(page.locator('.scene.report')).toHaveCount(0);
  // 定案鈕照樣按得下去（等雙擊的那一下過去以後）。
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^確定結束/ }).click();
  await expect(page.getByRole('button', { name: /^確定結束/ })).toHaveCount(0);
});

test('連錯的一組連按兩下「連起來」，只扣 1 工時', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { link: { cards: ['sophie-home', 'ride-receipt'], relation: '矛盾' } });
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
  const hours = page.locator('.hours').first();
  await expect(hours).toHaveAttribute('aria-label', '剩餘工時 20 小時');
  await page.getByRole('button', { name: '連起來' }).dblclick();
  await expect(page.locator('.board-note')).toContainText('白花了 1 工時');
  await page.waitForTimeout(1200);
  await expect(hours).toHaveAttribute('aria-label', '剩餘工時 19 小時');
});

test('自己再拼回同一組連錯的線，「連起來」按不下去；換一種關係就可以（#358）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, {
    link: { cards: ['ride-receipt', 'sophie-home'], relation: '矛盾' },
    badLinks: 1,
    badTried: ['ride-receipt|sophie-home|矛盾'],
  } as Partial<typeof desk>);
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
  const connect = page.getByRole('button', { name: '連起來' });
  await expect(connect).toBeDisabled();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.getByRole('radio', { name: '支持' }).click();
  await expect(connect).toBeEnabled();
});
