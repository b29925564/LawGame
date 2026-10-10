/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

// #265 審查：畫面上的英文是彎引號，法典搜尋打直引號、彎引號都要找得到。
test('法典搜尋：直引號與彎引號都找得到（英文）', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('lawgame-lang', 'en');
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
          cards: [],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  });
  await page.reload();
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  const tab = page.locator('.evidence-tab');
  if (await tab.count()) await tab.click();
  await page.getByRole('button', { name: 'Legal terms' }).click();
  const find = page.getByRole('searchbox', { name: /Find/i });
  // 「can't be cross-examined」在畫面上是 can’t；直的、彎的都搜得到。
  const hearsay = page.locator('.term', { hasText: 'cross-examined' });
  await expect(hearsay.first()).toContainText('can’t be cross-examined');
  for (const q of ["can't be cross", 'can’t be cross']) {
    await find.fill(q);
    await expect(page.locator('.term').filter({ hasText: 'cross-examined' }).first()).toBeVisible();
    await expect(page.locator('.term').first()).toContainText('cross-examined');
  }
  await find.fill("can't zzz");
  await expect(page.locator('.term')).toHaveCount(0);
});
