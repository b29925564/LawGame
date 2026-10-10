import { expect, test, type Page } from '@playwright/test';

// 第二道關卡第 8 條：字級設定要整個介面一起跟著走。滑桿到 150%；開關的字不比下面那行說明小；
// 選單分頁、語言切換、電影旁白都跟著放大；放大後選單不橫向溢出。
async function open(page: Page, lang: 'zh' | 'en', step = 0) {
  await page.goto('/');
  await page.evaluate(
    ([lang, step]) => {
      localStorage.setItem('lawgame-lang', lang);
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene: 0,
            step,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [lang, step] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
}

const px = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

for (const lang of ['zh', 'en'] as const)
  test(`字級 150%：選單、開關、語言切換、電影旁白一起放大（${lang}）`, async ({ page }) => {
    await open(page, lang);
    const cine = await px(page, '.cine-text');
    await page.getByRole('button', { name: /^(選單|Menu)$/ }).click();
    await page.getByRole('tab', { name: /^(選項|Options)$/ }).click();
    const slider = page.locator('.settings input[type=range]').first();
    expect(await slider.getAttribute('max')).toBe('1.5');
    const small0 = await px(page, '.settings .toggle small');
    const tab0 = await px(page, '.menu-panel [role=tab]');
    await slider.fill('1.5');
    await expect(slider).toHaveAttribute('aria-valuetext', '150%');
    // 滑桿右邊看得見現在的值，和音量那幾條一樣。
    await expect(page.locator('.settings .scale-row output')).toHaveText('150%');
    // 開關的字比下面那行說明大。
    const toggle = await px(page, '.settings .toggle:has(small)');
    const small = await px(page, '.settings .toggle small');
    expect(small).toBeCloseTo(small0 * 1.5, 0);
    expect(toggle).toBeGreaterThan(small);
    // 選單分頁、語言切換跟著放大，選單沒有橫向溢出。
    expect(await px(page, '.menu-panel [role=tab]')).toBeCloseTo(tab0 * 1.5, 0);
    expect(await px(page, '.lang-switch button')).toBeCloseTo(13 * 1.5, 0);
    const over = await page
      .locator('.menu-panel')
      .evaluate((e) => [
        e.scrollWidth - e.clientWidth,
        e.querySelector('.row')!.scrollWidth - e.querySelector('.row')!.clientWidth,
      ]);
    expect(over).toEqual([0, 0]);
    // 電影旁白（冷開場字卡）。
    await page.keyboard.press('Escape');
    expect(await px(page, '.cine-text')).toBeCloseTo(cine * 1.5, 0);
  });
