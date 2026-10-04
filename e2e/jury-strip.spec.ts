import { expect, test } from '@playwright/test';

/**
 * 法庭裡收起的陪審團條：一格一位，名字在空格或「・」換行。
 * 英文「Raymond Green」剛好塞滿一格；更長、中間沒地方換行的名字不能被隔壁那格蓋掉。
 */
const progress = {
  episode: 'ep2',
  scene: 17, // court-marisol
  step: 0,
  choices: {},
  cards: [],
  flags: [],
  ethics: [],
  scenes: {
    'voir-dire': {
      left: 0,
      asked: [],
      struck: [],
      theirs: [],
      excused: [],
      wrong: 0,
      seated: ['c-bus', 'c-actuary', 'c-logistics', 'c-nurse', 'c-student', 'c-night'],
    },
  },
};

test('陪審團條：長名字換行，不超出自己那一格', async ({ page }) => {
  await page.addInitScript(
    (save) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', save);
      localStorage.setItem('lawgame-lang', 'en');
    },
    JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  await page.locator('main button.primary').first().click();
  await page.locator('.jury.strip .panel-head .link').click();
  const names = page.locator('.jury.strip .juror .label > span:first-child');
  await expect(names.first()).toHaveText('Raymond Green');
  // 現有的名字照原本的地方換行：跟不准字中間斷的排法比，每個名字的行數一樣。
  const lines = () =>
    names.evaluateAll((els) =>
      els.map((el) => {
        const r = el.ownerDocument.createRange();
        r.selectNodeContents(el);
        return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
      }),
    );
  const now = await lines();
  const strict = await page.addStyleTag({
    content: '.jury.compact.strip .label { overflow-wrap: normal !important; }',
  });
  expect(await lines()).toEqual(now);
  await strict.evaluate((el) => el.remove());
  // 一個比格子寬、中間沒有空格可以換行的名字（測試用，劇本裡沒有）。
  await names.first().evaluate((el) => (el.textContent = 'Raymond Wolfeschlegelstein'));
  const fit = await names
    .first()
    .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
});
