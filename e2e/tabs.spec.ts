/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// 分頁列放不下（第一道關卡 N2）：手機英文第 2 集審前，原本最右邊只露出「Dis」，看不出還有一格。
// 現在一列、不換行、不半露：放不下的收進「更多」。列上的順序不跟著選的那頁變（設計師 r8），
// 選了選單裡的一頁，「更多」那一格就寫那一頁的名字。
async function pretrial(page: Page, lang: 'zh' | 'en') {
  await page.goto('/');
  await page.evaluate((lang) => {
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep2',
          scene: 10,
          step: 0,
          choices: {},
          cards: [],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
    if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
  }, lang);
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  return page.getByRole('navigation', { name: /應用程式|Apps/ });
}

/** 列上每一格都整格在分頁列裡面。 */
const cut = (page: Page) =>
  page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('nav.apps')!;
    const n = nav.getBoundingClientRect();
    return [...nav.querySelectorAll<HTMLElement>(':scope > button:not(.measure)')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.left < n.left - 1 || r.right > n.right + 1;
      })
      .map((b) => b.innerText);
  });

for (const [lang, width] of [
  ['en', 412],
  ['zh', 360],
] as const)
  test(`分頁列放不下就收進「更多」，不半露（${lang} ${width}px）`, async ({ page, isMobile }) => {
    test.skip(!isMobile, '手機才放不下');
    await page.setViewportSize({ width, height: 800 });
    const nav = await pretrial(page, lang);
    const more = nav.getByRole('button', { name: /^(更多|More)/ });
    await expect(more).toBeVisible();
    expect(await cut(page)).toEqual([]);
    const row = () => nav.locator(':scope > button[data-key]').allInnerTexts();
    const before = await row();
    const slot = await more.evaluate((b) => b.getBoundingClientRect().width);
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await nav.getByRole('button', { name: /^(開示|Discovery)/ }).click();
    // 選了收起來的那格：「更多」那一格寫它的名字、畫底線，列上其他分頁不動，這一格也不變寬。
    await expect(more).toHaveAttribute('aria-current', 'true');
    await expect(more).toHaveText(/^(開示|Discovery)/);
    await expect(more).toHaveAccessibleName(/^(更多：開示|More: Discovery)/);
    await expect(nav.locator('.apps-menu')).toHaveCount(0);
    expect(await row()).toEqual(before);
    expect(await more.evaluate((b) => b.getBoundingClientRect().width)).toBeCloseTo(slot, 0);
    expect(await cut(page)).toEqual([]);
    // 選回列上的分頁，「更多」又寫回「更多」。
    await nav.locator(':scope > button[data-key]').first().click();
    await expect(more).toHaveText(/^(更多|More)/);
    expect(await row()).toEqual(before);
    // Esc 收起選單，焦點回到「更多」。
    await more.click();
    await page.keyboard.press('Escape');
    await expect(nav.locator('.apps-menu')).toHaveCount(0);
    await expect(more).toBeFocused();
  });

test('放得下的時候沒有「更多」', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = await pretrial(page, 'en');
  await expect(nav.getByRole('button', { name: /^More/ })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /^Discovery/ })).toBeVisible();
});

// 「證據板」是玩家最常回去的一頁：每種寬度都留在列上，不收進「更多」（設計師 #246 r9）。
for (const lang of ['zh', 'en'] as const)
  test(`最窄 320px 也看得到「證據板」（${lang}）`, async ({ page, isMobile }) => {
    test.skip(!isMobile, '手機才放不下');
    await page.setViewportSize({ width: 320, height: 800 });
    const nav = await pretrial(page, lang);
    await expect(
      nav.locator(':scope > button[data-key]', { hasText: /^(證據板|Board)$/ }),
    ).toBeVisible();
    expect(await cut(page)).toEqual([]);
  });
