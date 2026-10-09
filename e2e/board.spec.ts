import { expect, test, type Page } from '@playwright/test';

// 連錯（設計師 P1-8a）：不抖、不用紅。線沒釘住、鬆脫淡出，兩張卡退回原位；說明是盧卡斯的鉛筆字。
const CARDS = ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo'];
async function board(page: Page, reduced?: boolean) {
  await page.goto('/');
  await page.evaluate(
    ([cards, reduced]) => {
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
      if (reduced) localStorage.setItem('rd.a11y.reducedmotion', '1');
    },
    [CARDS, reduced] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
  // 手機版先看疑問清單，點第一題才看到連線台。
  const first = page.getByRole('button', { name: /^01 / });
  if (await first.isVisible()) await first.click();
  const links = page.locator('section.links');
  for (const name of ['財物清單', '心率紀錄']) {
    const side = page.locator('.card.mini').filter({ hasText: name }).first();
    if (await side.isVisible()) await side.locator('.mini-btn').click();
    else {
      await links.getByRole('button', { name: '放一張卡' }).first().click();
      await page.locator('.card-sheet button').filter({ hasText: name }).first().click();
    }
  }
  await expect(page.locator('.cork-focus.filled')).toHaveCount(2);
  await links.getByRole('radio', { name: /^支持/ }).click();
  return links;
}

for (const reduced of [false, true])
  test(`連錯：線沒釘住，兩張卡回原位，說明用鉛筆寫${reduced ? '（減少動態）' : ''}`, async ({
    page,
  }) => {
    const links = await board(page, reduced);
    const hours = page.locator('.hours');
    const before = Number(/\d+/.exec((await hours.getAttribute('aria-label')) ?? '')?.[0]);
    await links.getByRole('button', { name: '連起來' }).click();
    // 原因寫在「連起來」同一列的便條上：便條紙、鉛筆字，兩個主題同一色。
    const note = links.locator('.bench-foot .board-note');
    await expect(note).toContainText('連不起來');
    await expect(note).toHaveCSS('font-family', /LXGW WenKai TC/);
    await expect(note).toHaveCSS('color', 'rgb(52, 64, 79)');
    // 工時留在原地換成新值，不閃紅。
    await expect(hours).toHaveAttribute('aria-label', new RegExp(`剩餘工時 ${before - 1} `));
    await expect(hours.locator('.swap-old')).toHaveCount(0);
    await expect(hours.locator('.swap')).toHaveText(String(before - 1));
    // 卡回原位、連線台清空；沒有任何東西在抖。
    await expect(page.locator('.cork-focus.filled')).toHaveCount(0);
    await expect(page.locator('.cork.missing')).toHaveCount(0);
    await expect(links.getByRole('button', { name: '連起來' })).toBeDisabled();
    await expect(page.locator('.shake, .shake-rel')).toHaveCount(0);
    await expect(note).toBeVisible();
  });
