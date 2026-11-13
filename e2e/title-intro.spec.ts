/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PAPER = JSON.parse(
  readFileSync(new URL('../src/ui/intro/paper-rows.json', import.meta.url), 'utf8'),
) as Record<
  'desktop' | 'phone',
  { size: [number, number]; rows: Record<'number' | 'zh' | 'en', number[][] | null>[] }
>;

/**
 * 片頭 40 秒（設定集 11.1）：冷開場之後、第一幕之前。七個鏡頭依序，0:38 是原本的集名卡（幕卡）。
 * 第二次播起才有「跳過」，跳到集名卡；每一集分開記。讀檔讀到片頭之後不播。全片第一道黃在 0:29。
 * 正式圖到齊，預設播。開發設定 rd.dev.intro＝'0' 關掉（其他測試只看片頭前後時用）。
 */
const ORDER = [
  ['paper', 10000],
  ['blind', 7000],
  ['court', 6000],
  ['witness', 6000],
  ['lucas', 5000],
  ['mark', 4000],
] as const;

async function open(
  page: Page,
  { episode = 'ep1', scene = 1, seen = [] as string[], lang = 'zh', on = true } = {},
) {
  // 時鐘一開始就停住，之後只靠快轉走（真實時間不算進片頭的時間軸）。
  await page.clock.install({ time: 1_800_000_000_000 });
  await page.clock.pauseAt(1_800_000_000_000 + 1000);
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, seen, lang, on]) => {
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem('rd.dev.intro', on ? '1' : '0');
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({
          state: { introSeen: Object.fromEntries((seen as string[]).map((e) => [e, true])) },
          version: 1,
        }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode,
            scene,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [episode, scene, seen, lang, on] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  // 紙的三張底圖都解完才畫（不會半張），之後的量測才有東西可以量。
  if (on && scene === 1) await page.locator('.ti-paper svg').waitFor();
}

/** 片頭裡現在看得到的黃（--hl 的淺深兩值），連 ::before／::after、SVG 的填色一起看。 */
const yellows = (page: Page) =>
  page.locator('.title-intro').evaluate((root) => {
    const hl = /rgba?\((255, 208, 46|244, 197, 61)/;
    const hits: string[] = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      // 在 display:none 的祖先底下（例如桌機上的手機版 SVG）不算。
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest('mask, defs')) continue;
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        if (pseudo && cs.content === 'none') continue;
        const svg = !pseudo && el instanceof SVGElement;
        if (
          hl.test(cs.backgroundColor) ||
          hl.test(cs.color) ||
          hl.test(cs.borderTopColor) ||
          (svg && hl.test(cs.fill))
        )
          hits.push(`${el.getAttribute('class')}${pseudo ?? ''}`);
      }
    }
    return hits;
  });

test('預設播（正式圖到齊）；開發設定 rd.dev.intro＝0 或 ?intro=0 關掉，直接是集名卡', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => localStorage.removeItem('rd.dev.intro'));
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'paper');

  await open(page, { on: false });
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();
  await expect(page.locator('.title-intro')).toHaveCount(0);

  await page.evaluate(() => localStorage.removeItem('rd.dev.intro'));
  await page.goto('/?intro=0');
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();
  await expect(page.locator('.title-intro')).toHaveCount(0);
});

test('第一次播：七個鏡頭照時間軸，沒有跳過；0:38 是集名卡，之後切進第一幕', async ({ page }) => {
  await open(page);
  const intro = page.locator('.title-intro');
  await expect(intro).toHaveAttribute('data-episode', 'ep1');
  await expect(page.getByRole('button', { name: '跳過' })).toHaveCount(0);
  for (const [shot, ms] of ORDER) {
    await expect(intro).toHaveAttribute('data-shot', shot);
    // 鏡頭還沒播完就不換。
    await page.clock.fastForward(ms - 200);
    await expect(intro).toHaveAttribute('data-shot', shot);
    await page.clock.fastForward(200);
  }
  await expect(intro).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();
  // 看過了：記在設定裡（第二次起可以跳過）。
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lawgame-settings')!).state.introSeen,
    ),
  ).toEqual({ ep1: true });
});

test('第二次播起有「跳過」：跳到集名卡，不跳過集名；每一集分開記', async ({ page }) => {
  await open(page, { seen: ['ep1'] });
  await page.clock.fastForward(3000);
  await page.getByRole('button', { name: '跳過' }).click();
  await expect(page.locator('.title-intro')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();

  // 第一集看過，第二集還沒：第二集的片頭沒有跳過。
  await open(page, { episode: 'ep2', seen: ['ep1'] });
  await expect(page.locator('.title-intro')).toHaveAttribute('data-episode', 'ep2');
  await expect(page.getByRole('button', { name: '跳過' })).toHaveCount(0);
});

test('英文：跳過鈕是英文，標準字仍是「合理懷疑」四個字', async ({ page }) => {
  await open(page, { seen: ['ep1'], lang: 'en' });
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  for (const [shot, ms] of ORDER.slice(0, -1)) {
    await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', shot);
    await page.clock.fastForward(ms);
  }
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'mark');
  await expect(page.locator('.ti-mark h1')).toHaveText('合理懷疑');
});

test('第二集換 0:10 和 0:23：百葉窗是第二集的圖（亮另一條縫），證人席是派單 App 的提醒', async ({
  page,
}) => {
  await open(page, { episode: 'ep2' });
  const intro = page.locator('.title-intro');
  await page.clock.fastForward(10000);
  await expect(intro).toHaveAttribute('data-shot', 'blind');
  // 第二集自己的正式圖（第 13 縫亮，場景光影 #3 11-07 重算），不是第一集那張。
  const srcs = await page
    .locator('.ti-blinds img')
    .evaluateAll((im) => im.map((x) => (x as HTMLImageElement).currentSrc));
  expect(srcs.length).toBe(2);
  for (const u of srcs) expect(u).toMatch(/blind-ep2-/);
  await page.clock.fastForward(7000);
  await expect(intro).toHaveAttribute('data-shot', 'court');
  await page.clock.fastForward(6000);
  await expect(intro).toHaveAttribute('data-shot', 'witness');
  await expect(page.locator('.ti-note')).toContainText('您已連續上線 10 小時');
  // 他自己按掉的（不是藏、刪、默）：沒有黑條，提醒卡往右滑出畫面，原位留「已略過」和時間，沒有黃。
  await expect(page.locator('.ti-msg-bar')).toHaveCount(0);
  await expect(page.locator('.ti-bubble')).toHaveCount(0);
  // 動畫走真實時間（假時鐘停著，鏡頭不會換）：等它自己滑完。
  const vw = page.viewportSize()!.width;
  await expect
    .poll(async () => (await page.locator('.ti-note').boundingBox())!.x, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(vw);
  await expect(page.locator('.ti-skipped')).toHaveText('已略過18:09');
  await expect(page.locator('.ti-skipped')).toHaveCSS('opacity', '1');
  expect(await yellows(page)).toEqual([]);

  await open(page, { episode: 'ep1' });
  await page.clock.fastForward(10000);
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'blind');
  for (const u of await page
    .locator('.ti-blinds img')
    .evaluateAll((im) => im.map((x) => (x as HTMLImageElement).currentSrc)))
    expect(u).toMatch(/blind-ep1-/);
  await page.clock.fastForward(7000);
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'court');
  await page.clock.fastForward(6000);
  await expect(page.locator('.ti-skipped')).toHaveCount(0);
  await expect(page.locator('.ti-bubble')).toContainText('我們私下解決');
  await expect(page.locator('.ti-msg-bar')).toContainText('此訊息已被收回');
});

test('一格一黃：0:00–0:23 沒有黃，0:29 第一道黃（螢光），0:34 只有標準字的黃線', async ({
  page,
}) => {
  await open(page);
  const intro = page.locator('.title-intro');
  for (const [shot, ms] of ORDER) {
    await expect(intro).toHaveAttribute('data-shot', shot);
    // 每個鏡頭的動態都播完（黑條、螢光、黃線都已經出現）再量。
    await page.clock.fastForward(ms - 300);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    const hits = await yellows(page);
    if (shot === 'lucas') expect(hits).toEqual(['ti-hl29-ink']);
    else if (shot === 'mark') expect(hits).toEqual(['ti-hl']);
    else expect(hits, shot).toEqual([]);
    await page.clock.fastForward(300);
  }
});

test('讀檔讀到片頭之後：不播片頭', async ({ page }) => {
  await open(page, { scene: 2 });
  await expect(page.getByText('港灣大道一號，頂樓', { exact: false })).toBeVisible();
  await expect(page.locator('.title-intro')).toHaveCount(0);
});

test('減少動態：鏡頭不動、鏡頭之間不插黑格', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const anim = await page.locator('.ti-sheet').evaluate((e) => getComputedStyle(e).animationName);
  expect(anim).toBe('none');
  await page.clock.fastForward(10000 - 50);
  await expect(page.locator('.ti-shot.shot-paper')).toHaveCount(1);
  await page.clock.fastForward(60);
  await expect(page.locator('.ti-shot.shot-blind')).toHaveCount(1);
});

test('片頭期間看得到「選單」：打開時片頭暫停，關上接著播；Escape 也能開', async ({ page }) => {
  await open(page);
  const intro = page.locator('.title-intro');
  const menu = page.getByRole('button', { name: '選單' });
  await expect(menu).toBeVisible();
  // 選單鈕在片頭上面（點得到，不被片頭蓋住）。
  await page.clock.fastForward(4000);
  await menu.click();
  await expect(intro).toHaveAttribute('data-paused', '');
  // 選單開著：時間怎麼走都不換鏡頭。
  await page.clock.fastForward(20000);
  await expect(intro).toHaveAttribute('data-shot', 'paper');
  expect(
    await page.locator('.ti-sheet').evaluate((e) => getComputedStyle(e).animationPlayState),
  ).toContain('paused');
  await menu.click();
  await expect(intro).not.toHaveAttribute('data-paused');
  // 關上後接著播：紙這一格剩下 6 秒。
  await page.clock.fastForward(5800);
  await expect(intro).toHaveAttribute('data-shot', 'paper');
  await page.clock.fastForward(300);
  await expect(intro).toHaveAttribute('data-shot', 'blind');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '選單' })).toBeVisible();
  await expect(intro).toHaveAttribute('data-paused', '');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '選單' })).toHaveCount(0);
  await expect(intro).not.toHaveAttribute('data-paused');
});

test('0:05 黑條節奏：第 1 條蓋第 11 行，第 2、3 條各隔 333ms，其餘各隔 83ms；只蓋畫面裡有字的行', async ({
  page,
}) => {
  await open(page);
  const bars = await page.locator('.ti-bar').evaluateAll((bars) =>
    bars
      .map((b) => ({
        row: Number((b as SVGElement).dataset.row),
        at: parseFloat(getComputedStyle(b).animationDelay) * 1000,
      }))
      .sort((a, b) => a.at - b.at),
  );
  // 桌機和手機的機位不同，畫面裡有字的行數不同（空行、出框的行沒有黑條）；兩種都至少十來行。
  expect(bars.length).toBeGreaterThanOrEqual(12);
  expect(bars[0]).toEqual({ row: 11, at: 5000 });
  const delays = bars.map((b) => b.at);
  const gaps = delays.slice(1).map((d, i) => Math.round(d - delays[i]));
  expect(gaps).toEqual([333, 333, ...Array(bars.length - 3).fill(83)]);
  // 紅邊線之後空的那幾行（第 3、5、13 行）沒有黑條。
  for (const n of [3, 5, 13]) expect(bars.map((b) => b.row)).not.toContain(n);
  // 播完每一條都蓋滿整行（Chrome 結尾進度 0.9999…，steps(4) 曾停在 3/4）。
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  expect(
    new Set(
      await page
        .locator('.ti-bar, .ti-bar-hide')
        .evaluateAll((b) => b.map((x) => getComputedStyle(x).scale)),
    ),
  ).toEqual(new Set(['1']));
});

test('0:34 黃線：字的左側、6px、和四個字同高、距字 0.3 字（設定集 11.4）', async ({ page }) => {
  await open(page);
  for (const [, ms] of ORDER.slice(0, -1)) await page.clock.fastForward(ms);
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'mark');
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  const m = await page.locator('.ti-mark h1').evaluate((h) => {
    const chars = [...h.querySelectorAll('.ti-ch')].map((c) => c.getBoundingClientRect());
    const hl = h.querySelector('.ti-hl')!.getBoundingClientRect();
    return {
      fs: parseFloat(getComputedStyle(h).fontSize),
      left: Math.min(...chars.map((c) => c.left)),
      top: chars[0].top,
      bottom: chars[chars.length - 1].bottom,
      hl: { left: hl.left, right: hl.right, top: hl.top, bottom: hl.bottom, width: hl.width },
    };
  });
  expect(m.hl.width).toBeCloseTo(6, 0);
  expect(Math.abs(m.left - m.hl.right - 0.3 * m.fs)).toBeLessThan(1.5);
  expect(Math.abs(m.hl.top - m.top)).toBeLessThan(1.5);
  expect(Math.abs(m.hl.bottom - m.bottom)).toBeLessThan(1.5);
});

test('減少動態：第二集 0:23 提醒卡直接消失，「已略過」直接出現', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, { episode: 'ep2' });
  for (const ms of [10000, 7000, 6000]) await page.clock.fastForward(ms);
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'witness');
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await expect(page.locator('.ti-note')).toBeHidden();
  await expect(page.locator('.ti-skipped')).toBeVisible();
  // 沒有滑：卡留在原位，只是不見了。
  expect(await page.locator('.ti-note').evaluate((e) => getComputedStyle(e).transform)).toBe(
    'none',
  );
});

test('0:29 是正式圖（立牌和輪廓光在圖裡算好，設計師 11-07 PASS），不再疊 HTML 剪影', async ({
  page,
}) => {
  await open(page);
  for (const [, ms] of ORDER.slice(0, 4)) await page.clock.fastForward(ms);
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'lucas');
  await expect
    .poll(() =>
      page.locator('.shot-lucas .ti-plate img').evaluate((x) => (x as HTMLImageElement).currentSrc),
    )
    .toMatch(/court-0029/);
  await expect(page.locator('.ti-back-rim, .ti-back-body')).toHaveCount(0);
  // 螢光那一層和底圖同尺寸、同裁切，貼滿畫面，沒有別的框（曾經撞到冷開場手機框的 .phone 類名，手機上整格被蓋住）。
  const vp = page.viewportSize()!;
  // 推軌放大前（第 0 格）量。
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    }),
  );
  const hl = page.locator('.ti-hl29').filter({ visible: true });
  await expect(hl).toHaveCount(1);
  const box = (await hl.boundingBox())!;
  expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([
    0,
    0,
    vp.width,
    vp.height,
  ]);
  const look = await hl.evaluate((e) => {
    const cs = getComputedStyle(e);
    return [cs.position, cs.borderTopWidth, cs.backgroundColor];
  });
  expect(look).toEqual(['absolute', '0px', 'rgba(0, 0, 0, 0)']);
});

test('0:00 紙：三張同機位正式圖疊起來；英文介面用英文那張', async ({ page }) => {
  for (const lang of ['zh', 'en'] as const) {
    await open(page, { lang });
    const hrefs = await page
      .locator('.ti-paper image')
      .evaluateAll((im) => im.map((x) => x.getAttribute('href') ?? ''));
    const full = lang === 'en' ? /paper-full-en-/ : /paper-full-(desktop|phone)/;
    expect(hrefs.length).toBe(4);
    expect(hrefs[0]).toMatch(/paper-blank-/);
    expect(hrefs[1]).toMatch(/paper-numbers-/);
    expect(hrefs[2]).toMatch(full);
    // 黑條是紙上的墨：空白頁乘上墨的反射率。
    expect(hrefs[3]).toMatch(/paper-blank-/);
    const cam = (page.viewportSize()!.width <= 767 ? 'phone' : 'desktop') as string;
    for (const h of hrefs) expect(h).toContain(`-${cam}`);
  }
});

/** 紙上第 11 行的兩塊（行號、字）在畫面上的位置：照 paper-rows.json 和 cover 裁切算，往內縮一點。 */
function row11(vp: { width: number; height: number }, lang: 'zh' | 'en') {
  const cam = vp.width <= 767 ? 'phone' : 'desktop';
  const { size, rows } = PAPER[cam];
  const k = Math.max(vp.width / size[0], vp.height / size[1]);
  const [ox, oy] = [(vp.width - size[0] * k) / 2, (vp.height - size[1] * k) / 2];
  const box = (q: number[][], shrink: number) => {
    const xs = q.map((p) => ox + p[0] * k);
    const ys = q.map((p) => oy + p[1] * k);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const dy = (y1 - y0) * shrink;
    const x = Math.max(0, x0);
    return { x, y: y0 + dy, width: Math.min(vp.width, x1) - x, height: y1 - y0 - 2 * dy };
  };
  return { number: box(rows[10].number!, 0.1), text: box(rows[10][lang]!, 0.15) };
}

/** 畫面上一塊的亮度標準差（有字的地方高，空白的紙低）。截圖交給瀏覽器解碼再算。 */
async function ink(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    [c.width, c.height] = [img.width, img.height];
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const ys: number[] = [];
    for (let i = 0; i < d.length; i += 4)
      ys.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const m = ys.reduce((a, b) => a + b, 0) / ys.length;
    return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length);
  }, png);
}

test('0:00 紙三拍（設定集 11.1）：空白頁 → 行號（一拍二，每 83ms 一行）→ 全文整頁淡入；第 11 行停留 ≥2.5 秒才被黑條蓋', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const lang of ['zh', 'en'] as const) {
    await open(page, { lang });
    // 時間軸：行號每 2 格兩行，全文在行號亮完之後才淡入。
    const on = await page
      .locator('.ti-prow')
      .evaluateAll((r) =>
        r.map((x) => Math.round(parseFloat(getComputedStyle(x).animationDelay) * 1000)),
      );
    // 一拍二：底圖裡看得到的行號由上往下每 83ms 一行（設計師 11-07 更正）；出框的行跟著最近的那一行。
    const cam = page.viewportSize()!.width <= 767 ? 'phone' : 'desktop';
    const { size, rows } = PAPER[cam];
    const seen = rows.map((r) => {
      const q = r.number!;
      const [x, y] = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
      return x > 0 && x < size[0] && y > 0 && y < size[1];
    });
    const shown = on.filter((_, n) => seen[n]);
    expect(shown.length).toBeGreaterThanOrEqual(12);
    expect(shown).toEqual(shown.map((_, i) => 400 + i * 83));
    const [fullOn, fullFade] = await page.locator('.ti-full').evaluate((e) => {
      const cs = getComputedStyle(e);
      return [parseFloat(cs.animationDelay) * 1000, parseFloat(cs.animationDuration) * 1000];
    });
    expect(fullOn).toBe(Math.max(...on) + 83);
    expect(fullFade).toBeGreaterThanOrEqual(300);
    expect(fullFade).toBeLessThanOrEqual(400);
    const bar11 = await page
      .locator('.ti-bar[data-row="11"]')
      .evaluate((e) => parseFloat(getComputedStyle(e).animationDelay) * 1000);
    expect(bar11 - (fullOn + fullFade)).toBeGreaterThanOrEqual(2500);

    // 畫面上量：每一拍停住截圖，看第 11 行的行號、字那兩塊有沒有墨。
    const at = (t: number) =>
      page.evaluate((t) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
      }, t);
    const r = row11(page.viewportSize()!, lang);
    await at(200);
    const blank = { number: await ink(page, r.number), text: await ink(page, r.text) };
    // 第 2 拍中段：第 11 行的行號已亮，還沒有字。
    const on11 = on[10];
    await at(Math.round((on11 + fullOn) / 2));
    const mid = { number: await ink(page, r.number), text: await ink(page, r.text) };
    await at(fullOn + fullFade + 100);
    const after = { number: await ink(page, r.number), text: await ink(page, r.text) };
    expect(mid.number, `${lang} 行號在第 2 拍出現`).toBeGreaterThan(blank.number * 1.5 + 1);
    expect(mid.text, `${lang} 第 2 拍沒有字`).toBeLessThan(blank.text * 1.3 + 1);
    expect(after.text, `${lang} 第 3 拍之後有字`).toBeGreaterThan(mid.text * 2 + 3);
  }
});
