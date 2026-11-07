/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 設計師 #328 審查：
 * 1. 第 2 集尾聲的手機戲是黑底的鏡頭層，淺色主題下每一步的選單鈕都是深色款（原本只有幕卡那一步是，手機那幾步換回白底亮鈕）。
 * 2. 手機對話出現選項時，對話捲到最底，最後一個泡泡整個看得到
 *    （第 2 集派單 320 寬 150%：「You have been online for 10 hours…」只露出前兩行，下緣被選項區切掉）。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as { ep2: Record<string, unknown> };

async function open(page: Page, progress: Record<string, unknown>, lang: string, scale = 1) {
  await page.goto('/');
  await page.evaluate(
    ([progress, lang, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { textScale: scale }, version: 1 }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }),
      );
    },
    [progress, lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => {
    const c = Number(x) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

for (const lang of ['zh', 'en'])
  test(`第 2 集尾聲：淺色主題下每一步的選單鈕都是深色款（${lang}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '手機那一組跑就好');
    await page.emulateMedia({ colorScheme: 'light' });
    for (let step = 0; step <= 6; step++) {
      await open(page, { ...seeds.ep2, scene: 30, step }, lang);
      const btn = await page.locator('.menu-toggle').evaluate((e) => {
        const cs = getComputedStyle(e);
        return { bg: cs.backgroundColor, fg: cs.color };
      });
      expect(lum(btn.bg), `第 ${step} 步 選單鈕底色 ${btn.bg}、字 ${btn.fg}`).toBeLessThan(
        lum(btn.fg),
      );
    }
  });

/** 手機聊天出現選項的步驟：第 1 集冷開場沃斯的訊息（3）、第 2 集冷開場派單（4）。其他選項是通話（沒有泡泡）。 */
const CHOOSE: [string, number, number, Record<string, unknown>][] = [
  ['ep1', 0, 3, {}],
  ['ep2', 0, 4, {}],
];

for (const w of [320, 360])
  for (const lang of ['zh', 'en'])
    test(`手機對話出現選項時，最後一個泡泡整個看得到（${w} 寬・150%・${lang}）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 640 });
      let seen = 0;
      for (const [episode, scene, step, choices] of CHOOSE) {
        const progress = {
          episode,
          scene,
          step,
          choices,
          cards: [],
          flags: [],
          ethics: [],
          scenes: {},
        };
        await open(page, progress, lang, 1.5);
        await expect(page.locator('.phone-body.chat .replies')).toBeVisible();
        seen++;
        const m = await page.locator('.phone-body.chat .bubbles').evaluate((ol) => {
          const last = ol.lastElementChild;
          const box = ol.getBoundingClientRect();
          const r = last?.getBoundingClientRect();
          return {
            text: last?.textContent?.trim().slice(0, 40),
            bottom: r?.bottom ?? 0,
            top: r?.top ?? 0,
            boxBottom: box.bottom,
            boxTop: box.top,
          };
        });
        const at = `${episode} 第 ${scene} 場第 ${step} 步「${m.text}」`;
        expect(m.bottom, `${at} 下緣 ${m.bottom}，對話框下緣 ${m.boxBottom}`).toBeLessThanOrEqual(
          m.boxBottom + 0.5,
        );
        expect(m.top, `${at} 上緣`).toBeGreaterThanOrEqual(m.boxTop - 0.5);
      }
      expect(seen).toBe(CHOOSE.length);
    });
