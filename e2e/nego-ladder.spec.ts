import { expect, test } from '@playwright/test';

/**
 * 第 2 集調解的條件階梯：目前這一檔的「超過授權」前面有一顆紅點。
 * 紅點不能把字往右推：每一列的「超過授權」要從同一條線開始（遊戲測試員 v90：英文差了 13px）。
 */
const progress = {
  episode: 'ep2',
  scene: 12, // mediation
  step: 0,
  choices: {},
  cards: [],
  flags: [],
  ethics: [],
  scenes: {},
};

for (const lang of ['zh', 'en'] as const)
  test(`調解條件階梯：每一列的超過授權對齊（${lang}）`, async ({ page }) => {
    await page.addInitScript(
      ([save, lang]) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', save);
        if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
      },
      [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }), lang],
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
      .first()
      .click();
    await page.locator('button.primary.next').click();
    const ladder = page.locator('.nego-ladder');
    await expect(ladder.locator('li.on .tg em')).toBeVisible();
    // 每一個「超過授權」文字本身（不含紅點）的左緣。
    const lefts = await ladder.evaluate((ol) =>
      [...ol.querySelectorAll('.tg em')].map((em) => {
        const r = ol.ownerDocument.createRange();
        r.selectNodeContents(em);
        return r.getBoundingClientRect().left;
      }),
    );
    // 信心 85：400 萬（目前）、250 萬、180 萬三檔都超過 150 萬授權。
    expect(lefts).toHaveLength(3);
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1);
  });
