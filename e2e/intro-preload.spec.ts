/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 片頭的圖全部先載好、解碼好才從 0:00 開始（體驗評測 v94 預檢擋件 1）。
 * 舊版只有 0:00 的紙會等，0:10 起每個鏡頭開始才載圖：慢網路上 0:17 黑一秒多；圖晚 3 秒到時，
 * Pixel 7 上法庭、證人、盧卡斯三個鏡頭整段沒有圖。
 * 這裡讓片頭的每張圖都晚 3 秒到，時鐘停住只靠快轉：每個鏡頭一出現，畫面上的圖就要已經解好。
 */
const SHOTS = [
  ['paper', 10000],
  ['blind', 7000],
  ['court', 6000],
  ['witness', 6000],
  ['lucas', 5000],
] as const;

async function open(
  page: Page,
  episode: 'ep1' | 'ep2',
  lang: 'zh' | 'en',
  late = /\/assets\/(paper|blind|court)-[^/]*\.(avif|webp|png)$/,
  ms = 3000,
) {
  await page.route(late, async (r) => {
    await new Promise((ok) => setTimeout(ok, ms));
    await r.continue();
  });
  await page.clock.install({ time: 1_800_000_000_000 });
  await page.clock.pauseAt(1_800_000_000_000 + 1000);
  await page.goto('/');
  await page.evaluate(
    ([episode, lang]) => {
      localStorage.setItem('lawgame-lang', lang);
      localStorage.setItem('rd.dev.intro', '1');
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode,
            scene: 1,
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
    [episode, lang] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

/** 現在這個鏡頭裡的每一張圖（<picture> 的 img 和紙的 SVG image）都載好、有尺寸。 */
const allDecoded = (page: Page) =>
  page.locator('.title-intro').evaluate((root) => {
    const imgs = [...root.querySelectorAll<HTMLImageElement>('.ti-shot img')];
    const bad = imgs
      .filter((i) => !i.complete || !i.naturalWidth)
      .map((i) => i.currentSrc || i.src);
    const svg = root.querySelectorAll('.ti-shot svg image').length;
    return { n: imgs.length + svg, bad };
  });

for (const [episode, lang] of [
  ['ep1', 'zh'],
  ['ep2', 'en'],
] as const)
  test(`片頭圖晚 3 秒到：每個鏡頭一出現就有圖（${episode}・${lang}）`, async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, episode, lang);
    const main = page.locator('.title-intro');
    await expect(main).toHaveAttribute('data-shot', 'paper');
    // 0:00 的紙：三張都解完才畫。
    await expect(page.locator('.ti-paper svg')).toBeVisible({ timeout: 10_000 });
    for (let i = 1; i < SHOTS.length; i++) {
      await page.clock.runFor(SHOTS[i - 1][1]);
      await expect(main).toHaveAttribute('data-shot', SHOTS[i][0]);
      await expect(page.locator('.ti-shot')).toBeAttached();
      // 一出現就要有圖：給 300ms（遠少於圖晚到的 3 秒）讓瀏覽器從快取接上。
      await expect
        .poll(() => allDecoded(page), { timeout: 300, message: SHOTS[i][0] })
        .toMatchObject({ bad: [] });
      expect((await allDecoded(page)).n, SHOTS[i][0]).toBeGreaterThan(0);
    }
  });

/**
 * 等滿 12 秒（READY_CAP）就開播，時間軸照走；但還沒到的那個鏡頭不能先露出半張（設計師 #339 要改 1）：
 * 0:17 的法庭晚 15 秒到，鏡頭到了先整格純黑（暗角也不出來），圖到了整張一起出來。
 */
test('一張圖晚 15 秒到：那個鏡頭不是完整畫面就是純黑', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 'ep1', 'zh', /\/assets\/court-0017w[DP]-[^/]*\.(avif|webp)$/, 15_000);
  const main = page.locator('.title-intro');
  await expect(main).toHaveAttribute('data-shot', 'paper');
  // 0:00 的紙還沒開始：等滿上限。
  await expect(main).not.toHaveAttribute('data-ready', '');
  await page.clock.runFor(12_000);
  await expect(main).toHaveAttribute('data-ready', '');
  await expect(page.locator('.ti-paper svg')).toBeVisible({ timeout: 10_000 });
  // 每一次有鏡頭掛上去，就記下它的圖層是不是都已經解好。
  await page.evaluate(() => {
    const w = window as unknown as { shown: { shot: string; bad: string[] }[] };
    w.shown = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll<HTMLElement>('.ti-shot:not([data-seen])')) {
        el.dataset.seen = '';
        w.shown.push({
          shot: el.className,
          bad: [...el.querySelectorAll('img')]
            .filter((i) => !i.complete || !i.naturalWidth)
            .map((i) => i.currentSrc || i.src),
        });
      }
    }).observe(document.querySelector('.title-intro')!, { childList: true, subtree: true });
  });
  await page.clock.runFor(SHOTS[0][1]);
  await expect(main).toHaveAttribute('data-shot', 'blind');
  await page.clock.runFor(SHOTS[1][1]);
  await expect(main).toHaveAttribute('data-shot', 'court');
  // 法庭還沒到：整格純黑，連暗角都沒有。
  await page.waitForTimeout(500);
  await expect(page.locator('.ti-shot')).toHaveCount(0);
  await expect(main.locator('img')).toHaveCount(0);
  // 圖到了整張一起出來。
  await expect(page.locator('.ti-shot.shot-court')).toBeAttached({ timeout: 20_000 });
  const shown = await page.evaluate(
    () => (window as unknown as { shown: { shot: string; bad: string[] }[] }).shown,
  );
  expect(shown.map((s) => s.shot)).toEqual(['ti-shot shot-blind', 'ti-shot shot-court']);
  expect(shown.flatMap((s) => s.bad)).toEqual([]);
});
