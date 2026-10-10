/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// 分頁列放不下（第一道關卡 N2）：手機英文第 2 集審前，原本最右邊只露出「Dis」，看不出還有一格。
// 現在一列、不換行、不半露：放不下的收進「更多」，選中的那格一定在列上。
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
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await nav.getByRole('button', { name: /^(開示|Discovery)/ }).click();
    // 選了收起來的那格：它回到列上、是選中的那格，選單收起來。
    await expect(nav.getByRole('button', { name: /^(開示|Discovery)/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(nav.locator('.apps-menu')).toHaveCount(0);
    expect(await cut(page)).toEqual([]);
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
