/// <reference lib="dom" />
import { expect, test, type ElementHandle, type Page } from '@playwright/test';

/**
 * 桌機矮螢幕的證據板（Issue #354，設計師裁定 C）：板子比中欄可見高度高，答案列不釘底，照順序排在發現下面；
 * 連起來得到新發現時，中欄捲到「新發現＋第 3 步答案」都在畫面內（底緣淡出的 24 px 不算）。第一次連線前不捲。
 */
const CARDS = ['watch-notice', 'ride-receipt', 'ethan-message', 'indictment', 'ethan-ride'];

async function board(page: Page) {
  await page.goto('/');
  await page.evaluate((cards) => {
    localStorage.setItem('rd.dev.intro', '0');
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
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
}

/** 中欄（捲動框）的可見範圍，扣掉底緣淡出。 */
const inView = (el: ElementHandle<Element>) =>
  el.evaluate((e) => {
    const box = document.querySelector('.shell-body')!.getBoundingClientRect();
    const r = e.getBoundingClientRect();
    return { top: r.top - box.top, bottom: box.bottom - 24 - r.bottom };
  });

for (const [w, h] of [
  [1380, 768],
  [1366, 768],
] as const)
  test(`連起來得到新發現：中欄捲到發現和答案都看得到（${w}×${h}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '桌機中欄');
    await page.setViewportSize({ width: w, height: h });
    await board(page);
    const body = page.locator('.shell-body');
    // 第一次連線前不捲。
    await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBe(0);
    const links = page.locator('section.links');
    for (const name of ['手錶通知紀錄', '叫車收據']) {
      const side = page.locator('.card.mini').filter({ hasText: name }).first();
      if (await side.isVisible()) await side.locator('.mini-btn').click();
      else {
        await links
          .getByRole('button', { name: /點板上的卡|^放到 [AB]$/ })
          .first()
          .click();
        await page.locator('.card-sheet button').filter({ hasText: name }).first().click();
      }
    }
    await links.getByRole('radio', { name: /^支持/ }).click();
    await links.getByRole('button', { name: '連起來' }).click();
    await expect(page.locator('.found.fresh')).toBeVisible();
    // .fresh 只留 600 ms（Desk.tsx useBump）：CI 慢的時候等捲動停下來就超過了，先抓住這張發現本身再量。
    const fresh = (await page.locator('.found.fresh').first().elementHandle())!;
    // 捲動停下來以後量。
    await expect
      .poll(async () => {
        const a = await body.evaluate((e) => e.scrollTop);
        await page.waitForTimeout(150);
        return a === (await body.evaluate((e) => e.scrollTop)) && a > 0;
      })
      .toBe(true);
    const note = await inView(fresh);
    const bar = await inView((await page.locator('.answer-bar').first().elementHandle())!);
    expect(note.top, '新發現上緣在中欄裡').toBeGreaterThanOrEqual(0);
    expect(bar.bottom, '答案列底緣在淡出區上面').toBeGreaterThanOrEqual(-1);
  });
