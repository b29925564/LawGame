/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 片頭 40 秒（設定集 11.1）：冷開場之後、第一幕之前。七個鏡頭依序，0:38 是原本的集名卡（幕卡）。
 * 第二次播起才有「跳過」，跳到集名卡；每一集分開記。讀檔讀到片頭之後不播。全片第一道黃在 0:29。
 * 正式圖到齊前開關預設關（玩家版不播佔位片頭）：這裡用開發設定 rd.dev.intro 打開。
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
      if (on) localStorage.setItem('rd.dev.intro', '1');
      else localStorage.removeItem('rd.dev.intro');
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
}

/** 片頭裡現在看得到的黃（--hl 的淺深兩值），連 ::before／::after 一起看。 */
const yellows = (page: Page) =>
  page.locator('.title-intro').evaluate((root) => {
    const hl = /rgba?\((255, 208, 46|244, 197, 61)/;
    const hits: string[] = [];
    for (const el of [root, ...root.querySelectorAll('*')])
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        if (pseudo && cs.content === 'none') continue;
        if (hl.test(cs.backgroundColor) || hl.test(cs.color) || hl.test(cs.borderTopColor))
          hits.push(`${el.className}${pseudo ?? ''}`);
      }
    return hits;
  });

test('開關預設關：正式圖到齊前直接是集名卡，和 main 一樣；?intro=1 打開', async ({ page }) => {
  await open(page, { on: false });
  await expect(page.getByRole('heading', { name: '已收回的訊息' })).toBeVisible();
  await expect(page.locator('.title-intro')).toHaveCount(0);

  await page.goto('/?intro=1');
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'paper');
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

test('第二集換 0:10 和 0:23：百葉窗是第二集的圖（亮另一條縫），證人席是派單 App 的提醒', async ({ page }) => {
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
  expect(await litAt()).toBe(0);
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
    if (shot === 'lucas') expect(hits).toEqual(['ti-line hl::before']);
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

test('0:05 黑條節奏：第 2、3 條各隔 333ms，其餘 25 條各隔 83ms', async ({ page }) => {
  await open(page);
  const delays = await page
    .locator('.ti-bar')
    .evaluateAll((bars) =>
      bars.map((b) => parseFloat(getComputedStyle(b).animationDelay) * 1000).sort((a, b) => a - b),
    );
  expect(delays).toHaveLength(28);
  expect(Math.round(delays[0])).toBe(5000);
  const gaps = delays.slice(1).map((d, i) => Math.round(d - delays[i]));
  expect(gaps).toEqual([333, 333, ...Array(25).fill(83)]);
  // 播完每一條都蓋滿整行（Chrome 結尾進度 0.9999…，steps(4) 曾停在 3/4）。
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  expect(
    new Set(
      await page.locator('.ti-bar').evaluateAll((b) => b.map((x) => getComputedStyle(x).scale)),
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

test('0:29 輪廓光照實際光向：西窗在畫面左邊，光在左肩和後腦左側', async ({ page }) => {
  await open(page);
  for (const [, ms] of ORDER.slice(0, 4)) await page.clock.fastForward(ms);
  await expect(page.locator('.title-intro')).toHaveAttribute('data-shot', 'lucas');
  const [rim, body] = await Promise.all(
    ['.ti-back-rim', '.ti-back-body'].map((s) =>
      page.locator(s).evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, mid: r.left + r.width / 2 };
      }),
    ),
  );
  expect(rim.right).toBeLessThan(body.mid);
});
