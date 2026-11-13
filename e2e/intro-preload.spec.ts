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

async function open(page: Page, episode: 'ep1' | 'ep2', lang: 'zh' | 'en') {
  await page.route(/\/assets\/(paper|blind|court)-[^/]*\.(avif|webp|png)$/, async (r) => {
    await new Promise((ok) => setTimeout(ok, 3000));
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
