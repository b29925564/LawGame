import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 鏡頭條在異議那一拍裡不動（設計師 #247 第一輪）：一刀黑、法官席、落章、證人回答都在鏡頭條裡剪，
 * 鏡頭條本身的 top 在窗開、按下理由之後的每個時間點都一樣。存檔停在柯瓦斯基主詰問開頭：
 * 第一題沒有該提的異議（提了就駁回），第二題是誘導（成立）。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

async function tops(page: Page, ms: number) {
  const cam = page.locator('.court-cam.strip');
  const out: number[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    out.push(await cam.evaluate((e) => Math.round(e.getBoundingClientRect().top)));
    await page.waitForTimeout(80);
  }
  return out;
}

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1530, 860],
] as const)
  test(`鏡頭條在異議那一拍裡不動（${width}×${height}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '鏡頭條只在桌機');
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (s) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
      },
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^繼續（/ })
      .first()
      .click();
    const open = page.getByRole('button', { name: '開庭' });
    await open.or(page.locator('.court-cam.strip')).first().waitFor();
    if (await open.isVisible()) await open.click();
    const cam = page.locator('.court-cam.strip');
    await expect(cam).toBeVisible();
    const next = page.getByRole('button', { name: '聽下一個問題' });
    const reason = page.locator('section.objection .row button').first();
    const seen: number[] = await tops(page, 200);
    for (let round = 0; round < 2; round++) {
      await next.click();
      await expect(reason).toBeVisible();
      seen.push(...(await tops(page, 200)));
      await reason.click();
      // 一刀黑 → 法官席 → 落章 → 法官 → 切回證人 → 證人回答，到主按鈕回來為止。
      seen.push(...(await tops(page, 3600)));
      await expect(next).toBeVisible();
    }
    expect(new Set(seen).size, `top 出現過：${[...new Set(seen)].join(', ')}`).toBe(1);
  });

/** 異議理由按鈕兩列都是 44px：英文和中文同一個字級，最長的理由也只斷兩行（設計師 #247 第三輪）。 */
for (const lang of ['zh', 'en'] as const)
  for (const width of [1366, 1530, 1920] as const)
    test(`異議理由按鈕都是 44px 高（${lang}・${width}）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', '只量桌機');
      await page.setViewportSize({
        width,
        height: width === 1366 ? 768 : width === 1530 ? 860 : 1080,
      });
      await page.addInitScript(
        ([s, lang]) => {
          if (sessionStorage.getItem('seeded')) return;
          sessionStorage.setItem('seeded', '1');
          localStorage.clear();
          localStorage.setItem('lawgame-ep-auto', s);
          if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
        },
        [
          JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
          lang,
        ] as const,
      );
      await page.goto('/');
      await page
        .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
        .first()
        .click();
      const cam = page.locator('.court-cam.strip');
      const open = page.getByRole('button', { name: lang === 'en' ? /^Go to court/ : '開庭' });
      await open.or(cam).first().waitFor();
      if (await open.isVisible()) await open.click();
      await page
        .getByRole('button', { name: lang === 'en' ? 'Hear the next question' : '聽下一個問題' })
        .click();
      const buttons = page.locator('section.objection:not([data-off]) .row button');
      await expect(buttons).toHaveCount(8);
      const heights = await buttons.evaluateAll((bs) =>
        bs.map((b) => Math.round(b.getBoundingClientRect().height)),
      );
      expect(heights).toEqual(Array(8).fill(44));
    });

/**
 * 關卡 2（第 13、14 條）：主詰問結束後，手機英文底列的三顆按鈕都在畫面裡；
 * 桌機交互詰問的工作欄至少 220px 高（陪審團收成一排之前只有 115px，論點卡被切在一行字的中間）。
 */
test('主詰問結束到交互詰問：底列不溢出、工作欄夠高', async ({ page }, info) => {
  const phone = info.project.name !== 'desktop';
  if (!phone) await page.setViewportSize({ width: 1530, height: 860 });
  await page.addInitScript(
    (s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
      localStorage.setItem('lawgame-lang', 'en');
      localStorage.setItem('lawgame-record-instant', '1');
    },
    JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  const open = page.getByRole('button', { name: /^Go to court/ });
  await open.or(page.locator('.record')).first().waitFor();
  if (await open.isVisible()) await open.click();
  const cross = page.getByRole('button', { name: 'Begin cross-examination' });
  for (let i = 0; i < 40 && !(await cross.isVisible()); i++) {
    const none = page.getByRole('button', { name: 'No objection' });
    if (await none.isVisible().catch(() => false)) {
      await none.click();
      continue;
    }
    await page
      .locator('button.primary.wide')
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  await expect(cross).toBeVisible();
  const vw = page.viewportSize()!.width;
  if (phone) {
    const box = (await cross.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    const primary = (await page.locator('.shell-foot button.primary.wide').boundingBox())!;
    expect(primary.height).toBeLessThan(80);
  }
  await cross.click();
  if (!phone) {
    await page.waitForTimeout(800);
    const h = await page.locator('.shell-body').evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(220);
  }
});
