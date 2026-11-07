/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
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
    await expect(card).toContainText(
      lang === 'zh' ? '沃斯倒在地毯上，就在辦公桌旁。' : 'Voss is on',
    );
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
  // 手機橫拿（第二道關卡 a26de2b 第 2 項：844×390 中文 150%「沃斯倒在地毯上，」「他站起來的時候，」排成 3 行）。
  [844, 390],
  [863, 360],
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
            ? '沃斯倒在地毯上，就在辦公桌旁。伊森跪下去摸他的脖子，摸不到脈搏。他站起來的時候，袖口沾了血，手裡多了一座水晶獎盃。'
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
            // 行尾不留虛詞、代名詞（第二道關卡 e771fcf 第 3 項：「沃斯倒在｜辦公桌旁」）。
            for (const r of rows.slice(0, -1))
              expect(r, `${at} 行尾`).not.toMatch(
                /[的之與和及或在於對把被為從到以而並是了著過沒不又也都就還再很我你他她它]$/u,
              );
            expect(t, at).not.toMatch(/沾了 血|袖口沾 了/);
          }
        }
        // 最窄的手機加 150% 也不切得比這更碎（英文 6 張、中文 5 張）。手機橫拿讓開門縫光以後卡只剩 270px 上下，
        // 英文 150% 要 8 張，不在這條上限內（關卡沒有判它）。
        if (h > 520 || lang === 'zh')
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

test('冷開場的鎖定畫面沒有黃：左上光暈是螢幕的冷灰藍（設計師 v93 第二道關卡裁定三-1）', async ({
  page,
}) => {
  // 第 3 格（step 2）是葛蘭特的通知，出現在鎖定畫面上。
  await open(page, 2);
  const lock = page.locator('.phone .lock');
  await expect(lock).toBeVisible();
  const bg = await lock.evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(bg).not.toMatch(/244, 197, 61|255, 208, 46/);
  expect(bg).toContain('185, 204, 255');
});

/** 黑底的鏡頭層（集名卡、幕卡、日卡、定場）上，淺色主題的選單鈕和深色主題的一樣（設計師 v93 第二道關卡裁定三-5）。 */
test('集名卡和定場上的選單鈕：淺色主題也是深色那一款', async ({ page }) => {
  const look = async (scheme: 'light' | 'dark', step: number, scene: number) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.evaluate(
      ([scene, step]) =>
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
        ),
      [scene, step] as const,
    );
    await page.reload();
    await page.getByRole('button', { name: /^繼續/ }).first().click();
    await expect(page.locator('.act-stage')).toBeVisible();
    return page
      .locator('.menu-toggle')
      .evaluate((e) => [
        getComputedStyle(e).backgroundColor,
        getComputedStyle(e).color,
        getComputedStyle(e).borderTopColor,
      ]);
  };
  // 第 1 集第 1 場是集名卡（片頭卡）。
  expect(await look('light', 0, 1)).toEqual(await look('dark', 0, 1));
});

/**
 * 淺色場景切進黑底鏡頭層（地點字卡、集名卡…）的那一格，選單鈕就是深色款，不先白一下再淡過去
 * （第二道關卡 e771fcf 第 6 項：button 通用的顏色 transition 讓它停在淺色約 48ms、再花 180ms 淡成深色）。
 * 在淺色的審前桌面上掛一層 .act-stage（和地點字卡同一個 class），逐格讀選單鈕的底色。
 */
// 監獄來電（.call-screen）：設計師裁定 25376da，房間是鏡頭層，選單鈕一樣用深色款。
for (const layerClass of ['act-stage', 'cine call-screen'])
  test(`淺色場景切進鏡頭層（${layerClass}）：第一格選單鈕就是深色款，不淡過去`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => {
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
    await expect(page.locator('.taskbar')).toBeVisible();
    await expect(beat).toHaveCount(0);
    const menu = page.locator('.menu-toggle');
    // 回到淺色、選單鈕淡完。
    await expect.poll(() => menu.evaluate((e) => getComputedStyle(e).colorScheme)).not.toBe('dark');
    await page.waitForTimeout(600);
    const light = await menu.evaluate((e) => getComputedStyle(e).backgroundColor);
    const frames = await menu.evaluate(
      (e, cls) =>
        new Promise<string[]>((done) => {
          const layer = document.createElement('div');
          layer.className = cls;
          document.body.appendChild(layer);
          const out: string[] = [];
          const tick = () => {
            out.push(getComputedStyle(e).backgroundColor);
            if (out.length < 20) requestAnimationFrame(tick);
            else {
              layer.remove();
              done(out);
            }
          };
          tick();
        }),
      layerClass,
    );
    const dark = frames[frames.length - 1];
    expect(dark, '鏡頭層上選單鈕應該換成深色款').not.toBe(light);
    expect(frames, `每一格：${frames.join(' → ')}`).toEqual(frames.map(() => dark));
  });

/** 門縫光的方框（桌機、手機兩張圖）：直接讀 plates.json，舊版沒有這個欄位也照樣量。 */
const DOORS = (
  JSON.parse(readFileSync(new URL('../src/ui/plates/plates.json', import.meta.url), 'utf8')) as {
    plates: { id: string; clear: Record<'desktop' | 'phone', { box: number[] }[]> }[];
  }
).plates.find((p) => p.id === '31f-2249')!.clear;

/**
 * 22:49 的門縫光（plates.json clear）：主體先不蓋，再挑蓋門縫光最少的位置（設計師 e771fcf 舊問題裁定 2：≤5%）。
 * 桌機和手機橫向都做得到 0。直放手機門縫光從頂端一路到 0.68H、獎盃上緣在 0.73H，字幕卡一定橫過門縫：
 * 設計師裁定 v93 接受、v94 重算手機版構圖；上限暫定實測值＋2%，不准再變糟。
 */
for (const [w, h, max] of [
  [1920, 1080, 0.05],
  [1530, 860, 0.05],
  [1440, 900, 0.05],
  [1366, 768, 0.05],
  [1280, 720, 0.05],
  [1280, 800, 0.05],
  [1100, 700, 0.05],
  [863, 360, 0.05],
  [844, 390, 0.05],
  [412, 915, 0.23],
  [360, 740, 0.3],
  [320, 640, 0.35],
] as const)
  test(`22:49 字幕和按鈕不蓋門縫光（≤${max * 100}%）、不蓋主體、彼此不疊、換卡位置不跳：${w}×${h}，中英，字級 100／125／150%`, async ({
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
        const next = page.locator('.cold-plated .sub-actions .primary');
        const spots: string[] = [];
        for (let i = 0; i < 8 && (await card.count()); i++) {
          const text = (await card.innerText()).trim();
          const at = `${lang} ${scale * 100}% 第${i + 1}張「${text}」`;
          // 字幕卡和「繼續」不疊（第二道關卡 25376da 第 1 項：863×360「繼續」壓在字幕上）；記下卡的左緣、下緣。
          const lay = await page.evaluate(() => {
            const [c, a] = ['.cold-plated > .sub-card', '.cold-plated > .sub-actions'].map((q) =>
              document.querySelector(q)!.getBoundingClientRect(),
            );
            const x = Math.max(0, Math.min(c.right, a.right) - Math.max(c.left, a.left));
            const y = Math.max(0, Math.min(c.bottom, a.bottom) - Math.max(c.top, a.top));
            return {
              both: x * y,
              below: a.top - c.bottom,
              beside: a.left - c.right,
              spot: `${Math.round(c.left)},${Math.round(c.bottom)}`,
            };
          });
          expect(lay.both, `${at} 字幕卡和「繼續」重疊的面積`).toBe(0);
          // 按鈕在卡下方、間距 ≥8 px（設計師裁定 25376da 第 4 項）；手機橫拿是設計師定的右欄版面，在卡右邊、間距 ≥8 px。
          if (h > 520)
            expect(lay.below, `${at} 「繼續」在字幕卡下方的間距`).toBeGreaterThanOrEqual(7.5);
          else
            expect(
              Math.max(lay.below, lay.beside),
              `${at} 「繼續」和字幕卡的間距`,
            ).toBeGreaterThanOrEqual(7.5);
          spots.push(lay.spot);
          for (const r of await hidden(page))
            expect(r.hidden, `${at} ${r.id} 看不到的比例`).toBeLessThanOrEqual(r.cover + 0.001);
          const lit = await page.evaluate(
            (boxes) => {
              type Box = { l: number; t: number; r: number; b: number };
              const ov = (a: Box, b: Box) =>
                Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
                Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
              const st = document
                .querySelector('.plate-host .plate-stage')!
                .getBoundingClientRect();
              const ui = [
                ...document.querySelectorAll(
                  '.cold-plated > .sub-card, .cold-plated > .sub-actions',
                ),
              ]
                .map((e) => e.getBoundingClientRect())
                .filter((r) => r.width && r.height)
                .map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
              return Math.max(
                ...boxes.map(({ box }) => {
                  const d = {
                    l: st.left + box[0] * st.width,
                    t: st.top + box[1] * st.height,
                    r: st.left + box[2] * st.width,
                    b: st.top + box[3] * st.height,
                  };
                  return ui.reduce((n, u) => n + ov(d, u), 0) / ((d.r - d.l) * (d.b - d.t));
                }),
              );
            },
            DOORS[w <= 767 ? 'phone' : 'desktop'],
          );
          expect(lit, `${at} 門縫光被蓋掉的比例`).toBeLessThanOrEqual(max);
          await next.click();
          await expect
            .poll(async () => ((await card.count()) ? (await card.innerText()).trim() : ''))
            .not.toBe(text);
        }
        // 同一個鏡頭裡字幕不跑來跑去：每一張卡的左緣、下緣都一樣（第 2 項：1280 英文 150% 第 1 張在獎盃上方、第 2 張跳到右下）。
        expect(
          new Set(spots).size,
          `${lang} ${scale * 100}% 每張卡的位置：${spots.join(' ／ ')}`,
        ).toBe(1);
      }
  });

/**
 * 冷開場 ③ 23:14 港邊公車亭（v94，場景光影 #3 定稿：桌機 v4、手機 v6）。
 * 第一格定場上 a 版（公車還沒來），翻完字幕回到手機看訊息被收回；
 * 最後一格同一個鏡頭、不再定場，從 a 線性淡到 b 版（公車開走），3 秒；減少動態時直接 b。
 */
const STEP_2314 = 12;
const STEP_2314_BUS = 14;

for (const lang of ['zh', 'en'] as const)
  test(`23:14 是港邊公車亭的底圖：定場 a 版，收回之後同鏡頭淡到 b 版（${lang}）`, async ({
    page,
  }, info) => {
    await open(page, STEP_2314, lang);
    const plate = page.locator('.plate-host .scene-plate');
    await expect(plate).toHaveAttribute('data-plate', 'shelter-2314a');
    await expect(plate).toHaveAttribute('data-rig', 'ep1-harbour-shelter-fri');
    await expect(plate).toHaveAttribute('data-kelvin', '4100');
    await expect(plate).toHaveAttribute('data-state', 'ok');
    const phone = info.project.name === 'chromium';
    await expect(plate.locator('.plate-bg')).toHaveAttribute('src', phone ? /phone/ : /desktop/);
    const slate = page.locator('.place-slate');
    await expect(slate).toContainText(lang === 'zh' ? '公車亭' : 'bus shelter');
    await expect(slate).toContainText('23:14');
    await expect(slate).toContainText('4100K');
    expect(await tickColor(page)).toBe('rgb(139, 149, 163)');

    await page.locator('.place-beat').click();
    const card = page.locator('.scene.plated > .sub-card.narration');
    const next = page.locator('.scene.plated .sub-actions .primary');
    await expect(card).toContainText(
      lang === 'zh' ? '港邊的公車亭。' : 'A bus shelter by the harbor.',
    );
    const seen: string[] = [];
    for (let i = 0; i < 6 && (await card.count()); i++) {
      seen.push((await card.innerText()).trim());
      await next.click();
    }
    // 一句一張：中英都是兩句兩張（設計師 #330 審查 3：英文第二句兩行放得下，不拆）。
    expect(seen.length).toBe(2);
    // 收回：回到手機，底圖收掉。
    await expect(
      page.getByText(lang === 'zh' ? '此訊息已被收回' : 'This message was unsent'),
    ).toBeVisible();
    await expect(page.locator('.plate-host')).toHaveCount(0);
    await page.getByRole('button', { name: lang === 'zh' ? '繼續' : 'Continue' }).click();

    // 最後一格：不再定場，a 在下、b 在上淡進來。
    await expect(page.locator('.place-beat')).toHaveCount(0);
    const plates = page.locator('.plate-host .scene-plate');
    await expect(plates).toHaveCount(2);
    await expect(plates.nth(0)).toHaveAttribute('data-plate', 'shelter-2314a');
    await expect(plates.nth(1)).toHaveAttribute('data-plate', 'shelter-2314b');
    await expect(plates.nth(1)).toHaveAttribute('data-fade', '');
    await expect(card).toContainText(
      lang === 'zh' ? '公車進站，又開走了。' : 'A bus pulls in and pulls away.',
    );
    const top = plates.nth(1).locator('.plate-stage');
    const dur = await top.evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(dur).toBe('3s');
    await expect
      .poll(() => top.evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 6000 })
      .toBe(1);
  });

/** 只留底圖層（字幕、按鈕、選單、場記都藏起來）的整頁平均亮度（0–255）：截圖交給瀏覽器解碼再算。 */
async function plateLuma(page: Page) {
  const png = (await page.screenshot({ scale: 'css' })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }, png);
}
const onlyPlate = (page: Page) =>
  page.addStyleTag({
    content:
      '* { visibility: hidden !important; } .plate-host, .plate-host * { visibility: visible !important; }',
  });

test('23:14 a → b 淡入中間不先暗下去：每一格的亮度都在 a、b 之間', async ({ page }) => {
  // a：第一格（定場點掉、字幕出來、圖亮好）。
  await open(page, STEP_2314);
  await page.locator('.place-beat').click();
  await expect(page.locator('.plate-host .plate-stage')).toHaveCSS('opacity', '1');
  await onlyPlate(page);
  const a = await plateLuma(page);
  // 淡入那一格：a 在下面硬切回來，b 疊在上面從 0 淡到 1（設計師 #330 審查 1：中段量到手機 24、桌機 15，比 a、b 都暗一半）。
  await open(page, STEP_2314_BUS);
  await onlyPlate(page);
  const plates = page.locator('.plate-host .scene-plate');
  await expect(plates).toHaveCount(2);
  await expect(plates.nth(0)).toHaveAttribute('data-state', 'ok');
  const top = plates.nth(1).locator('.plate-stage');
  // 淡入是 CSS transition：抓到它就停住，逐點拉到 0、¼、½、¾ 量（不靠截圖的速度追 3 秒）。
  await expect
    .poll(() => top.evaluate((e) => e.getAnimations().length), { timeout: 3000 })
    .toBeGreaterThan(0);
  const mid: { o: number; y: number }[] = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const o = await top.evaluate((e, f) => {
      for (const an of e.getAnimations()) {
        an.pause();
        const d = Number(an.effect?.getComputedTiming().duration ?? 0);
        an.currentTime = f * d;
      }
      return Number(getComputedStyle(e).opacity);
    }, f);
    mid.push({ o, y: await plateLuma(page) });
  }
  expect(mid[2].o).toBeCloseTo(0.5, 1);
  await top.evaluate((e) => e.getAnimations().forEach((an) => an.finish()));
  await expect(top).toHaveCSS('opacity', '1');
  const b = await plateLuma(page);
  const lo = Math.min(a, b) - 1;
  const hi = Math.max(a, b) + 1;
  for (const m of mid)
    expect(
      m.y,
      `淡入 ${m.o.toFixed(2)}：a ${a.toFixed(1)}、b ${b.toFixed(1)}`,
    ).toBeGreaterThanOrEqual(lo);
  for (const m of mid) expect(m.y).toBeLessThanOrEqual(hi);
});

test('23:14 公車開走：減少動態時不淡入，直接是 b 版', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, STEP_2314_BUS);
  const plates = page.locator('.plate-host .scene-plate');
  await expect(plates).toHaveCount(1);
  await expect(plates).toHaveAttribute('data-plate', 'shelter-2314b');
  await expect(page.locator('.place-beat')).toHaveCount(0);
  await expect(page.locator('.scene.plated > .sub-card.narration')).toContainText('公車進站');
});

for (const [w, h] of SIZES)
  test(`23:14 字幕框和按鈕不蓋手機和手：${w}×${h}，中英，字級 100／125%，每一張卡`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    await page.setViewportSize({ width: w, height: h });
    for (const lang of ['zh', 'en'] as const)
      for (const scale of [1, 1.25])
        for (const step of [STEP_2314, STEP_2314_BUS]) {
          await open(page, step, lang, scale);
          if (step === STEP_2314) await page.locator('.place-beat').click();
          const card = page.locator('.cold-plated > .sub-card');
          await expect(card).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          // 淡入結束才量（a、b 主體框一樣）。
          if (step === STEP_2314_BUS)
            await expect
              .poll(() =>
                page.evaluate(() =>
                  [...document.querySelectorAll('.plate-host .plate-stage')].every(
                    (e) => Number(getComputedStyle(e).opacity) === 1,
                  ),
                ),
              )
              .toBe(true);
          const next = page.locator('.cold-plated .sub-actions .primary');
          // 一個鏡頭只有一個字幕位置（設計師 #330 審查 2）：每張卡的左右緣、下緣都一樣。
          const spots = new Set<string>();
          for (let i = 0; i < 6 && (await card.count()); i++) {
            const text = (await card.innerText()).trim();
            const bx = (await card.boundingBox())!;
            spots.add(
              `${Math.round(bx.x)}–${Math.round(bx.x + bx.width)}／${Math.round(bx.y + bx.height)}`,
            );
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
          expect([...spots], `${lang} ${scale} step ${step}`).toHaveLength(1);
        }
  });
