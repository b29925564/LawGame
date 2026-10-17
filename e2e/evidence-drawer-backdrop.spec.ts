/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 手機與平板的證據抽屜（#298 設計師審查）：EvidenceDrawer 在 .shell-foot 裡渲染，底列有 backdrop-filter 之後
 * 會變成 fixed 子孫的定位基準，遮罩縮成按鈕列大小、點外面點到後面。抽屜改掛 document.body，
 * 遮罩就是整個視窗，點抽屜上方會關、不會點到後面的東西。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

for (const [width, height] of [
  [412, 839],
  [900, 900],
] as const)
  test(`證據抽屜的遮罩蓋滿視窗、點上方會關（${width} 寬）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (s) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
        localStorage.setItem('lawgame-lang', 'en');
        localStorage.setItem('lawgame-record-instant', '1');
      },
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^Continue/ })
      .first()
      .click();
    const go = page.getByRole('button', { name: /^Go to court/ });
    await go.or(page.locator('.record')).first().waitFor();
    if (await go.isVisible()) await go.click();
    // 底列有模糊（<1024）。
    await expect(page.locator('.shell-foot')).toHaveCSS('backdrop-filter', 'blur(8px)');

    await page.locator('.evidence-tab').click();
    const back = page.locator('.sheet-back');
    await expect(back).toBeVisible();
    // 抽屜整組掛在 body 底下，不在 .shell-foot 裡。
    expect(await page.locator('.shell-foot .sheet-wrap').count()).toBe(0);
    expect(await page.locator('body > .sheet-wrap').count()).toBe(1);
    const box = (await back.boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y)).toBe(0);
    expect(Math.round(box.width)).toBe(width);
    expect(Math.round(box.height)).toBe(height);
    // 抽屜上方的點是遮罩，不是後面的頁面。
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.className,
      [width / 2, 40],
    );
    expect(hit).toContain('sheet-back');
    await page.mouse.click(width / 2, 40);
    await expect(page.locator('.sheet')).toHaveCount(0);
    await expect(page.locator('.sheet-wrap')).toHaveCount(0);
  });
