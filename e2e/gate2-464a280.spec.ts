/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 第二道關卡 464a280（qa/gates/2026-11-07-gate2-464a280.md）的擋件 1、2、3、5。第 4 項（法庭借據膠囊離選單鈕 7.8px）在 menu-clear.spec.ts。
 */
async function open(page: Page, progress: Record<string, unknown>, lang: string, scale = 1) {
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
  await page.evaluate(() => document.fonts.ready);
}

const at = (episode: string, scene: number, step = 0, choices = {}) => ({
  episode,
  scene,
  step,
  choices,
  cards: [],
  flags: [],
  ethics: [],
  scenes: {},
});

async function voirDire(page: Page, ep: string, scene: number, lang: string, scale: number) {
  await open(page, at(ep, scene), lang, scale);
  await page
    .locator('.place-beat')
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.getByRole('button', { name: /^(開始遴選|Begin jury selection)/ }).click();
  await expect(page.locator('button.cand').nth(11)).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** 按鈕的無障礙名稱（ariaSnapshot 的第一行）。 */
const nameOf = async (page: Page, i: number) => {
  const snap = await page.locator('button.cand').nth(i).ariaSnapshot();
  return JSON.parse(
    snap
      .split('\n')[0]
      .replace(/^- button /, '')
      .replace(/:$/, ''),
  ) as string;
};

// 第 1 項：中文候選人卡的介紹、職稱自己排行（FitLine），畫面上換行的地方，無障礙名稱裡不能多一個空白
//（「三十二歲， 單身，寫 後端系統。」）。名稱裡的介紹、職稱要和原文一字不差。
for (const [ep, scene] of [
  ['ep1', 15],
  ['ep2', 15],
] as const)
  for (const w of [320, 360])
    test(`遴選候選人卡的無障礙名稱沒有多出空白（${ep}・${w}・中文 150%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 640 });
      await voirDire(page, ep, scene, 'zh', 1.5);
      const n = await page.locator('button.cand').count();
      let split = 0;
      for (let i = 0; i < n; i++) {
        const c = page.locator('button.cand').nth(i);
        const [job, line] = await Promise.all(
          ['.job', '.line'].map((s) => c.locator(s).evaluate((e) => e.textContent ?? '')),
        );
        // 真的有排成好幾行（不然這條測試量不到東西）。
        split += await c
          .locator('.line')
          .evaluate((e) =>
            e.getBoundingClientRect().height > 1.6 * parseFloat(getComputedStyle(e).lineHeight)
              ? 1
              : 0,
          );
        const name = await nameOf(page, i);
        expect.soft(name, `第 ${i + 1} 張`).toContain(job);
        expect.soft(name, `第 ${i + 1} 張`).toContain(line);
      }
      expect(split).toBeGreaterThan(3);
    });

// 第 2 項：320 英文的名單不比外框寬（名單 351px、外框 292px，右邊被切掉）；介紹、「Seat n」都在框裡。
for (const [ep, scene] of [
  ['ep1', 15],
  ['ep2', 15],
] as const)
  for (const scale of [1, 1.5])
    test(`遴選名單不比外框寬，字不出框（${ep}・320・英文 ${scale * 100}%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: 320, height: 640 });
      await voirDire(page, ep, scene, 'en', scale);
      const m = await page.evaluate(() => {
        const ul = document.querySelector('ul.cands')!;
        const box = ul.parentElement!.getBoundingClientRect();
        const u = ul.getBoundingClientRect();
        const out: string[] = [];
        const w = document.createTreeWalker(ul, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          // 只給讀屏的字（.sr-only）不算。
          if (n.parentElement?.closest('.sr-only')) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const b of r.getClientRects())
            if (b.width > 0.5 && b.right > u.right - 1 + 0.5)
              out.push(`「${n.textContent!.trim().slice(0, 24)}」右緣 ${b.right.toFixed(1)}`);
        }
        return { ul: u.width, box: box.width, out };
      });
      expect(m.ul).toBeLessThanOrEqual(m.box + 0.5);
      expect(m.out).toEqual([]);
    });

// 第 3 項：第 2 集開頭的派單手機，訊息多到被標題列（卡爾德快遞）切到時，最上面那則整行藏掉，不留半行。
for (const w of [320, 360])
  for (const lang of ['zh', 'en'])
    test(`派單手機的聊天室不留半行（ep2 開頭・${w}・${lang}・150%）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: 640 });
      await open(page, at('ep2', 0, 0, { 'cold-open': {} }), lang, 1.5);
      let seen = 0;
      for (let k = 0; k < 24; k++) {
        await page.waitForTimeout(400);
        const bad = await page.evaluate(() => {
          const ol = document.querySelector('.phone .bubbles');
          if (!ol) return null;
          const cp = getComputedStyle(ol).clipPath;
          const visTop =
            ol.getBoundingClientRect().top + (cp.startsWith('inset') ? parseFloat(cp.slice(6)) : 0);
          const out: string[] = [];
          const walk = document.createTreeWalker(ol, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const r = document.createRange();
            r.selectNodeContents(n);
            for (const b of r.getClientRects())
              if (b.height > 0.5 && b.top < visTop - 0.5 && b.bottom > visTop + 0.5)
                out.push(`半行「${n.textContent?.slice(0, 16)}」`);
          }
          return out;
        });
        if (bad) {
          seen++;
          expect.soft(bad, `第 ${k} 下`).toEqual([]);
        }
        const btn = page
          .locator(
            '.phone .phone-next:visible, .phone .replies button:visible, .phone .notif:visible, .phone .primary:visible, .cine-next:visible, .place-beat',
          )
          .first();
        if (!(await btn.count()) || !(await page.locator('.phone, .cine, .place-beat').count()))
          break;
        await btn.click();
      }
      expect(seen).toBeGreaterThan(1);
    });

/** 一個元素畫出來的每一行（以字的上緣分組），不斷行空格換回空白。 */
const rowsOf = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => {
      const rows = new Map<number, string>();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const s = n.textContent ?? '';
        for (let i = 0; i < s.length; i++) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const b = r.getBoundingClientRect();
          if (b.height < 0.5) continue;
          const top = Math.round((b.top + b.bottom) / 2 / 6);
          rows.set(top, (rows.get(top) ?? '') + s[i]);
        }
      }
      return [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, t]) =>
          t
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        );
    });

// 第 5 項：短標籤。
test('調解地點列：「調解室 2」不拆（360・中文 125／150%）', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
  await page.setViewportSize({ width: 360, height: 740 });
  for (const scale of [1.25, 1.5]) {
    await open(page, at('ep2', 12), 'zh', scale);
    await page
      .locator('.place-beat')
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(300);
    const rows = await rowsOf(page, 'main.scene > p.eyebrow');
    expect(rows.join('|'), `${scale}`).toContain('調解室 2');
  }
});

test('英文兩個字的短標籤放得下就不拆（調解數字板 Not agreed、$1.5 million；360・125%）', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, at('ep2', 12), 'en', 1.25);
  await page
    .locator('.place-beat')
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.getByRole('button', { name: /^Sit/ }).first().click();
  await page.waitForTimeout(300);
  const dds = await page.locator('.stats.authority dd').count();
  expect(dds).toBeGreaterThan(1);
  for (let i = 0; i < dds; i++) {
    const rows = await rowsOf(page, `.stats.authority dd >> nth=${i}`);
    const words = rows.join(' ').split(' ');
    // 兩個字的格子只排一行（"Not ⏎ agreed"、"$1.5 ⏎ million" 不行）。
    if (words.length === 2) expect(rows, rows.join(' ⏎ ')).toHaveLength(1);
  }
});

// 設計師更正（12:1x）：「3D camera TBD」「Establishing」是兩個標籤，中間是全形空白，就在那裡換行；不改。這條鎖住現狀。
test('定場佔位字（英文 320・150%）：「3D camera TBD ⏎ Establishing」', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, at('ep2', 15), 'en', 1.5);
  await expect(page.locator('.place-tbd')).toBeVisible();
  const rows = await rowsOf(page, '.place-tbd');
  expect(rows).toEqual(['3D camera TBD', 'Establishing']);
});

// 設計師裁定（464a280 第 5 項補充）：候選人卡中文每行至少 3 個字；以「，。？」收尾的子句兩個字加標點就夠（「自己開店｜七年。」可以，「自己｜開店七年。」不行）。
for (const [ep, scene] of [
  ['ep1', 15],
  ['ep2', 15],
] as const)
  test(`遴選候選人卡中文每行夠字（${ep}・320／360・125／150%）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
    test.setTimeout(120_000);
    const bad: string[] = [];
    for (const w of [320, 360])
      for (const scale of [1.25, 1.5]) {
        await page.setViewportSize({ width: w, height: 640 });
        await voirDire(page, ep, scene, 'zh', scale);
        const n = await page.locator('button.cand').count();
        for (let i = 0; i < n; i++)
          for (const row of await rowsOf(page, `button.cand >> nth=${i} >> .line`)) {
            const k = row.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
            if (k < 3 && !(k >= 2 && /[，。？]$/u.test(row)))
              bad.push(`${w}・${scale}：「${row}」`);
          }
      }
    expect(bad).toEqual([]);
  });

// 裁定 1：遴選頁頂列的數字（「候選 21」、第 2 集「無因迴避 2/2」）離選單鈕四向 8 px（412 中文 150% 重疊 6.6 px、320 只有 4.1 px）。
for (const [ep, scene] of [
  ['ep1', 15],
  ['ep2', 15],
] as const)
  for (const w of [320, 390, 412])
    test(`遴選頂列離選單鈕 8 px（${ep}・${w}・中文 150%）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 800 });
      await voirDire(page, ep, scene, 'zh', 1.5);
      const near = await page.evaluate(() => {
        const m = document.querySelector('.menu-toggle')!.getBoundingClientRect();
        const out: string[] = [];
        const walk = document.createTreeWalker(
          document.querySelector('.bench')!,
          NodeFilter.SHOW_TEXT,
        );
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const q of r.getClientRects()) {
            const dx = Math.max(m.left - q.right, q.left - m.right);
            const dy = Math.max(m.top - q.bottom, q.top - m.bottom);
            if (Math.max(dx, dy) < 8 - 0.01)
              out.push(`「${n.textContent.trim()}」離鈕 ${Math.max(dx, dy).toFixed(1)} px`);
          }
        }
        return out;
      });
      expect(near).toEqual([]);
    });

// 裁定 2：場記的房名是一個單位（Pixel 7 英文 150% 排成 "CFO's ⏎ office"）：擠不下時日子時刻換到下一行。
test('22:49 場記：房名 "CFO\'s office" 不拆（英文 150%）', async ({ page }) => {
  await open(page, at('ep1', 0, 10, { 'cold-open': { 3: 0, 6: 1 } }), 'en', 1.5);
  await expect(page.locator('.place-slate .ps-room')).toBeVisible();
  const rows = await rowsOf(page, '.place-slate .ps-room');
  expect(rows).toEqual(["CFO's office"]);
  // 日子時刻還在畫面上，不被切掉。
  await expect(page.locator('.place-slate .ps-when')).toContainText('22:49');
});

// 裁定 3：訪談來電資訊「委託人・26｜歲・財務分析｜師」：「26 歲」黏住，「財務分析師」不拆。
for (const w of [320, 360])
  for (const scale of [1, 1.25, 1.5])
    test(`訪談來電資訊不拆「26 歲」「財務分析師」（ep1 第 4 場・${w}・中文 ${scale * 100}%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 740 });
      await open(page, at('ep1', 4), 'zh', scale);
      await page
        .locator('.place-beat')
        .click({ timeout: 3000 })
        .catch(() => {});
      await expect(page.locator('.call .muted').first()).toBeVisible();
      const rows = await rowsOf(page, '.call .muted');
      for (const word of ['26 歲', '財務分析師'])
        expect(
          rows.some((r) => r.includes(word)),
          rows.join('｜'),
        ).toBe(true);
    });
