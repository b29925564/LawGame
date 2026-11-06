import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 淺色主題下判決不白閃（第二道關卡 11-06）：法官席 → 切黑 → 裁決書 → 切黑 → 筆錄……都是鏡頭段，
 * 設定集說淺色主題的鏡頭層仍然是夜。四拍播完前整頁照深色解，到結論頁才回淺色：整段只暗一次、亮一次。
 * 選單鈕在鏡頭段是深色那款（第二道關卡「黑底鏡頭層上的選單鈕」）；回淺色前先切黑 --dur-cut-black，和離開冷開場同一套（設計師 11-06）。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep1' | 'ep2', { scenes: { closing: { verdict: string } } }>;

/** 整頁的平均亮度（0–255）：截圖交給瀏覽器解碼再算。 */
async function luma(page: Page) {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }, png);
}

/** 選單鈕的底色和字色亮度（0–255）。 */
async function menu(page: Page) {
  return page.locator('.menu-toggle').evaluate((b) => {
    const y = (c: string) => {
      const [r, g, bl] = c.match(/[\d.]+/g)!.map(Number);
      return 0.299 * r + 0.587 * g + 0.114 * bl;
    };
    const cs = getComputedStyle(b);
    return { bg: y(cs.backgroundColor), ink: y(cs.color) };
  });
}

for (const [ep, verdict] of [
  ['ep1', '有罪'],
  ['ep2', '有責'],
] as const)
  test(`淺色主題：${ep} 判決從法官席到四拍播完都是暗的，結論頁才回淺色`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    const progress = structuredClone(seeds[ep]);
    progress.scenes.closing.verdict = verdict;
    await page.addInitScript(
      (save) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', save);
      },
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }),
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^繼續（/ })
      .first()
      .click();

    const night = async (k: string) => {
      // 每一拍都是夜：平均亮度遠低於淺色頁（淺色頁約 232；裁決書在深色桌面上約 34／手機 61）。
      expect(await luma(page), k).toBeLessThan(96);
      const m = await menu(page);
      expect(m.bg, `${k} 選單鈕底`).toBeLessThan(60);
      expect(m.ink, `${k} 選單鈕字`).toBeGreaterThan(160);
    };
    await expect(page.locator('.vbench')).toHaveAttribute('data-phase', 'hold');
    await night('bench');
    await expect(page.locator('.vbench')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.vdict')).toHaveAttribute('data-stage', 'form');
    await night('form');
    await expect(page.locator('.vstage[data-phase="record"]')).toBeVisible({ timeout: 10_000 });
    await night('record');
    await expect(page.locator('.vstage[data-phase="light"]')).toBeVisible({ timeout: 10_000 });
    await night('light');

    // 窗光之後先切黑一格（--dur-cut-black），才是淺色的結論頁。
    const seen = await page.evaluate(
      () =>
        new Promise<{ end: number; done: number }>((ok) => {
          const v = document.querySelector('.vdict')!;
          const t: Record<string, number> = {};
          new MutationObserver(() => {
            const s = v.getAttribute('data-stage')!;
            if (!(s in t)) t[s] = performance.now();
            if (s === 'done') ok({ end: t.end ?? NaN, done: t.done });
          }).observe(v, { attributes: true });
        }),
    );
    expect(seen.done - seen.end).toBeGreaterThanOrEqual(83 - 20);
    expect(await luma(page)).toBeGreaterThan(180);
    const m = await menu(page);
    expect(m.bg).toBeGreaterThan(180);
  });
