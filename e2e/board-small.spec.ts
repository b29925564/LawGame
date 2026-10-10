/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// 證據板的小螢幕（設計師 #2 裁定）：1024–1180 證據欄收進抽屜；手機是 4:5 的同一塊軟木板，下半部是牌架。
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
  confirmed: [] as string[],
  submissions: 0,
  wrong: 0,
  report: [],
  feedback: {},
  motions: {},
  flags: [],
  wrapped: false,
};
const CARDS = [
  'ethan-accused',
  'ethan-ride',
  'ethan-message',
  'indictment',
  'watch-listed',
  'access-partial',
  'sophie-home',
  'ride-receipt',
  'watch-notice',
  'car-statement',
  'watch-photo',
];
const SLOT = /點板上的卡，或從證據裡挑|Tap a card on the board, or pick one from Evidence./;

// confirmed：q2a 已確認，論點 arg-watch 上板，聲請「死者手錶的健康資料」還沒裁定，牌架第一頁排一條黑條。
async function open(page: Page, lang: string, confirmed: string[] = []) {
  await page.goto('/');
  await page.evaluate(
    ([lang, cards, desk, confirmed]) => {
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene: 7,
            step: 0,
            choices: {},
            cards,
            flags: [],
            ethics: [],
            scenes: { investigate: { ...(desk as object), confirmed } },
          },
        }),
      );
    },
    [lang, CARDS, desk, confirmed] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  await page
    .getByRole('button', { name: /^(證據板|Board)/ })
    .first()
    .click();
}
// 手機先看疑問清單：點第一個還沒確認的疑問才看到連線台。
async function question(page: Page) {
  const q = page.locator('.q-item:not(.done):not(.timeline-entry)').first();
  if (await q.isVisible()) await q.click();
  await expect(page.locator('.cork')).toBeVisible();
  await page.waitForTimeout(700);
}

for (const lang of ['zh-TW', 'en'])
  test(`1100：證據欄收進抽屜，「證據 n」在第一屏，空格換字（${lang}）`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await open(page, lang);
    await expect(page.locator('.side-wrap')).toHaveCount(0);
    const tab = page.locator('.evidence-tab');
    await expect(tab).toBeVisible();
    const box = (await tab.boundingBox())!;
    expect(box.y + box.height, '「證據 n」鈕在第一屏').toBeLessThanOrEqual(800);
    // 右欄讓給工作台：沒有橫向捲動，工作台比有常駐證據欄時寬。
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1100,
    );
    const work = (await page.locator('.board-work').boundingBox())!;
    expect(work.x + work.width).toBeGreaterThan(1100 - 60);
    await expect(page.locator('.cork-empty').first()).toHaveText(SLOT);
    // 空格就是挑卡的入口：點開底部的挑卡抽屜，挑了就放上去。
    await page.locator('.cork-empty').first().click();
    await page.locator('.card-sheet .sheet-list button:not(:disabled)').first().click();
    await expect(page.locator('.cork-focus.filled')).toHaveCount(1);
    // 抽屜自己也點得開。
    await tab.click();
    await expect(page.getByRole('region', { name: /^(證據抽屜|Evidence drawer)/ })).toBeVisible();
  });

test('1440：證據欄照舊常駐在右邊，空格還是「點右邊的卡片放上來」', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'zh-TW');
  await expect(page.locator('.side-wrap')).toBeVisible();
  await expect(page.locator('.evidence-tab')).toHaveCount(0);
  await expect(page.locator('.cork-empty').first()).toHaveText('點右邊的卡片放上來');
});

for (const lang of ['zh-TW', 'en'])
  test(`手機：4:5 的板子、牌架 4:3 ≥44、黑條在第一頁、標題整行切（${lang}）`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 839 });
    await open(page, lang, ['q2a']);
    await question(page);
    const cork = (await page.locator('.cork').boundingBox())!;
    expect(cork.height / cork.width, '板子至少 4:5').toBeGreaterThanOrEqual(1.25 - 0.01);
    await expect(page.locator('.cork-empty').first()).toHaveText(SLOT);

    const rack = page.locator('.cork-rack:not(.marks) > *');
    const marks = page.locator('.cork-rack.marks .cork-redact');
    const cells = async () =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '.cork-rack:not(.marks) > *, .cork-rack.marks .cork-redact',
          ),
        ].map((e) => ({ w: e.offsetWidth, h: e.offsetHeight })),
      );
    expect(await rack.count()).toBeGreaterThan(3);
    expect(await marks.count(), '黑條（尚未取得）排在第一頁').toBeGreaterThanOrEqual(1);
    for (const c of await cells()) {
      expect(Math.abs((c.w * 3) / 4 - c.h), `卡 ${c.w}×${c.h} 是 4:3`).toBeLessThanOrEqual(1);
      expect(Math.min(c.w, c.h), '觸控範圍 ≥ 44').toBeGreaterThanOrEqual(44);
    }
    await expect(marks.first()).toContainText(/尚未取得|Not obtained/);

    // 標題最多兩整行、整行切：高度是行高的整數倍，沒有淡出、沒有刪節號。
    const titles = await page
      .locator(
        '.cork-rack .cork-doc-name, .cork-rack .cork-index-head b, .cork-rack b.cork-hand, .cork-rack .cork-strip b, .cork-rack .cork-redact b',
      )
      .evaluateAll((els) =>
        els.map((e) => {
          const cs = getComputedStyle(e);
          const lh = parseFloat(cs.lineHeight);
          return {
            rows: e.clientHeight / lh,
            cut: e.scrollHeight > e.clientHeight + 1,
            mask: cs.maskImage,
            ellipsis: cs.textOverflow,
          };
        }),
      );
    expect(titles.length).toBeGreaterThan(3);
    for (const t of titles) {
      expect(t.rows).toBeLessThanOrEqual(2.05);
      expect(Math.abs(t.rows - Math.round(t.rows)) * 17, '整行切').toBeLessThanOrEqual(1);
      expect(t.mask).toBe('none');
      expect(t.ellipsis).toBe('clip');
    }
  });

test('手機：板子和牌架不被答案列蓋住，A／B 也是', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
  await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
  await expect(page.locator('.cork-focus.filled')).toHaveCount(2);
  // 把板子捲到頂端欄下面：整塊板子都在答案列上方。
  await page.evaluate(() => {
    document.querySelector('.cork')!.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -120);
  });
  await page.waitForTimeout(400);
  const hit = await page.evaluate(() => {
    const cork = document.querySelector('.cork')!;
    const bar = document.querySelector('.answer-bar')!.getBoundingClientRect();
    const r = cork.getBoundingClientRect();
    const pts = [...document.querySelectorAll('.cork-focus, .cork-rack:not(.marks) > *')].map(
      (e) => {
        const b = e.getBoundingClientRect();
        const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { inside: !!el?.closest('.cork'), bottom: b.bottom };
      },
    );
    return { barTop: bar.top, corkBottom: r.bottom, pts };
  });
  expect(hit.pts.length).toBeGreaterThan(4);
  for (const p of hit.pts) expect(p.inside, '卡片中心被別的東西蓋住').toBe(true);
  expect(hit.corkBottom, '板子下緣在答案列上方').toBeLessThanOrEqual(hit.barTop);
});

test('手機：超過 6 張換頁、一次一整頁、頁碼點不是黃、放進 A 的卡原位空著', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  const dots = page.locator('.cork-dots button');
  expect(await dots.count()).toBeGreaterThanOrEqual(2);
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');
  const names = () =>
    page
      .locator('.cork-rack:not(.marks) > *, .cork-rack.marks .cork-redact')
      .evaluateAll((els) => els.map((e) => e.textContent));
  const first = await names();
  // 一頁最多 6 格（黑條和卡一起算）。
  expect(first.length).toBeLessThanOrEqual(6);
  // 點牌架的第一張卡放進 A：原位空著，其他卡不補位。
  const lefts = () =>
    page
      .locator('.cork-rack:not(.marks) > *')
      .evaluateAll((els) => els.map((e) => Math.round((e as HTMLElement).offsetLeft)));
  const before = await lefts();
  const slotA = page.locator('.cork-rack:not(.marks) .cork-card').first();
  await slotA.click();
  await expect(page.locator('.cork-focus.filled')).toHaveCount(1);
  const after = await lefts();
  expect(after.length).toBe(before.length - 1);
  expect(after).toEqual(before.slice(1));
  // 換頁：一整頁，不露出半張卡。
  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  const second = await names();
  expect(second.length).toBeGreaterThan(0);
  for (const n of second) expect(first).not.toContain(n);
  const dot = await dots.first().evaluate((e) => getComputedStyle(e, '::after').backgroundColor);
  expect(dot, '頁碼點不用黃').not.toMatch(
    /^rgb\((2[0-9]{2}), (1[5-9][0-9]|2[0-9]{2}), [0-9]{1,2}\)$/,
  );
});
