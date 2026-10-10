/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

async function load(page: Page, scene: number, step: number, scheme: 'dark' | 'light' = 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto('/');
  await page.evaluate(
    ([scene, step]) => {
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene,
            step,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [scene, step] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

// 第二道關卡第 4 條：冷開場刷員工證那一頁，感應器是場景裡的東西，不是黃的；主按鈕也退成框線（整段零黃見下一條）。
test('冷開場刷員工證：感應器不是黃的', async ({ page }) => {
  await load(page, 0, 8);
  const reader = page.locator('.reader');
  await expect(reader).toBeVisible();
  const yellow = await page
    .getByRole('button', { name: '感應員工證' })
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await reader.evaluate((e) => getComputedStyle(e).color)).not.toBe(yellow);
  // 光暈也不是黃的。
  const halo = await reader.evaluate((e) => getComputedStyle(e).boxShadow);
  expect(halo).not.toContain(yellow);
});

// 設定集 11.5：冷開場三格不出現黃，第一道黃留給片頭。從第一格走到冷開場結束，每一格都量。
test('冷開場：叫車、感應員工證、31 樓門口，整段沒有黃', async ({ page }) => {
  await load(page, 0, 0);
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const beat = page.locator('.place-beat');
    if (await beat.count()) await beat.click();
    if (!(await page.locator('.phone-stage, .cine').count())) break;
    // 游標停在主按鈕上（滑鼠剛按完上一頁）也要量。
    const primary = page.locator('.phone-stage button.primary');
    if (await primary.count()) await primary.hover();
    const hit = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--hl)';
      document.body.append(probe);
      const hl = getComputedStyle(probe).color;
      probe.remove();
      const out: string[] = [];
      for (const e of document.querySelectorAll('.phone-stage *, .cine *')) {
        const c = getComputedStyle(e);
        if ([c.backgroundColor, c.color, c.borderTopColor].includes(hl))
          out.push(`${e.tagName}.${(e as HTMLElement).className}`);
      }
      return out;
    });
    expect(hit).toEqual([]);
    for (const k of ['ride', 'badge', 'door'])
      if (await page.locator(`.phone-body.${k}`).count()) seen.add(k);
    const next = page
      .locator('.phone-stage button, .cine button')
      .filter({ hasNotText: /^$/ })
      .last();
    if (!(await next.count()) || !(await next.isVisible())) break;
    await next.click();
    await page.waitForTimeout(120);
  }
  expect([...seen].sort()).toEqual(['badge', 'door', 'ride']);
});

// 第二道關卡第 5 條：法典每一條的「遊戲裡」不是黃的（一頁有好幾條）。
test('法典：「遊戲裡」標籤不是黃的', async ({ page }) => {
  await load(page, 7, 0);
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  const tab = page.locator('.evidence-tab');
  if (await tab.count()) await tab.click();
  await page.locator('.sheet-tabs button').last().click();
  const labels = page.locator('.in-game-label');
  await expect(labels.first()).toBeVisible();
  const text = await page
    .locator('.term dt')
    .first()
    .evaluate((e) => getComputedStyle(e).color);
  for (const l of await labels.all()) {
    expect(await l.evaluate((e) => getComputedStyle(e).color)).toBe(text);
  }
});

// 第二道關卡第 6 條：卷宗照片放大檢視的標題要讀得到（深色主題原本是暗字壓暗底，對比約 1.1:1）。
const DESK = {
  hours: 20,
  timeline: [],
  spent: 4,
  marked: [],
  readDocs: [],
  jobs: [],
  mail: [],
  openMail: [],
  link: { cards: [], relation: null },
  found: [],
  badLinks: 0,
  linkNote: null,
  attempts: {},
  confirmed: [],
  submissions: 0,
  wrong: 0,
  report: [],
  feedback: {},
  motions: {},
  flags: [],
  wrapped: false,
};
for (const scheme of ['dark', 'light'] as const)
  test(`照片放大檢視：標題和「關閉」對底色 ≥4.5:1（${scheme}）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.evaluate((desk) => {
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene: 7,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: { investigate: desk },
          },
        }),
      );
    }, DESK);
    await page.reload();
    await page
      .getByRole('button', { name: /^(繼續|Continue)/ })
      .first()
      .click();
    const beat = page.locator('.place-beat');
    await page.waitForTimeout(300);
    if (await beat.count()) await beat.click();
    await page
      .getByRole('button', { name: /^(卷宗|Case file)/ })
      .first()
      .click();
    await page
      .locator('button')
      .filter({ hasText: /警方報告/ })
      .first()
      .click();
    await page
      .locator('button')
      .filter({ hasText: /^(放大|Zoom)/ })
      .first()
      .click();
    const zoom = page.locator('dialog.zoom');
    await expect(zoom).toBeVisible();
    const colors = await zoom.evaluate((d) => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bg = rgb(getComputedStyle(d).backgroundColor);
      return ['.zoom-head h2', '.zoom-head button'].map((q) => {
        const fg = rgb(getComputedStyle(d.querySelector(q)!).color);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      });
    });
    for (const c of colors) expect(c).toBeGreaterThanOrEqual(4.5);
  });
