import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { brightest } from './png';

/**
 * 進場等圖的時候，鏡頭條每一格都是純黑（設計師 #287 第三輪）：不出只剩剪影的黑格。
 * 圖檔請求延遲 2 秒（路由攔截不走快取，等於冷快取），進法庭後鏡頭條連拍：
 * 底圖沒載好之前，截圖裡一個亮點都沒有，頁面裡也沒有任何立牌是看得見的。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

for (const lang of ['zh', 'en'] as const)
  test(`進場等圖時鏡頭條純黑、不出剪影（${lang}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '鏡頭條只在桌機');
    await page.addInitScript(
      ([s, l]) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
        if (l === 'en') localStorage.setItem('lawgame-lang', 'en');
      },
      [
        JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
        lang,
      ] as const,
    );
    await page.route(/\/(witness|bench)-[^/]*\.(webp|avif)/, async (r) => {
      await new Promise((x) => setTimeout(x, 2000));
      await r.continue();
    });
    await page.goto('/');
    await page
      .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
      .first()
      .click();
    const open = page.getByRole('button', { name: lang === 'en' ? 'Go to court' : '開庭' });
    await open.or(page.locator('.court-cam.strip')).first().waitFor();
    if (await open.isVisible()) await open.click();
    const cam = page.locator('.court-cam.strip');
    await expect(cam).toBeVisible();
    // 頁面裡：每一格，看得見的立牌都要有已載好的底圖；底圖沒好之前鏡頭不是 witness／bench。
    await page.evaluate(() => {
      const w = window as unknown as { __bad: string[] };
      w.__bad = [];
      const tick = () => {
        const f = document.querySelector('.cam-frame');
        const shot = f?.getAttribute('data-shot');
        for (const layer of document.querySelectorAll('.cam-layer')) {
          const img = layer.querySelector<HTMLImageElement>('.cam-plate img');
          const loaded = !!img && img.complete && img.naturalWidth > 0;
          const pose = layer.querySelector('.cam-pose');
          if (pose && getComputedStyle(pose).visibility !== 'hidden' && !loaded)
            w.__bad.push('立牌看得見但底圖沒好');
        }
        if (shot && shot !== 'black') {
          const on = f?.querySelector(
            '.cam-stage[data-on] .cam-plate img',
          ) as HTMLImageElement | null;
          if (on && !(on.complete && on.naturalWidth > 0)) w.__bad.push(`${shot} 但底圖沒好`);
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    // 圖要 2 秒才到：前 1.4 秒內連拍，每一張都是純黑。
    const t0 = Date.now();
    const maxes: number[] = [];
    while (Date.now() - t0 < 1400) {
      const shot = await cam.screenshot();
      if (process.env.DBG)
        (await import('node:fs')).writeFileSync(`/tmp/e2e-dbg-${maxes.length}.png`, shot);
      maxes.push(brightest(shot));
      await page.waitForTimeout(150);
    }
    expect(maxes.length).toBeGreaterThan(2);
    expect(Math.max(...maxes)).toBeLessThanOrEqual(3);
    // 圖到了以後鏡頭才出現。
    await expect(page.locator('.cam-frame')).toHaveAttribute('data-shot', 'witness', {
      timeout: 6000,
    });
    expect(await page.evaluate(() => (window as unknown as { __bad: string[] }).__bad)).toEqual([]);
  });
