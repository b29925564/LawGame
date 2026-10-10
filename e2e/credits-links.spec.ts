/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

// 製作群的連結用權杖色（不是瀏覽器預設的紫），授權名不斷行。
test('製作群：連結不是瀏覽器預設色，授權名只占一行', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^(製作群|Credits)/ }).click();
  const links = page.locator('.credits a');
  expect(await links.count()).toBeGreaterThan(3);
  const text = await page.locator('.credits').evaluate((e) => getComputedStyle(e).color);
  for (const a of await links.all()) {
    expect(await a.evaluate((e) => getComputedStyle(e).color)).toBe(text);
  }
  for (const a of await page.locator('.credits li > span:last-child > a:last-child').all()) {
    const h = await a.evaluate((e) => {
      const r = e.getClientRects();
      return r.length;
    });
    expect(h).toBe(1);
  }
});
