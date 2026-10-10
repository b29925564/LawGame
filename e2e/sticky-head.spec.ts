/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

const CARDS = [
  'ethan-accused',
  'ethan-ride',
  'ethan-message',
  'ethan-flee',
  'ethan-report',
  'ethan-trophy',
  'indictment',
  'arrest-time',
  'car-statement',
  'miranda-form',
  'watch-listed',
  'access-partial',
  'access-full',
  'autopsy',
  'watch-photo',
  'sophie-home',
  'parking-log',
  'jade-alibi',
  'blood-report',
  'ride-receipt',
];

// 第二道關卡第 7 條：手機證據抽屜捲動時，黏頂的分組小標上方不透出捲過去的卡片。
test('抽屜的分組小標黏頂時，上方沒有卡片透出來', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 });
  await page.goto('/');
  await page.evaluate((cards) => {
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
          scenes: {},
        },
      }),
    );
  }, CARDS);
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  const tab = page.locator('.evidence-tab');
  test.skip((await tab.count()) === 0, '桌機的抽屜不是手機那一種');
  await tab.click();
  await page.waitForTimeout(500);
  const heads = page.locator('.sheet-list .group-head');
  expect(await heads.count()).toBeGreaterThan(1);
  // 捲到第二個小標已經黏頂：第一組的卡從它上面經過（外距那一段不畫底色時，字會從小標上方透出來）。
  const stuck = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.sheet-list')!;
    const head = document.querySelectorAll<HTMLElement>('.sheet-list .group-head')[1];
    list.scrollTop = list.scrollHeight;
    const r = head.getBoundingClientRect();
    return { top: list.getBoundingClientRect().top, headTop: r.top, x: r.left + 20 };
  });
  // 黏頂時小標往上多蓋 2px（超出捲動框的那段被裁掉），上緣沒有縫。
  expect(stuck.headTop).toBeLessThanOrEqual(stuck.top - 1.5);
  expect(stuck.headTop).toBeGreaterThanOrEqual(stuck.top - 2.5);
  const hit = await page.evaluate(
    ({ x, y }) => {
      const e = document.elementFromPoint(x, y);
      return e?.closest('.group-head') ? 'head' : (e?.className ?? 'none');
    },
    { x: stuck.x, y: stuck.top + 1 },
  );
  expect(hit).toBe('head');
});
