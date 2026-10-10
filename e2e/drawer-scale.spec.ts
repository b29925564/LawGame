/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

// 字級 140%（設定的上限）時，手機的證據抽屜：三個分頁（含「法典」）完整看得到，「關閉」不蓋住分頁。
for (const lang of ['zh-TW', 'en']) {
  test(`字級 140%：抽屜分頁列放得下、不被「關閉」擋住（${lang}）`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((lang) => {
      localStorage.setItem('lawgame-lang', lang);
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
    }, lang);
    await page.reload();
    await page
      .getByRole('button', { name: /^(繼續|Continue)/ })
      .first()
      .click();
    const beat = page.locator('.place-beat');
    await page.waitForTimeout(300);
    if (await beat.count()) await beat.click();
    const tab = page.locator('.evidence-tab');
    test.skip((await tab.count()) === 0, '桌機的抽屜一直開著，沒有「關閉」');
    await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '1.4'));
    await tab.click();
    const tabs = page.locator('.sheet-tabs');
    await expect(tabs).toBeVisible();
    const buttons = await tabs.locator('button').all();
    expect(buttons.length).toBe(3);
    const close = (await page.locator('.sheet > .panel-head > .link').boundingBox())!;
    const bar = (await tabs.boundingBox())!;
    // 分頁列不用左右捲就放得下，最後一個分頁完整落在分頁列裡。
    expect(await tabs.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    const last = (await buttons[2].boundingBox())!;
    expect(last.x + last.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
    // 「關閉」和任何一個分頁都不重疊。
    for (const b of buttons) {
      const r = (await b.boundingBox())!;
      const overlap =
        r.x < close.x + close.width &&
        close.x < r.x + r.width &&
        r.y < close.y + close.height &&
        close.y < r.y + r.height;
      expect(overlap).toBe(false);
    }
    // 「關閉」的觸控區至少 44px。
    expect(close.height).toBeGreaterThanOrEqual(44);
    expect(close.width).toBeGreaterThanOrEqual(44);
    // 點得到「法典」。
    await buttons[2].click();
    await expect(buttons[2]).toHaveAttribute('aria-current', 'true');
  });
}
