/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 盧卡斯的頭像照「臉」置中，不是照頭髮（使用者 11-13：第一集他剛出場的頭貼是偏的）。
 * 立繪包全組照頭部輪廓對齊（頭部中心 x=45.6%），可是他多半側四分之三，臉在 35～42%；
 * 照輪廓置中的話，臉會偏左 6～15% 格寬。每張圖臉的中心量在 lucas.yaml 的 face_cx。
 */
const yaml = readFileSync(new URL('../src/ui/cast/lucas/lucas.yaml', import.meta.url), 'utf8');
const faceX: Record<string, number> = Object.fromEntries(
  /^face_cx:\s*\{([^}]*)\}/m
    .exec(yaml)![1]
    .split(',')
    .map((kv) => kv.split(':').map((s) => s.trim()))
    .map(([k, v]) => [k.replace(' ', '__'), +v / 100]),
);

test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0')));

/** 第一集第一幕（大廳，週一 08:00），盧卡斯第一句「謝謝。這個我很擅長。」。 */
async function open(page: Page, lang: 'zh' | 'en') {
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
          scene: 2,
          step: 3,
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
  // 定場以後才有台詞。
  const face = page.locator('.speech .portrait.art img').last();
  for (let i = 0; i < 4 && !(await face.isVisible()); i++) {
    const go = page.locator('button.primary:visible').first();
    if (await go.count()) await go.click();
    await page.waitForTimeout(400);
  }
  await expect(face).toBeVisible();
  await expect(face).toHaveJSProperty('complete', true);
  return face;
}

for (const lang of ['zh', 'en'] as const)
  test(`盧卡斯剛出場的對白頭像：臉在格子正中間（${lang}）`, async ({ page }) => {
    const face = await open(page, lang);
    const m = await face.evaluate((img: HTMLImageElement) => {
      const box = img.parentElement!.getBoundingClientRect();
      const r = img.getBoundingClientRect();
      return {
        src: img.currentSrc,
        box: [box.x, box.width],
        img: [r.x, r.width, r.y, r.height, box.y, box.height],
      };
    });
    const key = /lucas__F__(.+?__v\d+)/.exec(m.src)![1];
    expect(faceX[key], key).toBeTruthy();
    const [bx, bw] = m.box;
    const [ix, iw, iy, ih, by, bh] = m.img;
    // 臉的中心落在格子中線 ±1px。
    expect(Math.abs(ix + iw * faceX[key] - (bx + bw / 2)), key).toBeLessThan(1);
    // 圖蓋滿格子：左右都不露出邊（去背圖露邊會看到切線）、上面留 3%。
    expect(ix).toBeLessThanOrEqual(bx + 0.5);
    expect(ix + iw).toBeGreaterThanOrEqual(bx + bw - 0.5);
    expect(iy + ih).toBeGreaterThan(by + bh);
  });

/**
 * 寬螢幕左下角的盧卡斯大立繪（≥1360）：立繪包的右肩碰到圖的右緣（4:5 裁切），露出來就是一條直的切邊
 * （體驗評測 5ad27e3：原本用遮罩淡掉，看得到灰糊的一條邊）。碰到右緣的那一段要整個在畫面下緣以下。
 */
for (const [w, h] of [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
] as const)
  test(`盧卡斯大立繪：右肩的裁切邊不在畫面裡（${w}×${h}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '寬螢幕才有');
    await page.setViewportSize({ width: w, height: h });
    await open(page, 'zh');
    const img = page.locator('.lucas-stage img.on');
    await expect(img).toBeVisible();
    await expect(img).toHaveJSProperty('complete', true);
    const m = await img.evaluate(async (el: HTMLImageElement) => {
      // 用原圖量：右緣那一欄從哪一列開始不透明。
      const src = new Image();
      src.src = el.currentSrc;
      await src.decode();
      const c = document.createElement('canvas');
      c.width = src.naturalWidth;
      c.height = src.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(src, 0, 0);
      const col = g.getImageData(c.width - 1, 0, 1, c.height).data;
      let y = 0;
      while (y < c.height && col[y * 4 + 3] <= 20) y++;
      const r = el.getBoundingClientRect();
      return {
        edge: r.top + (y / c.height) * r.height,
        h: innerHeight,
        mask: getComputedStyle(el.parentElement!).maskImage,
      };
    });
    expect(m.edge, JSON.stringify(m)).toBeGreaterThanOrEqual(m.h);
  });
