/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 冷開場 22:49 的定場鏡頭（RD-ART-0505，31 樓財務長辦公室）：手機戲裡的一格，接法和其他有底圖的場一樣——
 * 先定場（圖＋左下場記，圖沒解碼完純黑），再把那一格的字當旁白字幕放在同一張圖上。
 * 冷開場整段沒有黃（設定集 11.5）：場記的短槓是灰的、主按鈕是白框。
 * 淺色主題也一樣是夜：手機外面是鏡頭層的黑（設計師 v93 審查）。
 */
const STEP_DOOR = 9;
const STEP_2249 = 10;

async function open(page: Page, step: number, lang: 'zh' | 'en' = 'zh', scale = 1) {
  await page.goto('/');
  await page.evaluate(
    ([step, lang, scale]) => {
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { voScale: scale }, version: 1 }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene: 0,
            step,
            choices: { 'cold-open': { 3: 0, 6: 1 } },
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [step, lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

const tickColor = (page: Page) =>
  page.locator('.place-slate').evaluate((e) => getComputedStyle(e, '::before').backgroundColor);

for (const lang of ['zh', 'en'] as const)
  test(`22:49 是 31 樓的底圖：定場場記讀燈組、沒有黃，之後旁白一句一張字幕（${lang}）`, async ({
    page,
  }, info) => {
    await open(page, STEP_2249, lang);
    const plate = page.locator('.plate-host .scene-plate');
    await expect(plate).toHaveAttribute('data-plate', '31f-2249');
    await expect(plate).toHaveAttribute('data-rig', 'ep1-31f-fri');
    await expect(plate).toHaveAttribute('data-kelvin', '4100');
    await expect(plate).toHaveAttribute('data-state', 'ok');
    const phone = info.project.name === 'chromium';
    await expect(plate.locator('.plate-bg')).toHaveAttribute('src', phone ? /phone/ : /desktop/);

    const slate = page.locator('.place-slate');
    await expect(slate).toBeVisible();
    await expect(slate).toContainText(lang === 'zh' ? '財務長辦公室' : "CFO's office");
    await expect(slate).toContainText('22:49');
    await expect(slate).toContainText('4100K');
    await expect(page.locator('.place-tbd')).toHaveCount(0);
    // 冷開場沒有黃：短槓是場記灰（--cine-muted），畫面的手還是冷開場（字卡不把黃還給主按鈕）。
    expect(await tickColor(page)).toBe('rgb(139, 149, 163)');
    await expect(page.locator('html')).toHaveAttribute('data-hand', 'coldopen');

    // 切進那一格：同一張圖（不黑一下），字幕卡在下三分之一，一張一句。
    await page.locator('.place-beat').click();
    const card = page.locator('.scene.plated > .sub-card.narration');
    await expect(card).toBeVisible();
    await expect(plate).toHaveAttribute('data-state', 'ok');
    await expect(card).toContainText(lang === 'zh' ? '沃斯倒在辦公桌旁的地毯上。' : 'Voss is on');
    const view = page.viewportSize()!;
    expect((await card.boundingBox())!.y / view.height).toBeGreaterThan(0.5);
    const next = page.locator('.scene.plated .sub-actions .primary');
    // 主按鈕是白框（冷開場不出現黃），不是螢光筆黃。
    await page.mouse.move(0, 0);
    const bg = await next.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toMatch(/rgb\((255, 208, 46|244, 197, 61)\)/);
    // 白框底下墊玻璃（和字幕框同一層），暗圖上讀得到：不是透明的。
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // 翻完這一格的卡，下一格（23:01 大廳閘門）沒有底圖：回到黑底字卡，圖收掉。
    const seen: string[] = [];
    for (let i = 0; i < 6 && (await card.count()); i++) {
      seen.push((await card.innerText()).trim());
      await next.click();
    }
    expect(seen.length).toBeGreaterThan(1);
    await expect(page.locator('.cine .cine-text')).toContainText(
      lang === 'zh' ? '大廳閘門' : 'The lobby gate',
    );
    await expect(page.locator('.plate-host')).toHaveCount(0);
  });

test('等 31 樓的底圖時整格純黑：沒有場記，圖到了才放', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/31f-2249[^/]*\.jpg/, async (r) => {
    await gate;
    await r.continue();
  });
  await open(page, STEP_2249);
  await expect(page.locator('.place-beat.waiting')).toBeVisible();
  await expect(page.locator('.place-slate')).toHaveCount(0);
  expect(
    await page.locator('.place-beat').evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(0, 0, 0)');
  release();
  await expect(page.locator('.place-slate')).toBeVisible();
  await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-state', 'ok');
});

for (const scheme of ['light', 'dark'] as const)
  test(`冷開場在${scheme === 'light' ? '淺' : '深'}色主題也是夜：手機外面是鏡頭層的黑`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, STEP_DOOR);
    const stage = page.locator('.phone-stage');
    await expect(stage).toBeVisible();
    expect(await stage.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(6, 8, 11)');
    // 門口那一格是黑底：「推開門」的字是亮的（淺色主題的墨色字放在黑底上讀不到）。
    const door = page.getByRole('button', { name: '推開門' });
    expect(await door.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(231, 234, 238)');
  });

/**
 * 字幕框和按鈕不蓋獎盃和手（設計師 #316 審查 1）。主體框寫在 plates.json（以 2249-*.jpg 量的比例）。
 * 門檻（看不到＝跑出視窗＋被字幕框、按鈕蓋住）：獎盃 0、手指 0；整隻手（手背＋手指）最多 45%，也就是最少剩手指。
 */
const SIZES = [
  [1440, 900],
  [1366, 768],
  [412, 915],
  [360, 740],
  [844, 390],
] as const;

async function hidden(page: Page) {
  return page.evaluate(() => {
    type Box = { l: number; t: number; r: number; b: number };
    const overlap = (a: Box, b: Box) =>
      Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
      Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const host = document.querySelector('.plate-host .scene-plate') as HTMLElement;
    const stage = document.querySelector('.plate-host .plate-stage')!.getBoundingClientRect();
    const subjects = JSON.parse(host.dataset.subjects!) as {
      id: string;
      box: [number, number, number, number];
      cover: number;
    }[];
    const view = { l: 0, t: 0, r: innerWidth, b: innerHeight };
    const ui = [
      ...document.querySelectorAll('.cold-plated > .sub-card, .cold-plated > .sub-actions'),
    ]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
    return subjects.map((s) => {
      const a = {
        l: stage.left + s.box[0] * stage.width,
        t: stage.top + s.box[1] * stage.height,
        r: stage.left + s.box[2] * stage.width,
        b: stage.top + s.box[3] * stage.height,
      };
      const seen = {
        l: Math.max(a.l, 0),
        t: Math.max(a.t, 0),
        r: Math.min(a.r, view.r),
        b: Math.min(a.b, view.b),
      };
      const vis = overlap(a, view) - ui.reduce((n, u) => n + overlap(seen, u), 0);
      const share = 1 - Math.max(0, vis) / ((a.r - a.l) * (a.b - a.t));
      return { id: s.id, cover: s.cover, hidden: Math.round(share * 1000) / 1000 };
    });
  });
}

for (const [w, h] of SIZES)
  test(`字幕框和按鈕不蓋獎盃和手：${w}×${h}，中英，字級 100／125%，每一張卡`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    await page.setViewportSize({ width: w, height: h });
    for (const lang of ['zh', 'en'] as const)
      for (const scale of [1, 1.25]) {
        await open(page, STEP_2249, lang, scale);
        await page.locator('.place-beat').click();
        const card = page.locator('.cold-plated > .sub-card');
        await expect(card).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const next = page.locator('.cold-plated .sub-actions .primary');
        for (let i = 0; i < 6 && (await card.count()); i++) {
          const text = (await card.innerText()).trim();
          for (const r of await hidden(page))
            expect(
              r.hidden,
              `${lang} ${scale} 第${i + 1}張「${text}」${r.id} 看不到的比例`,
            ).toBeLessThanOrEqual(r.cover + 0.001);
          await next.click();
          await expect
            .poll(async () => ((await card.count()) ? (await card.innerText()).trim() : ''))
            .not.toBe(text);
        }
      }
  });

test('淺色主題下冷開場的字幕框也是深色玻璃、鏡頭層的字（和深色主題一樣）', async ({ page }) => {
  const look = async (scheme: 'light' | 'dark') => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, STEP_2249);
    await page.locator('.place-beat').click();
    const card = page.locator('.cold-plated > .sub-card');
    await expect(card).toBeVisible();
    return card.evaluate((e) => {
      const tx = e.querySelector('.tx')!;
      return [getComputedStyle(e).backgroundColor, getComputedStyle(tx).color];
    });
  };
  expect(await look('light')).toEqual(await look('dark'));
});

/** 字幕卡實際排出來的每一行（量每個字的位置，換行就是下一行）。 */
const cardRows = (page: Page) =>
  page.locator('.cold-plated > .sub-card .tx').evaluate((tx) => {
    const r = document.createRange();
    const out: string[] = [];
    let cur = '';
    let top: number | null = null;
    const walker = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.textContent!;
      for (let i = 0; i < s.length; i++) {
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rc = r.getClientRects()[0];
        if (rc && top !== null && rc.top > top + 4) {
          out.push(cur);
          cur = '';
        }
        if (rc) top = rc.top;
        cur += s[i];
      }
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  });

// 體驗評測 v93 關卡 2：桌機 125／150% 把「Nothing.」併進下一句；320 英文 150% 切成 7 張、"on his cuff and" 結尾、
// "Ethan kneels" 單獨一張；360 中文 125%「沾了／血」。每個寬度、中英、三種字級，一張一張讀出來看。
for (const [w, h] of [
  [1920, 1080],
  [1530, 860],
  [1440, 900],
  [1100, 700],
  [412, 915],
  [360, 740],
  [320, 640],
] as const)
  test(`22:49 字幕怎麼分張、怎麼換行：${w}×${h}，中英，字級 100／125／150%`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    await page.setViewportSize({ width: w, height: h });
    for (const lang of ['zh', 'en'] as const)
      for (const scale of [1, 1.25, 1.5]) {
        await open(page, STEP_2249, lang, scale);
        await page.locator('.place-beat').click();
        const card = page.locator('.cold-plated > .sub-card');
        await expect(card).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const cards: string[][] = [];
        for (let i = 0; i < 10 && (await card.count()); i++) {
          const text = (await card.innerText()).trim();
          cards.push(await cardRows(page));
          await page.locator('.cold-plated .sub-actions .primary').click();
          await expect
            .poll(async () => ((await card.count()) ? (await card.innerText()).trim() : ''))
            .not.toBe(text);
        }
        const at = `${w} ${lang} ${scale * 100}%`;
        // 拼回來是整段原文：沒有漏字。
        expect(cards.flat().join(lang === 'zh' ? '' : ' '), at).toBe(
          lang === 'zh'
            ? '沃斯倒在辦公桌旁的地毯上。伊森跪下去摸他的脖子，摸不到脈搏。他站起來的時候，袖口沾了血，手裡多了一座水晶獎盃。'
            : 'Voss is on the carpet beside his desk. Ethan kneels and feels for a pulse at the neck. Nothing. When he stands, there is blood on his cuff and a crystal trophy in his hand.',
        );
        for (const rows of cards) {
          const t = rows.join(' ');
          expect(rows.length, `${at}「${t}」`).toBeLessThanOrEqual(2);
          // 「Nothing.」接在前一句後面，不和下一句同一張。
          expect(t, at).not.toMatch(/Nothing\. \S/);
          if (lang === 'en') {
            for (const r of rows)
              expect(r, `${at} 行尾是虛詞`).not.toMatch(
                /\b(and|or|but|a|an|the|of|on|in|at|to|for|with|by|from|his)$/,
              );
            expect(t.split(' ').length, `${at}「${t}」太短`).toBeGreaterThanOrEqual(3);
          } else {
            for (const r of rows.slice(1))
              expect(r, `${at} 行首`).not.toMatch(/^[，。、；：！？旁上下裡的了著過]/u);
            expect(t, at).not.toMatch(/沾了 血|袖口沾 了/);
          }
        }
        // 最窄的手機加 150% 也不切得比這更碎（英文 6 張、中文 5 張）。
        expect(cards.length, at).toBeLessThanOrEqual(lang === 'en' ? 6 : 5);
      }
  });

// 設計師 v93 第二道關卡裁定二：定場場記不蓋底圖的主體（手指、手、獎盃）；左下會蓋到就改放左上，不碰「選單」。
for (const [w, h] of [
  [412, 915],
  [360, 740],
  [320, 640],
] as const)
  for (const lang of ['zh', 'en'] as const)
    test(`22:49 定場場記不蓋主體：${w}×${h}（${lang}）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
      await page.setViewportSize({ width: w, height: h });
      await open(page, STEP_2249, lang);
      const slate = page.locator('.place-slate');
      await expect(slate).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const box = (r: DOMRect) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
        const host = document.querySelector('.plate-host .scene-plate') as HTMLElement;
        const stage = document.querySelector('.plate-host .plate-stage')!.getBoundingClientRect();
        const subjects = (
          JSON.parse(host.dataset.subjects!) as { id: string; box: number[] }[]
        ).map((s) => ({
          id: s.id,
          l: stage.left + s.box[0] * stage.width,
          t: stage.top + s.box[1] * stage.height,
          r: stage.left + s.box[2] * stage.width,
          b: stage.top + s.box[3] * stage.height,
        }));
        return {
          slate: box(document.querySelector('.place-slate')!.getBoundingClientRect()),
          menu: box(document.querySelector('.menu-toggle')!.getBoundingClientRect()),
          subjects,
          pos: (document.querySelector('.place-slate') as HTMLElement).dataset.pos ?? 'bottom',
        };
      });
      type B = { l: number; t: number; r: number; b: number };
      const meet = (a: B, b: B) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      expect(m.subjects.length).toBeGreaterThan(0);
      for (const s of m.subjects) expect(meet(m.slate, s), `場記蓋到 ${s.id}`).toBe(false);
      expect(meet(m.slate, m.menu), '場記碰到選單').toBe(false);
      expect(m.slate.t).toBeGreaterThanOrEqual(0);
      expect(m.slate.r).toBeLessThanOrEqual(w);
      // 手機上 22:49 的主體在下三分之一：場記在左上，左緣 16px。
      expect(m.pos).toBe('top');
      expect(m.slate.l).toBeCloseTo(16, 0);
    });
