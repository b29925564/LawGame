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
        ].map((e) => {
          const print = e.querySelector<HTMLElement>('.cork-print');
          const r = e.getBoundingClientRect();
          return {
            w: e.offsetWidth,
            h: e.offsetHeight,
            print: print && {
              w: print.offsetWidth,
              h: print.offsetHeight,
              nat: (() => {
                const i = print.querySelector('img');
                return i && i.naturalWidth / i.naturalHeight;
              })(),
            },
            box: { l: r.left, t: r.top, r: r.right, b: r.bottom },
            bar: e.classList.contains('cork-redact'),
          };
        }),
      );
    expect(await rack.count()).toBeGreaterThan(3);
    expect(await marks.count(), '黑條（尚未取得）排在第一頁').toBeGreaterThanOrEqual(1);
    const checkPage = async () => {
      const all = await cells();
      let photos = 0;
      for (const c of all) {
        // 格子是 4:3；照片卡是一張沖印，比格子窄，框跟著照片的比例走（不裁切，設計師 #2）：多數是 4:3，扣押袋那張是 3:2。
        if (c.print) {
          photos++;
          const ratio = c.print.nat || 4 / 3;
          expect(
            Math.abs(c.print.w / ratio - c.print.h),
            `牌架照片 ${ratio.toFixed(3)}`,
          ).toBeLessThanOrEqual(1.5);
        } else if (c.bar) {
          // 黑條卡佔一欄兩列高（標籤要整張放得下）：寬是一格，高是兩格加一個間距。
          expect(
            Math.abs(c.h - (2 * ((c.w * 3) / 4) + 6)),
            `黑條 ${c.w}×${c.h} 是一欄兩列`,
          ).toBeLessThanOrEqual(1);
        } else
          expect(Math.abs((c.w * 3) / 4 - c.h), `卡 ${c.w}×${c.h} 是 4:3`).toBeLessThanOrEqual(1);
        expect(Math.min(c.w, c.h), '觸控範圍 ≥ 44').toBeGreaterThanOrEqual(44);
      }
      // 任兩格不重疊；黑條在左上第一格。
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const x = Math.min(all[i].box.r, all[j].box.r) - Math.max(all[i].box.l, all[j].box.l);
          const y = Math.min(all[i].box.b, all[j].box.b) - Math.max(all[i].box.t, all[j].box.t);
          expect(x > 2 && y > 2, `牌架第 ${i} 和第 ${j} 格重疊`).toBe(false);
        }
      const rackBox = await page.locator('.cork-rack:not(.marks)').evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { l: r.left, t: r.top };
      });
      const bar = all.find((c) => c.bar);
      if (bar) {
        expect(Math.abs(bar.box.l - rackBox.l), '黑條在第一欄').toBeLessThanOrEqual(2);
        expect(Math.abs(bar.box.t - rackBox.t), '黑條在第一列').toBeLessThanOrEqual(2);
      }
      return photos;
    };
    const p1 = await checkPage();
    await page.locator('.cork-dots button').nth(1).click();
    const p2 = await checkPage();
    expect(p1 + p2, '牌架有照片卡').toBeGreaterThan(0);
    await page.locator('.cork-dots button').first().click();
    await expect(marks.first()).toContainText(/尚未取得|Not obtained/);

    // 標題整行切：高度是行高的整數倍，沒有淡出、沒有刪節號。
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
            mask: cs.maskImage,
            ellipsis: cs.textOverflow,
          };
        }),
      );
    expect(titles.length).toBeGreaterThan(3);
    for (const t of titles) {
      expect(Math.abs(t.rows - Math.round(t.rows)) * 17, '整行切').toBeLessThanOrEqual(1);
      expect(t.mask).toBe('none');
      expect(t.ellipsis).toBe('clip');
    }
    // 尚未取得的黑條卡：標籤本身就是要傳達的資訊，卡名和「尚未取得、需傳票」一個字都不能被切掉。
    const bar = await page
      .locator('.cork-rack.marks .cork-redact')
      .first()
      .evaluate((e) =>
        [...e.querySelectorAll('b, span')].map((x) => ({
          tag: x.tagName,
          cut: x.scrollHeight - x.clientHeight,
        })),
      );
    expect(bar.length).toBe(2);
    for (const x of bar) expect(x.cut, `黑條卡的 ${x.tag} 被切掉`).toBeLessThanOrEqual(1);
  });

test('手機：板子和牌架不被答案列蓋住，A／B 也是', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
  await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
  await expect(page.locator('.cork-focus.filled')).toHaveCount(2);
  // 把板子捲到頂端欄下面：牌架（在板子上緣）整個不被答案列蓋住、A／B 的中心也不被蓋住（板子本身比一屏高，下面空的軟木會捲到答案列後面）。
  await page.evaluate(() => {
    document.querySelector('.cork')!.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -100);
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
    const rack = document.querySelector('.cork-rack:not(.marks)')!.getBoundingClientRect();
    const ab = [...document.querySelectorAll('.cork-focus')].map(
      (e) => e.getBoundingClientRect().bottom,
    );
    return {
      barTop: bar.top,
      corkBottom: r.bottom,
      rackBottom: rack.bottom,
      abBottom: Math.max(...ab),
      pts,
    };
  });
  expect(hit.pts.length).toBeGreaterThanOrEqual(4);
  for (const p of hit.pts) expect(p.inside, '卡片中心被別的東西蓋住').toBe(true);
  expect(hit.rackBottom, '牌架在答案列上方').toBeLessThanOrEqual(hit.barTop);
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
  // 觸控範圍：頁碼點的按鈕 ≥ 44×44；最後一頁只剩 1–3 張時，卡在第 1 列（牌架上緣），不沉到第 2 列。
  const dotBox = (await dots.first().boundingBox())!;
  expect(Math.min(dotBox.width, dotBox.height)).toBeGreaterThanOrEqual(44);
  const rackTop = await page
    .locator('.cork-rack:not(.marks)')
    .evaluate((e) => e.getBoundingClientRect().top);
  const tops = await page
    .locator('.cork-rack:not(.marks) > *')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  if (tops.length <= 3) for (const t of tops) expect(Math.abs(t - rackTop)).toBeLessThanOrEqual(2);
  expect(second.length).toBeGreaterThan(0);
  for (const n of second) expect(first).not.toContain(n);
  const dot = await dots.first().evaluate((e) => getComputedStyle(e, '::after').backgroundColor);
  expect(dot, '頁碼點不用黃').not.toMatch(
    /^rgb\((2[0-9]{2}), (1[5-9][0-9]|2[0-9]{2}), [0-9]{1,2}\)$/,
  );
});

// 證據欄只在板子放得下大板面時常駐（Evidence.tsx 的 DOCK）：1024–1379 是抽屜＋大板，≥1380 常駐＋大板；
// 桌機任何寬度都不出現手機的 4:5 板（第二道關卡 v92 #2：1180 大板、1181 手機板）。
for (const [w, docked] of [
  [1179, false],
  [1180, false],
  [1181, false],
  [1280, false],
  [1360, false],
  [1379, false],
  [1380, true],
  [1440, true],
] as const)
  test(`${w}：${docked ? '證據欄常駐' : '證據欄收進抽屜'}，板子是大板面`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await open(page, 'en');
    await expect(page.locator('.cork')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.side-wrap')).toHaveCount(docked ? 1 : 0);
    await expect(page.locator('.cork.compact'), '桌機不用手機的板').toHaveCount(0);
    const box = (await page.locator('.cork').boundingBox())!;
    expect(box.width - 20, '板內寬 ≥ 600').toBeGreaterThanOrEqual(600);
    expect(box.width / box.height, '大板 16:10').toBeGreaterThan(1.5);
    await expect(page.locator('.cork-empty').first()).toHaveText(
      docked ? 'Click a card on the right to place it' : SLOT,
    );
  });

// 第二道關卡 v92b D：1380–1381 英文時，大板邊緣的黑條卡最後一行被板子下框切掉、還蓋住上面那張卡 57px。
// 黑條的高度限在這一格以內：整張在板子裡、說明整段放完、卡名拿剩下的整行、不蓋到別的卡。
for (const w of [1100, 1180, 1280, 1379, 1380, 1381, 1440, 1530])
  for (const lang of ['zh-TW', 'en'])
    test(`${w}：大板邊緣的黑條卡不被切、不蓋卡（${lang}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 860 });
      await open(page, lang, ['q2a']);
      await question(page);
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const cork = document.querySelector('.cork')!;
        const c = cork.getBoundingClientRect();
        // 板子的內框（border 10px）：條不能超出。
        const bars = [...document.querySelectorAll<HTMLElement>('.cork > .cork-redact')].map(
          (e) => {
            const b = e.getBoundingClientRect();
            const cards = [...cork.querySelectorAll('.cork-card, .cork-focus.filled')]
              .map((x) => x.getBoundingClientRect())
              .filter(
                (k) =>
                  Math.min(b.right, k.right) - Math.max(b.left, k.left) > 1 &&
                  Math.min(b.bottom, k.bottom) - Math.max(b.top, k.top) > 1,
              ).length;
            return {
              compact: cork.classList.contains('compact'),
              bottom: b.bottom,
              inner: c.bottom - 10,
              halfName: (() => {
                const n = e.querySelector('b')!;
                const lh = parseFloat(getComputedStyle(n).lineHeight);
                return Math.abs(n.clientHeight / lh - Math.round(n.clientHeight / lh)) * lh;
              })(),
              cutWhy: e.querySelector('span')!.scrollHeight - e.querySelector('span')!.clientHeight,
              cut: e.scrollHeight - e.clientHeight,
              overlap: cards,
            };
          },
        );
        return bars;
      });
      expect(r.length, '大板上有黑條卡').toBeGreaterThan(0);
      for (const b of r) {
        expect(b.bottom, '黑條在板子裡').toBeLessThanOrEqual(b.inner + 1);
        expect(b.cutWhy, '說明整段放完').toBeLessThanOrEqual(1);
        expect(b.halfName, '卡名只切在整行').toBeLessThanOrEqual(1);
        expect(b.cut, '條裡沒有被切掉的內容').toBeLessThanOrEqual(1);
        expect(b.overlap, '沒蓋到別的卡').toBe(0);
      }
    });

// 設計師 #2 2026-10-16 (d)：板子從一開始就照這一題最高的卡算高度，A／B 空著、放一張、放兩張，Pixel 7 的板子一樣高。
for (const lang of ['zh-TW', 'en'])
  for (const scale of ['1', '1.5'])
    test(`手機：A／B 空、放一張、放兩張，板子同高、牌架不動（${lang}，字級 ${scale}）`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 412, height: 839 });
      await open(page, lang, ['q2a']);
      await page.evaluate(
        (s) => document.documentElement.style.setProperty('--text-scale', s),
        scale,
      );
      await question(page);
      const read = () =>
        page.evaluate(() => {
          const c = document.querySelector('.cork')!.getBoundingClientRect();
          const r = document.querySelector('.cork-rack:not(.marks)')!.getBoundingClientRect();
          return { w: c.width, h: c.height, rackTop: r.top - c.top };
        });
      const none = await read();
      expect(none.h / none.w, '板子至少 4:5').toBeGreaterThanOrEqual(1.25 - 0.01);
      await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
      await expect(page.locator('.cork-focus.filled')).toHaveCount(1);
      await page.waitForTimeout(400);
      const one = await read();
      await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
      await expect(page.locator('.cork-focus.filled')).toHaveCount(2);
      await page.waitForTimeout(400);
      const two = await read();
      console.log(
        `${lang} ×${scale}：空 ${none.w}×${none.h.toFixed(1)}（${(none.h / none.w).toFixed(3)}）、一張 ${one.h.toFixed(1)}、兩張 ${two.h.toFixed(1)}`,
      );
      expect(Math.abs(one.h - none.h), '放一張，板高不變').toBeLessThanOrEqual(1);
      expect(Math.abs(two.h - none.h), '放兩張，板高不變').toBeLessThanOrEqual(1);
      expect(Math.abs(two.rackTop - none.rackTop), '牌架不動').toBeLessThanOrEqual(1);
    });

test('手機：牌架上的照片不裁切（框跟著照片比例）', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  await page.locator('.cork-dots button').nth(1).click();
  await page.waitForTimeout(400);
  const prints = await page.locator('.cork-rack .cork-print img').evaluateAll((els) =>
    els.map((e) => {
      const img = e as HTMLImageElement;
      const box = img.parentElement!.getBoundingClientRect();
      return {
        src: img.currentSrc,
        nat: img.naturalWidth / img.naturalHeight,
        box: box.width / box.height,
      };
    }),
  );
  expect(prints.length).toBeGreaterThan(0);
  for (const p of prints)
    expect(Math.abs(p.nat - p.box) / p.nat, `${p.src} 框 ${p.box} 對照片 ${p.nat}`).toBeLessThan(
      0.03,
    );
});

// 設計師 2026-10-16 審 #284：英文板子變高（約 700px），牌架在板子上緣，頁面捲在最上面時，牌架第一列要整列在第一屏內、
// 也在答案列上方。
for (const [w, h] of [
  [412, 839],
  [360, 740],
] as const)
  for (const lang of ['zh-TW', 'en'])
    test(`手機 ${w}×${h}：頁面在最上面，牌架第一列整列在第一屏（${lang}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, lang, ['q2a']);
      await question(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const rack = document.querySelector('.cork-rack:not(.marks)')!.getBoundingClientRect();
        const row1 = [...document.querySelectorAll('.cork-rack .cork-card')]
          .map((e) => e.getBoundingClientRect())
          .filter((b) => b.top < rack.top + 5);
        return {
          vh: innerHeight,
          bottom: Math.max(...row1.map((b) => b.bottom)),
          barTop: document.querySelector('.answer-bar')?.getBoundingClientRect().top ?? innerHeight,
          n: row1.length,
        };
      });
      expect(r.n).toBeGreaterThan(0);
      expect(r.bottom, '第一列在第一屏').toBeLessThanOrEqual(r.vh);
      expect(r.bottom, '第一列在答案列上方').toBeLessThanOrEqual(r.barTop);
    });

// 設計師 2026-10-16 審 #284（37a111a）、gate 2 v92b：手機每一次從牌架放卡，剛收到卡的那一格（標籤和卡名）在答案列後面時，
// 頁面捲到板子上緣貼在頂列下面；捲完牌架第一列整列可見，那一格的標籤和卡名在答案列上方。
async function scrolledBoard(page: Page) {
  await page.waitForFunction(() => {
    const w = window as unknown as { __y?: number; __n?: number };
    const y = Math.round(scrollY);
    w.__n = y === w.__y ? (w.__n ?? 0) + 1 : 0;
    w.__y = y;
    return w.__n! >= 8;
  });
  return page.evaluate(() => {
    const rack = document.querySelector('.cork-rack:not(.marks)')!.getBoundingClientRect();
    const row1 = [...document.querySelectorAll('.cork-rack .cork-card')]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.top < rack.top + 5);
    const bottom = (sel: string) =>
      Math.max(...[...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().bottom));
    return {
      y: Math.round(scrollY),
      corkTop: document.querySelector('.cork')!.getBoundingClientRect().top,
      head: document.querySelector('.wb-head')!.getBoundingClientRect().height,
      rackTop: Math.min(...row1.map((b) => b.top)),
      rackBottom: Math.max(...row1.map((b) => b.bottom)),
      barTop: document.querySelector('.answer-bar')!.getBoundingClientRect().top,
      tags: bottom('.slot-tag'),
      names: bottom(
        '.cork-focus.filled :is(.cork-doc-name, .cork-index-head b, b.cork-hand, .cork-strip b)',
      ),
      empty: bottom('.cork-focus:not(.filled)'),
    };
  });
}

for (const [w, h] of [
  [412, 839],
  [360, 740],
] as const)
  for (const lang of ['zh-TW', 'en'])
    test(`手機 ${w}×${h}：第一次放卡把板子捲到頂列下面（${lang}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, lang, ['q2a']);
      await question(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
      const r = await scrolledBoard(page);
      expect(r.y, '有捲').toBeGreaterThan(0);
      expect(Math.abs(r.corkTop - r.head), '板子上緣貼在頂列下面').toBeLessThanOrEqual(2);
      expect(r.rackTop, '牌架第一列在頂列下面').toBeGreaterThanOrEqual(r.head);
      expect(r.rackBottom, '牌架第一列在答案列上方').toBeLessThanOrEqual(r.barTop);
      expect(r.tags, 'A／B 標籤在答案列上方').toBeLessThanOrEqual(r.barTop);
      expect(r.names, '卡名在答案列上方').toBeLessThanOrEqual(r.barTop);
      expect(r.empty, '空格在答案列上方').toBeLessThanOrEqual(r.barTop);
    });

// 剛收到卡的那一格（slot 0＝A、1＝B）：標籤和卡名的下緣、答案列上緣（等捲動停下來再量）。
async function seen(page: Page, slot: number) {
  await scrolledBoard(page);
  return page.evaluate((i) => {
    const f = document.querySelectorAll('.cork-focus')[i];
    const tag = document.querySelectorAll('.cork .slot-tag')[i].getBoundingClientRect();
    const name = f
      .querySelector('.cork-doc-name, .cork-index-head b, b.cork-hand, .cork-strip b')!
      .getBoundingClientRect();
    return {
      tag: tag.bottom,
      name: name.bottom,
      barTop: document.querySelector('.answer-bar')!.getBoundingClientRect().top,
      y: Math.round(scrollY),
    };
  }, slot);
}

/** 從牌架放一張指定的卡（牌架有好幾頁就翻頁找）。 */
async function rackPick(page: Page, name: string) {
  const dots = page.locator('.cork-dots button');
  const card = page.locator('.cork-rack:not(.marks) .cork-card', { hasText: name });
  for (let k = 0; !(await card.count()) && k < (await dots.count()); k++) await dots.nth(k).click();
  await card.first().click();
}

// gate 2 v92b E：放第二張（B）、同一題連線成立（答案面板變高）後再放，卡名都不能在答案面板後面。
for (const [w, h] of [
  [412, 839],
  [360, 740],
] as const)
  for (const lang of ['zh-TW', 'en'])
    test(`手機 ${w}×${h}：放 A、放 B、連線成立後再放，每次標籤和卡名都在答案列上方（${lang}）`, async ({
      page,
    }) => {
      const zh = lang === 'zh-TW';
      await page.setViewportSize({ width: w, height: h });
      await open(page, lang, ['q2a']);
      await question(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      // 放 A。
      await rackPick(page, zh ? '手錶通知紀錄' : 'Watch notification log');
      const a = await seen(page, 0);
      expect(a.tag, 'A 標籤').toBeLessThanOrEqual(a.barTop);
      expect(a.name, 'A 卡名').toBeLessThanOrEqual(a.barTop);
      // 玩家把頁面捲回最上面，再放 B：又捲到位。
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await rackPick(page, zh ? '叫車收據' : 'Ride receipt');
      const b = await seen(page, 1);
      expect(b.y, '又捲了').toBeGreaterThan(0);
      expect(b.tag, 'B 標籤').toBeLessThanOrEqual(b.barTop);
      expect(b.name, 'B 卡名').toBeLessThanOrEqual(b.barTop);
      // 連線、確認：答案面板變高（多了「已確認」和「去時間線」）。
      const links = page.locator('section.workbench section.links');
      await links.getByRole('radio', { name: zh ? '支持' : 'Supports' }).click();
      await links.getByRole('button', { name: zh ? '連起來' : 'Link' }).click();
      const q = page.locator('section.workbench');
      await q.getByRole('button', { name: new RegExp(zh ? '^發現 1：' : '^Finding 1:') }).click();
      await q.getByRole('button', { name: zh ? /^提交/ : /^Submit/ }).click();
      await expect(q).toContainText(zh ? '已確認' : 'Confirmed');
      // 同一題再放一張：捲到位，標籤和卡名在變高的答案面板上方。
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
      const c = await seen(page, 0);
      expect(c.y, '又捲了').toBeGreaterThan(0);
      expect(c.tag, '確認後 A 標籤').toBeLessThanOrEqual(c.barTop);
      expect(c.name, '確認後 A 卡名').toBeLessThanOrEqual(c.barTop);
      await page.screenshot({
        path: `test-results/scroll-confirmed-${w}x${h}-${zh ? 'zh' : 'en'}.png`,
      });
    });

test('手機：A／B 已在答案列上方就不捲', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  // 玩家先把板子捲到 A／B 都在答案列上方，再從牌架放卡。
  await page.evaluate(() => {
    const cork = document.querySelector('.cork')!.getBoundingClientRect();
    window.scrollTo(0, scrollY + cork.top - 200);
  });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => Math.round(scrollY));
  await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => Math.round(scrollY)), '位置不動').toBe(before);
});

test('手機：減少動態時直接跳到位，不演捲動', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
  // 兩個畫格內就在終點（一般捲動要 280ms）。
  await page.evaluate(
    () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))),
  );
  const r = await page.evaluate(() => ({
    corkTop: document.querySelector('.cork')!.getBoundingClientRect().top,
    head: document.querySelector('.wb-head')!.getBoundingClientRect().height,
  }));
  expect(Math.abs(r.corkTop - r.head), '一下就到').toBeLessThanOrEqual(2);
});

// 設計師 2026-10-16 審 #284：板上的字固定 px，但讀字的兩條路（放大檢視、證據抽屜）要跟著字級放大、不切字。
test('字級 1.5：放大檢視的標題、說明、出處、Bates 都放大，沒有切字', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'en', ['q2a']);
  await question(page);
  // 找一張有「放大」鈕的卡（照片紀錄表或證物袋）：依序把牌架的卡放進 A，沒有就拿下來換下一張。
  let found = false;
  const dots = page.locator('.cork-dots button');
  for (let k = 0; k < (await dots.count()) && !found; k++) {
    await dots.nth(k).click();
    const cards = page.locator('.cork-rack:not(.marks) .cork-card');
    for (let c = 0; c < (await cards.count()) && !found; c++) {
      await cards.nth(c).click();
      await page.waitForTimeout(300);
      if (await page.locator('.cork-zoom').count()) found = true;
      else await page.locator('.cork-focus.filled .cork-pick').first().click();
    }
  }
  expect(found, '牌架上有帶「放大」鈕的卡').toBe(true);
  const sizes = async (scale: string) => {
    await page.evaluate(
      (s) => document.documentElement.style.setProperty('--text-scale', s),
      scale,
    );
    await page.locator('.cork-zoom').first().click();
    await expect(page.locator('dialog.zoom')).toBeVisible();
    const r = await page.evaluate(() => {
      const px = (sel: string) => {
        const e = document.querySelector<HTMLElement>(`dialog.zoom ${sel}`);
        return e ? parseFloat(getComputedStyle(e).fontSize) : 0;
      };
      const cut = [...document.querySelectorAll<HTMLElement>('dialog.zoom *')].filter(
        (e) =>
          getComputedStyle(e).overflowY === 'hidden' &&
          !e.classList.contains('sr-only') &&
          e.scrollHeight > e.clientHeight + 1,
      ).length;
      return {
        title: px('.zoom-head h2'),
        sheet: px('.zoom-sheet p:not(.zoom-src)'),
        src: px('.zoom-src'),
        bates: px('.photolog-bates b'),
        cut,
      };
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.zoom')).toHaveCount(0);
    return r;
  };
  const base = await sizes('1');
  const big = await sizes('1.5');
  for (const key of ['title', 'sheet', 'src'] as const)
    expect(big[key] / base[key], `放大檢視的 ${key} 跟著字級`).toBeCloseTo(1.5, 1);
  if (base.bates) expect(big.bates / base.bates, 'Bates 跟著字級').toBeCloseTo(1.5, 1);
  expect(big.cut, '放大後沒有被切掉的字').toBe(0);
});
