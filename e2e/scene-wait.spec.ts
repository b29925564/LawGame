/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 場景延遲載入時的等待畫面（Issue #388 P3，設計師 #404 審查）：直接讀檔進法庭、場景程式還沒到，
 * 畫面要是底圖解碼前的純黑（#0b0e13），不能先閃一下淺色頁面底色；等超過 1.5 秒右下角出「載入中」，場景出來就拿掉。
 * 這裡把場景 chunk 延遲 3.5 秒來量（「載入中」出現後要留夠時間讓測試看到）。SHOTS=1 時另外存截圖給設計師看。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };
const SHOTS = process.env.SHOTS ? '/mnt/project-files/ux/art-bible-gap/impl/pr404-lazy/' : null;

async function slowCourt(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route(/\/assets\/scenes-[^/]+\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, 3500));
    await route.continue();
  });
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 })] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
}

test('讀檔直接進法庭、場景還沒載好：純黑，1.5 秒後才出「載入中」，載好就換上法庭', async ({
  page,
}, info) => {
  // 手機看 390 寬（設計師指定）。
  if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
  await slowCourt(page);
  const wait = page.locator('.scene-wait');
  await expect(wait).toBeVisible();
  const t0 = Date.now();
  await expect(wait).toHaveAttribute('aria-busy', 'true');
  await expect(wait).toHaveCSS('background-color', 'rgb(11, 14, 19)');
  await expect(wait.getByText('載入中')).toHaveCount(0);
  const name = info.project.name === 'desktop' ? 'desktop-1440' : 'phone';
  if (SHOTS) {
    await page.waitForTimeout(Math.max(0, 200 - (Date.now() - t0)));
    await page.screenshot({ path: `${SHOTS}wait-${name}-0.2s.png` });
  }
  await expect(wait.getByText('載入中')).toBeVisible({ timeout: 3000 });
  expect(Date.now() - t0).toBeGreaterThan(1300);
  if (SHOTS) {
    await page.waitForTimeout(Math.max(0, 1800 - (Date.now() - t0)));
    await page.screenshot({ path: `${SHOTS}wait-${name}-1.8s.png` });
  }
  const open = page.getByRole('button', { name: '開庭' });
  await open.or(page.locator('.court-cam')).first().waitFor({ timeout: 10000 });
  await expect(wait).toHaveCount(0);
});
