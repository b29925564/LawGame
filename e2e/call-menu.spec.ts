/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

/**
 * 監獄來電（第 1 集第 44 場）淺色主題：選單鈕是深色款（設計師裁定 25376da），但打開的選單面板照主題，
 * 「選項」頁的字看得清楚（第二道關卡 a26de2b 第 1 項：深色權杖釘在整個選單上，面板變深、標籤還是深字，對比 1.05:1）。
 */
test('監獄來電淺色主題：選單鈕深色款，選項頁的字和面板對比 ≥4.5', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep1',
          scene: 44,
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
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click({ timeout: 5000 }).catch(() => {});
  await expect(page.locator('.call-screen')).toBeVisible();
  const toggle = page.locator('.menu-toggle');
  await page.waitForTimeout(400);
  const lum = (rgb: string) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => {
      const c = Number(x) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // 選單鈕：深色款（底比字暗）。
  const btn = await toggle.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  expect(lum(btn.bg), `選單鈕底色 ${btn.bg}`).toBeLessThan(lum(btn.fg));
  await toggle.click();
  await page.getByRole('tab', { name: '選項' }).click();
  const panel = page.locator('.menu-panel');
  await expect(panel).toBeVisible();
  const got = await panel.evaluate((p) => {
    const bg = getComputedStyle(p).backgroundColor;
    const out: { text: string; fg: string }[] = [];
    const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest('button, input, select')) continue;
      out.push({ text, fg: getComputedStyle(el).color });
    }
    return { bg, out };
  });
  expect(got.out.length).toBeGreaterThan(0);
  for (const { text, fg } of got.out)
    expect
      .soft(ratio(fg, got.bg), `「${text}」字 ${fg}、面板 ${got.bg}`)
      .toBeGreaterThanOrEqual(4.5);
});
