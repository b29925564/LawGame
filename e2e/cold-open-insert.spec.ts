/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 冷開場 22:33 的插入鏡頭（設定集第 3 章第 01 格）：通知跳出時切 0.4 秒伊森的下巴被手機光由下打亮，再切回手機。
 * 兩次都是硬切（中間 2 格黑，83ms），不淡入、沒有場記；燈組 ep1-phone-night-fri（6500K＝--k-screen）。
 * 整段擋住點擊：還沒看到鏡頭就點掉通知，這一格就沒了。
 */
const STEP_2233 = 1;

async function open(page: Page, lang: 'zh' | 'en') {
  await page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0'));
  await page.goto('/');
  await page.evaluate(
    ([step, lang]) => {
      localStorage.setItem('lawgame-lang', lang as string);
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
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [STEP_2233, lang] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

/** 從現在起記下插入鏡頭每一段的時間點，和 plate 那一段畫面上是不是真的有圖。 */
const record = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __insert: { phase: string; t: number; shown?: boolean }[] };
    w.__insert = [];
    let last = '';
    const look = () => {
      const el = document.querySelector<HTMLElement>('.cold-insert');
      const phase = el?.dataset.phase ?? 'none';
      if (phase === last) return;
      last = phase;
      const plate = el?.querySelector<HTMLElement>('.scene-plate');
      const shown =
        !!plate &&
        plate.dataset.state === 'ok' &&
        getComputedStyle(plate).visibility === 'visible' &&
        getComputedStyle(plate.querySelector('.plate-stage')!).opacity === '1';
      w.__insert.push({ phase, t: performance.now(), shown });
    };
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-phase', 'data-state'],
    });
  });

for (const lang of ['zh', 'en'] as const)
  test(`22:33 通知跳出時硬切 0.4 秒伊森的下巴，再切回手機（${lang}）`, async ({ page }, info) => {
    await open(page, lang);
    // 22:33 那一格字卡的時候，下一格的插入鏡頭已經在載。
    await expect(page.locator('.cine-text')).toBeVisible();
    await record(page);
    await page.locator('.cine-next').click();

    const notif = page.locator('.notif');
    await expect(notif).toBeVisible();
    const cut = page.locator('.cold-insert');
    await expect(cut).toBeAttached();
    const plate = cut.locator('.scene-plate');
    await expect(plate).toHaveAttribute('data-plate', 'apt-2233');
    await expect(plate).toHaveAttribute('data-rig', 'ep1-phone-night-fri');
    await expect(plate).toHaveAttribute('data-kelvin', '6500');
    const phone = info.project.name === 'chromium';
    await expect(plate.locator('.plate-bg')).toHaveAttribute('src', phone ? /phone/ : /desktop/);

    // 鏡頭演完以前點通知沒有用（整段擋住點擊）。
    const box = (await notif.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(cut).toHaveCount(0, { timeout: 4000 });
    const log = await page.evaluate(
      () =>
        (window as unknown as { __insert: { phase: string; t: number; shown?: boolean }[] })
          .__insert,
    );
    const seq = log.map((e) => e.phase).filter((p) => p !== 'none');
    expect(seq, JSON.stringify(log)).toEqual(['lead', 'black', 'plate', 'back']);
    const at = (p: string) => log.find((e) => e.phase === p)!.t;
    const end = log.filter((e) => e.phase === 'none').pop()!.t;
    // 先看得到通知跳出來（0.5 秒），才切走。
    expect(at('black') - at('lead')).toBeGreaterThan(400);
    // 硬切：2 格黑（83ms）；鏡頭 0.4 秒。計時器有幾毫秒的誤差。
    for (const [a, b, ms] of [
      ['black', 'plate', 83],
      ['plate', 'back', 400],
    ] as const)
      expect(Math.abs(at(b) - at(a) - ms), `${a}→${b}`).toBeLessThan(50);
    expect(Math.abs(end - at('back') - 83)).toBeLessThan(50);
    // plate 那一段，圖已經解碼好、整張亮著（不淡入）。
    expect(log.find((e) => e.phase === 'plate')!.shown).toBe(true);

    // 還在通知這一格（剛才那一下沒有把通知點掉）；切回來以後點得到。
    await expect(notif).toBeVisible();
    await notif.click();
    await expect(notif).toHaveCount(0);
  });

test('22:33 的插入鏡頭蓋住整個畫面（手機和選單鈕都在下面）', async ({ page }) => {
  await open(page, 'zh');
  await page.locator('.cine-next').click();
  // 鏡頭那 0.4 秒裡量：視窗中間和四個邊角點下去，碰到的都是插入鏡頭。
  const hits = await page
    .waitForFunction(
      () => {
        if (!document.querySelector('.cold-insert[data-phase="plate"]')) return null;
        const [w, h] = [innerWidth, innerHeight];
        return [
          [w / 2, h / 2],
          [8, 8],
          [w - 8, 8],
          [w / 2, h - 8],
        ].map(([x, y]) =>
          document.elementFromPoint(x, y)?.closest('.cold-insert') ? 'insert' : 'other',
        );
      },
      null,
      { polling: 'raf', timeout: 3000 },
    )
    .then((h) => h.jsonValue());
  expect(hits).toEqual(['insert', 'insert', 'insert', 'insert']);
});
