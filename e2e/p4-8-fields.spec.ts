import { expect, test, type Page } from '@playwright/test';

// #234 的三個欄位（劇本與內容 PR #234、content/slates/2026-10-09-p4-8-items.md）：
// 監獄來電畫面、證詞錄取錄影的出處、答辯庭當晚的地點場記。
async function load(page: Page, scene: number, desk?: Record<string, unknown>) {
  await page.goto('/');
  await page.evaluate(
    ([scene, desk]) => {
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: desk ? { investigate: desk } : {},
          },
        }),
      );
    },
    [scene, desk] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
}

test('尾聲的監獄來電：黑底來電畫面，頭像位置是黑條，講完通話時間停在 00:47', async ({ page }) => {
  await load(page, 44);
  const screen = page.locator('main.call-screen');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('region', { name: '來電' })).toContainText(
    '州立監獄　受刑人付費電話',
  );
  await expect(screen.locator('.call-bar')).toHaveText('本通話將被錄音');
  await expect(screen.getByText('通話中')).toBeVisible();
  await expect(screen.locator('.call-dur')).toHaveCount(0);
  // 黑條黑底白字；液晶字是 --k-lcd #9fe6b4。
  const colors = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('.call-bar')!).backgroundColor,
    lcd: getComputedStyle(document.querySelector('.call-from')!).color,
  }));
  expect(colors).toEqual({ bar: 'rgb(0, 0, 0)', lcd: 'rgb(159, 230, 180)' });
  // 一路按到最後一句：通話結束，時間停在 00:47；繼續不是黃的。
  for (let i = 0; i < 4; i++) await screen.getByRole('button', { name: '繼續' }).click();
  await expect(screen.getByText('通話結束')).toBeVisible();
  await expect(screen.locator('.call-dur')).toHaveText('00:47');
  await expect(screen.getByRole('button', { name: '繼續' })).not.toHaveClass(/primary/);
  // 父親沒有臉：台詞前面是黑條，不是暫代的剪影。
  await expect(screen.locator('.call-speech .call-mug').first()).toBeVisible();
  await expect(screen.locator('.speech svg.portrait')).toHaveCount(0);
});

test('證詞錄取：錄影的出處小字寫 Bates 和時間碼', async ({ page }) => {
  await load(page, 10);
  const src = page.locator('.video-source');
  await expect(src).toHaveText(/證詞錄取錄影\s*WH-V-000412\s*00:47:12;08/);
  await page.getByRole('button', { name: '開始錄取' }).click();
  await expect(page.locator('.video-source')).toContainText('WH-V-000412');
  // 中文字不小於 14px。
  const px = await page
    .locator('.video-source')
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(px).toBeGreaterThanOrEqual(14);
});

test('我出庭答辯：左下一行場記，走廊、週二 19:00', async ({ page }) => {
  const desk = {
    hours: 20,
    timeline: [],
    spent: 4,
    marked: [],
    readDocs: [],
    jobs: [],
    mail: [],
    openMail: [],
    link: { cards: [], relation: null },
    found: [],
    badLinks: 0,
    linkNote: null,
    attempts: {},
    confirmed: [],
    submissions: 0,
    wrong: 0,
    report: [],
    feedback: {},
    motions: {
      'm-chat': { basis: null, support: [], request: null, ruling: 'granted', twist: null },
    },
    flags: [],
    wrapped: false,
  };
  await load(page, 7, desk);
  await page.getByRole('button', { name: '我出庭答辯。' }).click();
  await expect(page.getByText('法官維持傳票')).toBeVisible();
  await expect(page.locator('.place-slate')).toContainText('惠特洛克・海爾　走廊　週二 19:00');
  // 選「撤回傳票」沒有地點：沒有場記。
});
