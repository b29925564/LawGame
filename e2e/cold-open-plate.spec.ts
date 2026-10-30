/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 冷開場 22:49 的定場鏡頭（RD-ART-0505，31 樓財務長辦公室）：手機戲裡的一格，接法和其他有底圖的場一樣——
 * 先定場（圖＋左下場記，圖沒解碼完純黑），再把那一格的字當旁白字幕放在同一張圖上。
 * 冷開場整段沒有黃（設定集 11.5）：場記的短槓是灰的、主按鈕是白框。
 * 淺色主題也一樣是夜：手機外面是鏡頭層的黑（設計師 v93 審查）。
 */
const STEP_DOOR = 9;
const STEP_2249 = 10;

async function open(page: Page, step: number, lang: 'zh' | 'en' = 'zh') {
  await page.goto('/');
  await page.evaluate(
    ([step, lang]) => {
      localStorage.setItem('lawgame-lang', lang as string);
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
            choices: { 'cold-open': { 3: 0, 6: 1 } },
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [step, lang] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

const tickColor = (page: Page) =>
  page.locator('.place-slate').evaluate((e) => getComputedStyle(e, '::before').backgroundColor);

for (const lang of ['zh', 'en'] as const)
  test(`22:49 是 31 樓的底圖：定場場記讀燈組、沒有黃，之後旁白一句一張字幕（${lang}）`, async ({
    page,
  }, info) => {
    await open(page, STEP_2249, lang);
    const plate = page.locator('.plate-host .scene-plate');
    await expect(plate).toHaveAttribute('data-plate', '31f-2249');
    await expect(plate).toHaveAttribute('data-rig', 'ep1-31f-fri');
    await expect(plate).toHaveAttribute('data-kelvin', '4100');
    await expect(plate).toHaveAttribute('data-state', 'ok');
    const phone = info.project.name === 'chromium';
    await expect(plate.locator('.plate-bg')).toHaveAttribute('src', phone ? /phone/ : /desktop/);

    const slate = page.locator('.place-slate');
    await expect(slate).toBeVisible();
    await expect(slate).toContainText(lang === 'zh' ? '財務長辦公室' : "CFO's office");
    await expect(slate).toContainText('22:49');
    await expect(slate).toContainText('4100K');
    await expect(page.locator('.place-tbd')).toHaveCount(0);
    // 冷開場沒有黃：短槓是場記灰（--cine-muted），畫面的手還是冷開場（字卡不把黃還給主按鈕）。
    expect(await tickColor(page)).toBe('rgb(139, 149, 163)');
    await expect(page.locator('html')).toHaveAttribute('data-hand', 'coldopen');

    // 切進那一格：同一張圖（不黑一下），字幕卡在下三分之一，一張一句。
    await page.locator('.place-beat').click();
    const card = page.locator('.scene.plated > .sub-card.narration');
    await expect(card).toBeVisible();
    await expect(plate).toHaveAttribute('data-state', 'ok');
    await expect(card).toContainText(lang === 'zh' ? '沃斯倒在辦公桌旁的地毯上。' : 'Voss is on');
    const view = page.viewportSize()!;
    expect((await card.boundingBox())!.y / view.height).toBeGreaterThan(0.5);
    const next = page.locator('.scene.plated .sub-actions .primary');
    // 主按鈕是白框（冷開場不出現黃），不是螢光筆黃。
    await page.mouse.move(0, 0);
    const bg = await next.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toMatch(/rgb\((255, 208, 46|244, 197, 61)\)/);
    // 白框底下墊玻璃（和字幕框同一層），暗圖上讀得到：不是透明的。
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // 翻完這一格的卡，下一格（23:01 大廳閘門）沒有底圖：回到黑底字卡，圖收掉。
    const seen: string[] = [];
    for (let i = 0; i < 6 && (await card.count()); i++) {
      seen.push((await card.innerText()).trim());
      await next.click();
    }
    expect(seen.length).toBeGreaterThan(1);
    await expect(page.locator('.cine .cine-text')).toContainText(
      lang === 'zh' ? '大廳閘門' : 'The lobby gate',
    );
    await expect(page.locator('.plate-host')).toHaveCount(0);
  });

test('等 31 樓的底圖時整格純黑：沒有場記，圖到了才放', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/31f-2249[^/]*\.jpg/, async (r) => {
    await gate;
    await r.continue();
  });
  await open(page, STEP_2249);
  await expect(page.locator('.place-beat.waiting')).toBeVisible();
  await expect(page.locator('.place-slate')).toHaveCount(0);
  expect(
    await page.locator('.place-beat').evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(0, 0, 0)');
  release();
  await expect(page.locator('.place-slate')).toBeVisible();
  await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-state', 'ok');
});

for (const scheme of ['light', 'dark'] as const)
  test(`冷開場在${scheme === 'light' ? '淺' : '深'}色主題也是夜：手機外面是鏡頭層的黑`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, STEP_DOOR);
    const stage = page.locator('.phone-stage');
    await expect(stage).toBeVisible();
    expect(await stage.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(6, 8, 11)');
    // 門口那一格是黑底：「推開門」的字是亮的（淺色主題的墨色字放在黑底上讀不到）。
    const door = page.getByRole('button', { name: '推開門' });
    expect(await door.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(231, 234, 238)');
  });
