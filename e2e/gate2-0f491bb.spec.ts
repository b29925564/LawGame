/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * v98 候選版（0f491bb）第二道評測的擋件（qa/gates/2026-11-28-fresh-0f491bb.md）：
 * 標題上的開發用字、攤牌提示超出手機右緣與自動收掉時的誤觸、證詞卡掛錯人、死亡時間尺疊字。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: Record<string, unknown> };

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});

test('標題：沒有原型連結和版本號；?proto 才有；製作群有版本', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).waitFor();
  await expect(page.getByRole('button', { name: /系統原型/ })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('垂直切片');
  await page.screenshot({ path: info.outputPath('title.png'), fullPage: true });
  await page.getByRole('button', { name: '製作群' }).click();
  await expect(page.locator('.credits .build-id')).toContainText('版本');
  await page.locator('.credits .build-id').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('credits.png') });
  await page.goto('/?proto');
  await expect(page.getByRole('button', { name: /系統原型/ })).toBeVisible();
});

test('攤牌提示：手機不超出右緣；自動收掉那一下不誤按', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem('rd.dev.intro', '0');
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep1',
          scene: 11,
          step: 0,
          choices: {},
          cards: ['arg-a', 'arg-b', 'arg-d'],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  });
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.getByRole('button', { name: /^坐下$/ }).click();
  await page.getByRole('button', { name: '攤牌', exact: true }).click();
  const vo = page.locator('.vo');
  await expect(vo.locator('.vo-text.now')).toBeVisible({ timeout: 15000 });
  const right = await page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll('.vo-text .ch')].map((c) => c.getBoundingClientRect().right),
    ),
  );
  const left = await page.evaluate(() =>
    Math.min(
      ...[...document.querySelectorAll('.vo-text .ch')].map((c) => c.getBoundingClientRect().left),
    ),
  );
  console.log('vo text left/right', left, right);
  await page.screenshot({ path: info.outputPath('vo.png') });
  expect(right).toBeLessThanOrEqual(390);
  expect(left).toBeGreaterThanOrEqual(0);
  // 等它自己收掉，收掉的那一刻點在底下的論點上。
  await vo.waitFor({ state: 'detached', timeout: 20000 });
  const pick = page.locator('.reveal button.pick').first();
  const box = (await pick.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await expect(page.locator('.reveal')).not.toContainText('已亮出');
  await page.waitForTimeout(800);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.reveal')).toContainText('已亮出');
});

test('交互詰問：證詞卡掛證人的名字和頭像', async ({ page }, info) => {
  const p = structuredClone(save.ep1);
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('rd.dev.intro', '0');
      localStorage.setItem('lawgame-ep-auto', s);
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: p })] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
  await page.getByRole('button', { name: '開庭' }).click();
  const cross = page.getByRole('button', { name: '開始交互詰問' });
  for (let i = 0; i < 20 && !(await cross.isVisible()); i++) {
    await page.locator('button.primary.wide:not(.locked)').first().click();
    const pass = page.getByRole('button', { name: '不異議' });
    await pass.waitFor({ timeout: 3000 }).catch(() => {});
    if (await pass.isVisible()) await pass.click();
  }
  await cross.click();
  const now = page.locator('article.claim .court-now, .court-now:has(.claim-text)').first();
  await expect(now).toBeVisible();
  await now.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('claim.png') });
  await expect(now.locator('.who')).not.toHaveText('法官');
  console.log('claim who:', await now.locator('.who').textContent());
});

// 法醫那一場要走到第三天才看得到：這裡用同一套 class 把尺畫在標題頁上量（只量版面）。
test('死亡時間尺：原本推估與 22:24 不疊', async ({ page }, info) => {
  for (const w of [360, 390, 1440]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: '新遊戲' }).waitFor();
    await page.evaluate(() => {
      const x = (t: number) => (t - 1320) / 90;
      const p = x(1344);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:200px 16px auto 16px;z-index:9999;background:#eee';
      host.innerHTML = `<section class="panel ruler-panel"><figure class="ruler"><div class="ruler-track">
        <span class="ruler-window ghost" style="--a:0;--b:1" data-lbl="end"><span class="lbl">原本推估 22:00–23:30</span></span>
        <span class="ruler-window narrow" style="--a:${x(1341)};--b:${x(1347)}"></span>
        <span class="ruler-pin" style="--x:${p}"></span>
        <span class="ruler-point on" style="--x:${p}" data-align="end"><span class="lbl"><time>22:24</time></span></span>
      </div><ol class="ruler-ticks"><li style="--x:0">22:00</li><li style="--x:${x(1350)}">22:30</li><li style="--x:${x(1380)}">23:00</li><li style="--x:1">23:30</li></ol></figure></section>`;
      document.body.append(host);
    });
    const a = (await page.locator('.ruler-window.ghost .lbl').boundingBox())!;
    const b = (await page.locator('.ruler-point .lbl').boundingBox())!;
    console.log(w, 'ghost', a.x, a.x + a.width, 'pin', b.x, b.x + b.width);
    await page.screenshot({
      path: info.outputPath(`ruler-${w}.png`),
      clip: { x: 0, y: 150, width: w, height: 200 },
    });
    expect(
      a.x >= b.x + b.width ||
        a.x + a.width <= b.x ||
        a.y >= b.y + b.height ||
        a.y + a.height <= b.y,
    ).toBe(true);
  }
});
