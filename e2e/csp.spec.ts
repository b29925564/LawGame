/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 內容安全政策（上線前審查 S2，Issue #380）：GitHub Pages 不能設回應標頭，
 * 所以 CSP 在建置時以 <meta> 放進 index.html（vite.config.ts 的 csp()）。
 * 這裡確認打包後真的有這行，而且走過片頭、冷開場、法庭、第 2 集尾聲都沒有任何東西被它擋下。
 * 被擋的東西不一定會讓測試失敗（圖少一張、字型退回系統字），所以要直接收違規事件。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as { ep2: unknown };
const court = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

/** 收集頁面和 worker 的 CSP 違規：頁面的走事件，worker 裡的只會出現在主控台。 */
function watch(page: Page) {
  const seen: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) seen.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (/Content Security Policy/i.test(e.message)) seen.push(e.message);
  });
  return async () => {
    const fromPage = await page.evaluate(
      () => (window as unknown as { __csp?: string[] }).__csp ?? [],
    );
    return [...fromPage, ...seen];
  };
}

test.beforeEach(({ page }) =>
  page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  }),
);

async function seed(page: Page, progress: unknown) {
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress })] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
}

test('打包後的頁面有 CSP，不允許行內腳本', async ({ page }) => {
  await page.goto('/');
  const content = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(content).toBeTruthy();
  const script = content!.split(';').find((d) => d.trim().startsWith('script-src'))!;
  expect(script.trim()).toBe("script-src 'self'");
  expect(content).toContain("object-src 'none'");
  // 頁面上的腳本全是外部檔，沒有行內的。
  expect(await page.locator('script:not([src])').count()).toBe(0);
});

test('片頭、冷開場：沒有被 CSP 擋下的東西', async ({ page }) => {
  const violations = watch(page);
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.evaluate(() => localStorage.setItem('rd.dev.intro', '0'));
  await page.reload();
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: /打開 葛蘭特・沃斯 的訊息/ }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  expect(await violations()).toEqual([]);
});

test('法庭與異議：沒有被 CSP 擋下的東西', async ({ page }) => {
  const violations = watch(page);
  await seed(page, court.ep1);
  const open = page.getByRole('button', { name: '開庭' });
  await open.or(page.locator('.court-cam')).first().waitFor();
  if (await open.isVisible()) await open.click();
  await page.waitForTimeout(1200);
  await page.locator('button.primary.wide:not(.locked)').first().click();
  await expect(page.locator('section.objection').first()).toBeAttached();
  await page.waitForTimeout(800);
  expect(await violations()).toEqual([]);
});

test('第 2 集尾聲：沒有被 CSP 擋下的東西', async ({ page }) => {
  const violations = watch(page);
  await seed(page, seeds.ep2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  expect(await violations()).toEqual([]);
});
