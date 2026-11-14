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
 * 寬螢幕左下角的盧卡斯大立繪（≥1360）。v94 以前立繪包的右肩碰到圖的右緣（4:5 裁切），露出來就是一條直的
 * 切邊（體驗評測 5ad27e3），只好整張往下藏。v95 場景光影 #3 把右肩補完（art/lucas-stage-v95），
 * 畫布四周留白：除了下緣，圖的上、左、右三邊都是全透明，框貼畫面底、半身全露出來。
 * 他的臉朝畫面左邊，所以放台詞欄右邊、看著台詞（設計師 #344，UI 規格 §16）。
 * 量：畫面上那張是立繪畫布（1256 或 628，不能是頭像的 512）；框裡看得到的三邊沒有不透明像素；人物左緣離台詞欄右緣 8px；
 * 右邊離畫面邊至少 24px；頭頂離「選單」鈕至少 8px；框的下緣就是畫面下緣。
 * v96 寬螢幕放大（設計師 gate 2 @0223ca5）：框本身也不進台詞欄；人物高（頭頂到畫面底）≤ 畫面高 45%；
 * 顯示寬 × devicePixelRatio ≤ 原圖 1256，不放大超過原圖。
 */
for (const [w, h, dpr] of [
  [1360, 768, 1],
  [1366, 768, 1],
  [1512, 900, 1],
  [1440, 900, 1],
  [1920, 1080, 1],
  [2560, 1440, 1],
  // 2560 @2x：人物照 (b) 會到 1256 × 0.51，裝置像素超過原圖，要被 (c) 壓回 1256。
  [2560, 1440, 2],
] as const)
  test(`盧卡斯大立繪：半身完整、沒有切邊（${w}×${h} @${dpr}x）`, async ({
    page: first,
    browser,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '寬螢幕才有');
    const ctx =
      dpr === 1
        ? undefined
        : await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = ctx ? await ctx.newPage() : first;
    await page.setViewportSize({ width: w, height: h });
    await open(page, 'zh');
    const img = page.locator('.lucas-stage img.on');
    await expect(img).toBeVisible();
    await expect(img).toHaveJSProperty('complete', true);
    const m = await img.evaluate(async (el: HTMLImageElement) => {
      const src = new Image();
      src.src = el.currentSrc;
      await src.decode();
      const c = document.createElement('canvas');
      c.width = src.naturalWidth;
      c.height = src.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(src, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      const a = (x: number, y: number) => data[(y * c.width + x) * 4 + 3];
      const r = el.getBoundingClientRect();
      const fig = el.parentElement!.getBoundingClientRect();
      // 框（figure，overflow: hidden）裡看得到的那一塊，換成畫布座標。
      const cx = (px: number) => Math.round(((px - r.left) / r.width) * c.width);
      const [fx0, fx1] = [Math.max(0, cx(fig.left)), Math.min(c.width - 1, cx(fig.right) - 1)];
      let edge = 0;
      for (let y = 0; y < c.height; y++) edge = Math.max(edge, a(fx0, y), a(fx1, y));
      for (let x = fx0; x <= fx1; x++) edge = Math.max(edge, a(x, 0));
      // 人物左右最外的不透明欄（alpha > 20）。
      let x0 = c.width;
      let x1 = 0;
      for (let y = 0; y < c.height; y += 2)
        for (let x = 0; x < c.width; x++)
          if (a(x, y) > 20) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
          }
      const col = document.querySelector('.scene.dialogue')!.getBoundingClientRect();
      // 人物最上面的不透明列（頭頂）。
      let y0 = 0;
      while (y0 < c.height && ![...Array(c.width).keys()].some((x) => a(x, y0) > 20)) y0++;
      const menu = [...document.querySelectorAll('button')].find((b) =>
        /^(選單|Menu)$/.test(b.textContent!.trim()),
      );
      return {
        natural: [c.width, c.height],
        edge,
        left: r.left + (x0 / c.width) * r.width,
        right: r.left + ((x1 + 1) / c.width) * r.width,
        bottom: r.bottom,
        figBottom: fig.bottom,
        figLeft: fig.left,
        figRight: fig.right,
        top: r.top + (y0 / c.height) * r.height,
        shown: r.width * devicePixelRatio,
        h: innerHeight,
        w: innerWidth,
        colRight: col.right,
        menuBottom: menu ? menu.getBoundingClientRect().bottom : 0,
      };
    });
    const info2 = JSON.stringify(m);
    expect([628, 1256], info2).toContain(m.natural[0]);
    expect(m.natural[0] / m.natural[1], info2).toBeCloseTo(1256 / 1363, 2);
    expect(m.edge, info2).toBeLessThanOrEqual(2);
    expect(m.bottom, info2).toBeCloseTo(m.h, 0);
    expect(m.figBottom, info2).toBeCloseTo(m.h, 0);
    // 他臉朝左：放在台詞欄右邊、看著台詞。人物左緣離台詞欄右緣 8px（±2）；框本身也不進台詞欄。
    expect(Math.abs(m.left - (m.colRight + 8)), info2).toBeLessThanOrEqual(2);
    expect(m.figLeft, info2).toBeGreaterThanOrEqual(m.colRight);
    // 外輪廓離畫面右緣至少 24px，不要幾乎碰到（UI 規格 §16）；框也不出畫面。
    expect(m.w - m.right, info2).toBeGreaterThanOrEqual(24);
    expect(m.figRight, info2).toBeLessThanOrEqual(m.w);
    // 頭頂和「選單」鈕至少 8px。
    expect(m.top - m.menuBottom, info2).toBeGreaterThanOrEqual(8);
    // 人物高（頭頂到畫面底）≤ 畫面高 45%；不放大超過原圖 1256。
    expect(m.h - m.top, info2).toBeLessThanOrEqual(0.45 * m.h + 0.5);
    expect(m.shown, info2).toBeLessThanOrEqual(1256 + 0.5);
    // 而且放到三條其中一條的上限（寬螢幕要放大，不留在舊的 300px）：右邊剛好、高剛好 45%，或剛好原圖大小。
    const tight = [
      m.w - m.right - 24 <= 0.03 * (m.w / 2 - 472),
      m.h - m.top >= 0.44 * m.h,
      m.shown >= 1256 - 12,
    ];
    expect(tight, info2).toContain(true);
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/lucas-stage-${w}x${h}@${dpr}x.png` });
    await ctx?.close();
  });
