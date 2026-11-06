import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 證人席立牌不露出肩膀的平切底邊（v93 關卡 1；設計師 2026-11-06）：卡面只畫到肩膀，卡底在原圖 y 645，
 * 黃銅欄杆的前景只擋到 589，前板的前景要到 y 800 才開始擋，中間那段淺色椅背上看得到一條平切線（鏡頭條上約 13 px）。
 * 剪影的軀幹往下補到前板後面：剪影最下緣要在原圖 0.75 以下（前景從 0.741 起一路擋到底）。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };
const witness = JSON.parse(
  readFileSync(new URL('../src/ui/court/cam/witness.json', import.meta.url), 'utf8'),
) as { crop239: number[] };

for (const [width, height] of [
  [1530, 860],
  [1366, 768],
  [1100, 860],
] as [number, number][])
  test(`證人席立牌的底邊藏在前板後面（${width}×${height}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '固定寬度');
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      ([s]) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
      },
      [
        JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
      ] as const,
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^繼續（/ })
      .first()
      .click();
    const open = page.getByRole('button', { name: '開庭' });
    await open.or(page.locator('.court-cam')).first().waitFor();
    if (await open.isVisible()) await open.click();
    const sil = page
      .locator('.cam-stage[data-cam="witness"] .cam-pose[data-on] .silhouette')
      .first();
    await expect(sil).toBeAttached();
    await page.waitForTimeout(1500);
    const m = await page.evaluate((crop) => {
      const stage = document.querySelector('.cam-stage[data-cam="witness"]')!;
      const frame = stage.closest('.cam-frame') ?? stage;
      const fr = frame.getBoundingClientRect();
      const c = crop;
      // 整張原圖在畫面上的大小與位置（桌機鏡頭條是 2.39 裁切）。
      const pw = fr.width / c[2];
      const ph = pw * (9 / 16);
      const top = fr.top - ph * c[1];
      const g = stage.querySelector('.cam-pose[data-on] .silhouette')!.getBoundingClientRect();
      return { bottom: +((g.bottom - top) / ph).toFixed(3) };
    }, witness.crop239);
    if (process.env.SHOTS)
      await page
        .locator('.court-cam')
        .first()
        .screenshot({
          path: `${process.env.SHOTS}/${process.env.SHOT_TAG ?? 'after'}-${width}-witness.png`,
        });
    expect(m.bottom, '剪影底邊露在欄杆和前板之間').toBeGreaterThanOrEqual(0.75);
  });
