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
