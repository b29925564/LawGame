/// <reference lib="dom" />
import { devices, expect, test, type Page } from '@playwright/test';

/**
 * 片頭的底圖不能放大超過原解析度（v93 設計師判定第 46 行：裝置像素寬 × 最大倍數 ≤ 底圖寬；
 * 體驗評測 v94 預檢擋件 2）。目標裝置 1440 @2x（2880×1800）和 Pixel 7（視覺設計師 #2 11-13）。
 * 每個鏡頭把動態停住、從頭到尾取幾個點，量畫面上每張圖「一個原圖像素佔幾個裝置像素」，最大不能超過 1。
 */
const SHOTS = [
  ['paper', 10000],
  ['blind', 7000],
  ['court', 6000],
  ['witness', 6000],
  ['lucas', 5000],
] as const;

async function open(page: Page) {
  await page.clock.install({ time: 1_800_000_000_000 });
  await page.clock.pauseAt(1_800_000_000_000 + 1000);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem('rd.dev.intro', '1');
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep1',
          scene: 1,
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
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

/** 停住這個鏡頭的所有動態，取 0／¼／½／¾／終點，回傳每張圖最大的「裝置像素 ÷ 原圖像素」。 */
const worst = (page: Page) =>
  page.locator('.title-intro').evaluate(async (root) => {
    const size = new Map<string, [number, number]>();
    const natural = async (src: string) => {
      if (!size.has(src)) {
        const i = new Image();
        i.src = src;
        await i.decode();
        size.set(src, [i.naturalWidth, i.naturalHeight]);
      }
      return size.get(src)!;
    };
    const anims = document.getAnimations();
    anims.forEach((a) => a.pause());
    const dpr = devicePixelRatio;
    const out: Record<string, number> = {};
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      for (const a of anims) {
        const end = Number(a.effect?.getComputedTiming().endTime) || 0;
        a.currentTime = Math.max(0, f * end - (f === 1 ? 1 : 0));
      }
      for (const el of root.querySelectorAll<HTMLImageElement | SVGImageElement>(
        '.ti-shot img, .ti-shot svg image',
      )) {
        const src = el instanceof HTMLImageElement ? el.currentSrc || el.src : el.href.baseVal;
        const [nw, nh] = await natural(src);
        const r = el.getBoundingClientRect();
        // object-fit: cover／fill 和 SVG slice 都是「蓋滿」：較大的那一邊就是放大倍數。
        const s = Math.max(r.width / nw, r.height / nh) * dpr;
        const name = src
          .split('/')
          .pop()!
          .replace(/-[\w-]{8}\.(avif|webp|png)$/, '');
        out[name] = Math.max(out[name] ?? 0, Math.round(s * 1000) / 1000);
      }
    }
    return out;
  });

for (const [label, use] of [
  ['1440 @2x', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  // 手機看 Pixel 7 的整個螢幕高度（全螢幕／加到主畫面時沒有網址列），比瀏覽器裡的 839 高更嚴。
  [
    'Pixel 7',
    {
      userAgent: devices['Pixel 7'].userAgent,
      deviceScaleFactor: devices['Pixel 7'].deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      viewport: { width: 412, height: 915 },
    },
  ],
] as const)
  test.describe(label, () => {
    test.use(use);
    test(`片頭每個鏡頭的底圖都沒有放大超過原解析度（${label}）`, async ({ page }, info) => {
      // 裝置在這裡指定，兩個 project 跑一次就好。
      test.skip(info.project.name !== 'desktop');
      test.setTimeout(60_000);
      await open(page);
      const main = page.locator('.title-intro');
      await expect(main).toHaveAttribute('data-shot', 'paper');
      await expect(page.locator('.ti-paper svg')).toBeVisible({ timeout: 15_000 });
      const over: string[] = [];
      for (let i = 0; i < SHOTS.length; i++) {
        if (i) await page.clock.runFor(SHOTS[i - 1][1]);
        await expect(main).toHaveAttribute('data-shot', SHOTS[i][0]);
        await expect(page.locator('.ti-shot')).toBeAttached();
        const m = await worst(page);
        expect(Object.keys(m).length, SHOTS[i][0]).toBeGreaterThan(0);
        for (const [k, s] of Object.entries(m))
          if (s > 1.005) over.push(`${SHOTS[i][0]} ${k} ×${s}`);
        // 下一個鏡頭照常計時：動態放回去。
        await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
      }
      expect(over).toEqual([]);
    });
  });
