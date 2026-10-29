/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * 手機的證據抽屜是一層蓋上來的對話框（體驗評測 v91 就有的四項）：
 * 選單鈕不再浮在遮罩上面、拉柄真的拉得動、橫向手機看得到卡、焦點進得去也出得來。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

async function openDrawer(page: Page, info: TestInfo, width: number, height: number, lang = 'en') {
  test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
  await page.setViewportSize({ width, height });
  await page.addInitScript(
    ([s, l]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
      localStorage.setItem('lawgame-lang', l);
      localStorage.setItem('lawgame-record-instant', '1');
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }), lang],
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^(Continue|繼續)/ })
    .first()
    .click();
  const go = page.getByRole('button', { name: /^(Go to court|開庭)/ });
  await go.or(page.locator('.record')).first().waitFor();
  if (await go.isVisible()) await go.click();
  await page.locator('.evidence-tab').click();
  await expect(page.locator('.sheet')).toBeVisible();
  // 開場動畫（sheet-up）結束再量。
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== 'running' || !(a as CSSAnimation).animationName?.includes('sheet'),
      ),
  );
}

/** 目前焦點元素的外框（含 outline-offset）四邊有沒有被某個祖先的 overflow 切掉。 */
function ringClipped(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    const grow = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
    const b = el.getBoundingClientRect();
    const ring = { l: b.left - grow, t: b.top - grow, r: b.right + grow, b: b.bottom + grow };
    const clipped: string[] = [];
    for (let a = el.parentElement; a; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflowX === 'visible' && ac.overflowY === 'visible') continue;
      const ab = a.getBoundingClientRect();
      const box = {
        l: ab.left + a.clientLeft,
        t: ab.top + a.clientTop,
        r: ab.left + a.clientLeft + a.clientWidth,
        b: ab.top + a.clientTop + a.clientHeight,
      };
      const out = [
        ring.l < box.l - 0.5 && '左',
        ring.t < box.t - 0.5 && '上',
        ring.r > box.r + 0.5 && '右',
        ring.b > box.b + 0.5 && '下',
      ].filter(Boolean);
      if (out.length) clipped.push(`${a.className}:${out.join('')}`);
    }
    return { tag: el.textContent, outline: cs.outlineStyle, clipped };
  });
}

type Rgb = [number, number, number];
/** 螢幕上一個像素（CSS px，desktop 專案 DPR 1）的顏色：量焦點圈真的畫出來的顏色，不是 CSS 寫了什麼。 */
async function pixel(page: Page, x: number, y: number): Promise<Rgb> {
  const buf = await page.screenshot({
    clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]] as Rgb;
  }, buf.toString('base64'));
}
const rgbOf = (css: string): Rgb => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as Rgb;
const near = (a: Rgb, b: Rgb, tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const lum = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** 焦點元素外框底邊中點那一格的顏色（外框畫在按鈕裡面，離底邊 1px）和外框的設定色。 */
async function ringBottom(page: Page) {
  const r = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const b = el.getBoundingClientRect();
    return {
      x: b.left + b.width / 2,
      y: b.bottom,
      color: getComputedStyle(el).outlineColor,
    };
  });
  return { want: rgbOf(r.color), got: await pixel(page, r.x, r.y - 1) };
}

test.describe('證據抽屜（手機）', () => {
  test('右上角的點是遮罩：點下去關抽屜，不會打開選單', async ({ page }, info) => {
    await openDrawer(page, info, 412, 839);
    const m = (await page.locator('.menu-toggle').boundingBox())!;
    const [x, y] = [m.x + m.width / 2, m.y + m.height / 2];
    const hit = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.className,
      [x, y],
    );
    expect(hit).toContain('sheet-back');
    await page.mouse.click(x, y);
    await expect(page.locator('.sheet')).toHaveCount(0);
    await expect(page.locator('.menu-panel')).toHaveCount(0);
    // 抽屜關了，選單鈕又能點。
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.menu-panel')).toBeVisible();
  });

  test('拉柄拖得動：拖過三分之一關掉，拖一點會彈回原位', async ({ page }, info) => {
    await openDrawer(page, info, 412, 839);
    const grip = page.locator('.sheet-grip');
    await expect(grip).toBeVisible();
    const g = (await grip.boundingBox())!;
    const top0 = (await page.locator('.sheet').boundingBox())!.y;
    const [x, y] = [g.x + g.width / 2, g.y + g.height / 2];
    // 拖 60px、放開：回原位。
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 4 });
    await page.mouse.move(x, y + 60, { steps: 4 });
    const mid = (await page.locator('.sheet').boundingBox())!.y;
    expect(mid - top0).toBeGreaterThan(40);
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await page.locator('.sheet').boundingBox())!.y))
      .toBe(Math.round(top0));
    // 拖過抽屜高度的 1/3：關。
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 150, { steps: 6 });
    await page.mouse.move(x, y + 300, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.sheet')).toHaveCount(0);
  });

  for (const lang of ['zh', 'en'])
    test(`橫向手機（863×360，${lang}）：不捲就看得到三張完整的卡、只有一層捲動、捲到底看得到最後一張`, async ({
      page,
    }, info) => {
      await openDrawer(page, info, 863, 360, lang);
      // 搜尋和篩選併成一行，提示句不放。
      const find = (await page.locator('.sheet .find').boundingBox())!;
      const chip = (await page.locator('.sheet .chips.kinds button').first().boundingBox())!;
      expect(Math.abs(find.y + find.height / 2 - (chip.y + chip.height / 2))).toBeLessThan(20);
      await expect(page.locator('.sheet .sheet-note')).toBeHidden();
      const cards = page.locator('.sheet .sheet-list > li');
      let seen = 0;
      for (let i = 0; i < 5; i++) {
        const b = await cards.nth(i).boundingBox();
        if (b && b.y >= 0 && b.y + b.height <= 360) seen++;
      }
      expect(seen).toBeGreaterThanOrEqual(3);
      // 一層捲動：清單自己不捲，整個抽屜捲。
      const layers = await page.evaluate(() => {
        const list = document.querySelector('.sheet .sheet-list')!;
        const sheet = document.querySelector('.sheet')!;
        return {
          list: list.scrollHeight - list.clientHeight,
          sheet: sheet.scrollHeight - sheet.clientHeight,
        };
      });
      expect(layers.list).toBeLessThanOrEqual(1);
      expect(layers.sheet).toBeGreaterThan(0);
      // 捲到中段和底：拉柄、分頁、「關閉」都還在畫面裡，頂列上沒有卡露出來；捲到底最後一張卡完整。
      const sheetTop = (await page.locator('.sheet').boundingBox())!.y;
      for (const to of [120, 1e6]) {
        await page.locator('.sheet').evaluate((el, y) => (el.scrollTop = y), to);
        for (const loc of [
          page.locator('.sheet-grip'),
          page.locator('.sheet .sheet-tabs button').first(),
          page.locator('.sheet .panel-head .link'),
        ]) {
          const b = (await loc.boundingBox())!;
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.y + b.height).toBeLessThanOrEqual(360);
        }
        const barH = await page.evaluate(
          () => document.querySelector('.sheet-top')!.getBoundingClientRect().height,
        );
        for (const dy of [2, barH / 2, barH - 2]) {
          const hit = await page.evaluate(
            ([x, y]) => !!document.elementFromPoint(x, y)?.closest('.sheet-list li'),
            [431, sheetTop + dy],
          );
          expect(hit, `捲 ${to}，抽屜上緣往下 ${dy}px 是卡`).toBe(false);
        }
      }
      const last = (await page.locator('.sheet .sheet-list li').last().boundingBox())!;
      expect(last.y).toBeGreaterThanOrEqual(0);
      expect(last.y + last.height).toBeLessThanOrEqual(360);
    });

  test('焦點：開了進抽屜、Tab 繞不出去、關了回到「證據」鈕', async ({ page }, info) => {
    await openDrawer(page, info, 412, 839);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('.sheet'));
    await expect(page.locator('.sheet')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.sheet')).toHaveAttribute('aria-modal', 'true');
    expect(await inside()).toBe(true);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
    // 焦點在卡上時第一下 Escape 先收提示（WCAG 1.4.13），第二下才關抽屜。
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet')).toHaveCount(0);
    await expect(page.locator('.evidence-tab')).toBeFocused();
  });

  for (const lang of ['zh', 'en'])
    test(`抽屜分頁的焦點圈四邊都在，沒被祖先的 overflow 切掉（${lang}）`, async ({
      page,
    }, info) => {
      await openDrawer(page, info, 412, 839, lang);
      await page.keyboard.press('Tab');
      const r = await ringClipped(page);
      expect(r.tag).toMatch(/^(證據|Evidence)/);
      expect(r.outline).toBe('solid');
      expect(r.clipped).toEqual([]);
    });

  // 書桌的分頁列同一個 .apps：焦點圈也不能被切（設計師 #307 第二輪）。
  for (const [width, height] of [
    [412, 839],
    [1440, 900],
  ] as const)
    for (const lang of ['zh', 'en'])
      test(`書桌分頁列的焦點圈四邊都在（${width} 寬，${lang}）`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
        await page.setViewportSize({ width, height });
        await page.addInitScript(
          ([l]) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.clear();
            localStorage.setItem('lawgame-lang', l);
            localStorage.setItem(
              'lawgame-ep-auto',
              JSON.stringify({
                version: 5,
                savedAt: Date.now(),
                label: 'x',
                progress: {
                  episode: 'ep1',
                  scene: 9,
                  step: 0,
                  choices: {},
                  cards: ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo'],
                  flags: [],
                  ethics: [],
                  scenes: {},
                },
              }),
            );
          },
          [lang],
        );
        await page.goto('/');
        await page
          .getByRole('button', { name: /^(Continue|繼續)/ })
          .first()
          .click();
        const tabs = page.locator('nav.apps:not(.sheet-tabs)').first();
        await expect(tabs).toBeVisible();
        // 鍵盤模式才有 :focus-visible：先按一下 Tab，再把焦點放到分頁上。
        await page.keyboard.press('Tab');
        await tabs.locator('button:not(.measure)').first().focus();
        const r = await ringClipped(page);
        expect(r.outline).toBe('solid');
        expect(r.clipped).toEqual([]);
        await page.screenshot({
          path: process.env.RING_OUT
            ? `${process.env.RING_OUT}/5-desk-tabs-focus-${width}-${lang}.png`
            : undefined,
        });
      });
});

// 第二道關卡 v93 第 5 處：選中分頁的焦點圈底邊被選中底線蓋掉；語言切換的焦點圈被 overflow: hidden 切掉。
test.describe('焦點圈：選中分頁和語言切換', () => {
  for (const lang of ['zh', 'en'])
    test(`抽屜選中分頁有焦點：外框底邊在底線上面（${lang}）`, async ({ page }, info) => {
      await openDrawer(page, info, 412, 839, lang);
      await page.keyboard.press('Tab');
      const sel = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-current') === 'true',
      );
      expect(sel).toBe(true);
      const { want, got } = await ringBottom(page);
      expect(near(got, want), `底邊是 ${got}，外框是 ${want}（被選中底線蓋掉了）`).toBe(true);
    });

  for (const [width, height] of [
    [412, 839],
    [1440, 900],
  ] as const)
    for (const lang of ['zh', 'en'])
      test(`書桌選中分頁有焦點：外框底邊在底線上面（${width}，${lang}）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
        await page.setViewportSize({ width, height });
        await page.addInitScript(
          ([l]) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.clear();
            localStorage.setItem('lawgame-lang', l);
            localStorage.setItem(
              'lawgame-ep-auto',
              JSON.stringify({
                version: 5,
                savedAt: Date.now(),
                label: 'x',
                progress: {
                  episode: 'ep1',
                  scene: 9,
                  step: 0,
                  choices: {},
                  cards: ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo'],
                  flags: [],
                  ethics: [],
                  scenes: {},
                },
              }),
            );
          },
          [lang],
        );
        await page.goto('/');
        await page
          .getByRole('button', { name: /^(Continue|繼續)/ })
          .first()
          .click();
        const tabs = page.locator('nav.apps:not(.sheet-tabs)').first();
        await expect(tabs).toBeVisible();
        await page.keyboard.press('Tab');
        await tabs.locator('button[aria-current="true"]').focus();
        // 底線的縮放過場結束再量。
        await page.waitForTimeout(400);
        const { want, got } = await ringBottom(page);
        expect(near(got, want), `底邊是 ${got}，外框是 ${want}（被選中底線蓋掉了）`).toBe(true);
      });

  for (const [width, height] of [
    [412, 839],
    [1440, 900],
  ] as const)
    for (const lang of ['zh', 'en'])
      for (const pressed of [false, true])
        test(`語言切換${pressed ? '選中' : '未選中'}那格有焦點：四邊都在、對比 ≥3:1（${width}，${lang}）`, async ({
          page,
        }, info) => {
          test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
          await page.setViewportSize({ width, height });
          await page.addInitScript(
            ([l]) => {
              if (sessionStorage.getItem('seeded')) return;
              sessionStorage.setItem('seeded', '1');
              localStorage.clear();
              localStorage.setItem('lawgame-lang', l);
            },
            [lang],
          );
          await page.goto('/');
          await page.keyboard.press('Tab');
          const btn = page.locator(`.lang-switch button[aria-pressed="${pressed}"]`).first();
          await btn.focus();
          // 標題畫面淡入、焦點圈的過渡都結束再取像素。
          await page.waitForFunction(() =>
            document.getAnimations().every((a) => a.playState !== 'running'),
          );
          await page.waitForTimeout(200);
          const r = await ringClipped(page);
          expect(r.outline).toBe('solid');
          expect(r.clipped).toEqual([]);
          const geo = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement;
            const b = el.getBoundingClientRect();
            return {
              x: b.left + b.width / 2,
              y: b.top + b.height / 2,
              left: b.left,
              right: b.right,
              top: b.top,
              bottom: b.bottom,
              color: getComputedStyle(el).outlineColor,
            };
          });
          const ring = rgbOf(geo.color);
          // 四邊離邊 1px 的那一格都是外框色。
          for (const [x, y] of [
            [geo.x, geo.top + 1],
            [geo.x, geo.bottom - 1],
            [geo.left + 1, geo.y],
            [geo.right - 1, geo.y],
          ])
            expect(near(await pixel(page, x, y), ring), `(${x}, ${y}) 是 ${await pixel(page, x, y)}，外框 ${ring}`).toBe(true);
          // 外框對它裡面那一圈（選中：--bg 內圈；未選中：按鈕底）、對外面（外框 overflow 裁掉的那邊是鄰格或面板）都 ≥3:1。
          const inner = await pixel(page, geo.x, geo.top + 3);
          expect(contrast(ring, inner)).toBeGreaterThanOrEqual(3);
          const outer = await pixel(page, geo.x, geo.top - 3);
          expect(contrast(ring, outer)).toBeGreaterThanOrEqual(3);
        });
});
