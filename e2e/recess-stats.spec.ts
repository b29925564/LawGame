/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 休庭頁的統計表（第二道關卡 7075839 舊問題 9；設計師 v93 裁定 一之 5）：320 英文 150% 右欄被切。
 * 數值不換行、不被切；左欄的標籤可以換行；整張表在視窗內。
 * 存檔：hung-jury.json 的第 2 集，scene 19（唐醫師），詰問已結束（stage done），按「開庭」直接到休庭頁。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep2', { scenes: Record<string, Record<string, unknown>> }>;

for (const [w, h, lang, scale] of [
  [320, 640, 'en', 1.5],
  [320, 640, 'en', 1.25],
  [320, 640, 'zh', 1.5],
  [360, 740, 'en', 1.5],
] as const)
  test(`休庭統計表：數值不換行、整張表在視窗內（${w}・${lang}・${scale * 100}%）`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    await page.setViewportSize({ width: w, height: h });
    const src = seeds.ep2;
    const progress = {
      ...src,
      scene: 19,
      step: 0,
      scenes: {
        'voir-dire': src.scenes['voir-dire'],
        'court-doctor': { ...src.scenes['court-doctor'], stage: 'done' },
      },
    };
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
    await page.getByRole('button', { name: /^(開庭|Go to court)$/ }).click();
    const stats = page.locator('main.scene > dl.stats');
    await expect(stats).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = await stats.evaluate((dl) => {
      const box = dl.getBoundingClientRect();
      const lines = (e: Element) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size;
      };
      return {
        right: box.right,
        left: box.left,
        view: document.documentElement.clientWidth,
        dd: [...dl.querySelectorAll('dd')].map((e) => {
          const r = document.createRange();
          r.selectNodeContents(e);
          const ink = r.getBoundingClientRect();
          return {
            text: e.textContent,
            lines: lines(e),
            clipped: e.scrollWidth > e.clientWidth + 1 || ink.right > box.right - 0.5,
          };
        }),
        dt: [...dl.querySelectorAll('dt')].map((e) => ({
          text: e.textContent,
          over: e.scrollWidth > e.clientWidth + 1,
        })),
      };
    });
    expect(m.left, '表的左緣在視窗內').toBeGreaterThanOrEqual(0);
    expect(m.right, '表的右緣在視窗內').toBeLessThanOrEqual(m.view);
    for (const d of m.dd) {
      expect(d.lines, `數值「${d.text}」換行`).toBe(1);
      expect(d.clipped, `數值「${d.text}」被切`).toBe(false);
    }
    for (const d of m.dt) expect(d.over, `標籤「${d.text}」超出欄外`).toBe(false);
  });
