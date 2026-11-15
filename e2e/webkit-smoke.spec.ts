/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// WebKit 冒煙（第一級支援：中文、100% 字級、桌機 1366、手機 390）。
// 只由 playwright.webkit.config.ts 跑；第 1 集整集通關借用 slice.spec.ts 那一條。
// 第 2 集：每一種場景類型各開一次，確認畫面掛得起來、能往下按、沒有腳本錯誤、不出橫向捲軸。

const EP2: [number, string][] = [
  [0, '冷開場電話'],
  [2, '對白'],
  [4, '會見'],
  [6, '調查桌'],
  [8, '證詞錄取'],
  [10, '審前桌'],
  [12, '調解'],
  [14, '理論'],
  [15, '陪審員遴選'],
  [16, '開場陳述'],
  [17, '主詰問'],
  [20, '辯方證人'],
  [21, '結辯'],
  [24, '尾聲'],
  [30, '尾聲電話'],
];

async function open(page: Page, episode: string, scene: number) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene]) => {
      localStorage.setItem('rd.dev.intro', '0');
      localStorage.setItem('lawgame-lang', 'zh-TW');
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode,
            scene,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [episode, scene] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
}

for (const [scene, what] of EP2)
  test(`第 2 集第 ${scene} 場（${what}）在 WebKit 掛得起來、能往下按`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, 'ep2', scene);
    await expect(page.locator('main')).toBeVisible();
    // 往下推幾拍：畫外字幕、場記、字卡點一下，否則按第一顆看得到的主按鈕。
    for (let i = 0; i < 4; i++) {
      const tap = page.locator('.vo-hit, .place-beat, main[data-auto]').first();
      if (await tap.isVisible().catch(() => false))
        await tap.click({ force: true, timeout: 2000 }).catch(() => {});
      else {
        const b = page.locator('main button:visible').first();
        if (await b.isVisible().catch(() => false))
          await b.click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(400);
    }
    await expect(page.locator('main')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over, '橫向捲軸').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
