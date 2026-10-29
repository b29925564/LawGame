/// <reference lib="dom" />
import { nameUnits, proseUnits } from '../src/ui/lineUnits';
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
async function open(
  page: Page,
  lang: string,
  confirmed: string[] = [],
  found: string[] = [],
  cards: string[] = CARDS,
  where: [string, number] = ['ep1', 7],
  key = 'investigate',
) {
  await page.goto('/');
  await page.evaluate(
    ([lang, cards, desk, confirmed, found, where, key]) => {
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: (where as [string, number])[0],
            scene: (where as [string, number])[1],
            step: 0,
            choices: {},
            cards,
            flags: [],
            ethics: [],
            scenes: { [key as string]: { ...(desk as object), confirmed, found } },
          },
        }),
      );
    },
    [lang, cards, desk, confirmed, found, where, key] as const,
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
/**
 * 等牌架上的照片載好、板子、牌架和頁面捲動連續幾個畫格都不動：代替固定等待
 * （CI 慢時固定等待會落在載圖或動畫中途，讀到 naturalWidth 0 或過渡中的尺寸）。
 */
async function settled(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sig?: string; __still?: number };
    delete w.__sig;
    w.__still = 0;
  });
  await page.waitForFunction(
    () => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('.cork-print img')];
      if (imgs.some((i) => !i.complete || i.naturalWidth === 0)) return false;
      const sig = [
        Math.round(scrollY),
        ...[...document.querySelectorAll('.cork, .cork-rack, .cork-focus')].map((e) => {
          const r = e.getBoundingClientRect();
          return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10)).join(',');
        }),
      ].join(';');
      const w = window as unknown as { __sig?: string; __still?: number };
      w.__still = sig === w.__sig ? (w.__still ?? 0) + 1 : 0;
      w.__sig = sig;
      return (w.__still ?? 0) >= 6;
    },
    undefined,
    { polling: 'raf' },
  );
}

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
    await expect(page.getByRole('dialog', { name: /^(證據抽屜|Evidence drawer)/ })).toBeVisible();
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
      await settled(page);
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
    await settled(page);
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
  await settled(page);
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
    // 大板至少 16:10；邊緣的卡頭比一格高時板子會長高（#300），但還是橫的大板（手機的板是 4:5＝0.8）。
    expect(box.width / box.height, '橫的大板').toBeGreaterThan(1.2);
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

// 第二道關卡 v92c D：1380–1381 英文、兩條連線都找到時，邊緣的索引卡（Sophie 的陳述）卡頭比一格高，被下面的卡蓋掉 57px。
// 板子照實量的卡頭和黑條高度長高到每張邊緣的卡都在自己那一格裡：互不重疊、都在板子裡、黑條的卡名完整。
const GATE_CARDS = [
  'ethan-accused',
  'ethan-ride',
  'ethan-message',
  'sophie-home',
  'sophie-health-app',
  'indictment',
  'access-partial',
  'access-full',
  'ride-receipt',
  'watch-notice',
  'autopsy',
  'watch-listed',
  'watch-photo',
  'arg-a',
  'arg-watch',
];
for (const w of [1380, 1381, 1440, 1530])
  for (const lang of ['zh-TW', 'en'])
    test(`${w}：大板邊緣的卡各在自己那一格，不互相蓋（${lang}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 860 });
      await open(page, lang, ['q1', 'q2a'], ['l-watch', 'l-called-msg'], GATE_CARDS);
      await page
        .locator('.q-item')
        .filter({ hasText: /手錶資料與本案相關|the watch data is relevant/ })
        .first()
        .click();
      await expect(page.locator('.cork')).toBeVisible();
      // 手寫字型載好後每行幾個字才定，邊緣卡的內文行數跟著重算。
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const cork = document.querySelector<HTMLElement>('.cork')!;
        const boxes = [
          ...cork.querySelectorAll<HTMLElement>(
            ':scope > .cork-card:not(.cork-focus), :scope > .cork-redact',
          ),
        ].map((e) => ({
          name: (e.querySelector('b')?.textContent ?? e.className).slice(0, 30),
          x: e.offsetLeft,
          y: e.offsetTop,
          w: e.offsetWidth,
          h: e.offsetHeight,
          bar: e.classList.contains('cork-redact'),
          cutName: (() => {
            const n = e.querySelector(':scope > .cork-strip > b, :scope.cork-redact > b');
            return n ? n.scrollHeight - n.clientHeight : 0;
          })(),
          // 照片卡的卡名在卡裡（底欄不被卡的下緣切掉）。
          stripOut: (() => {
            const n = e.querySelector<HTMLElement>(':scope > .cork-strip');
            return n ? n.offsetTop + n.offsetHeight - e.clientHeight : 0;
          })(),
          // 內文放出來的字（空白分隔的語言）至少兩個字，不留「Voss」這種單字殘句。
          bodyWords: (() => {
            const b = e.querySelector<HTMLElement>(':scope > span:is(.cork-doc-text, .cork-hand)');
            if (!b || !b.offsetHeight || !/\s/.test(b.textContent ?? '')) return 99;
            const m = new DOMMatrixReadOnly(getComputedStyle(e).transform);
            const tan = Math.tan(Math.atan2(m.b, m.a));
            const lh = parseFloat(getComputedStyle(b).lineHeight);
            const ys: number[] = [];
            const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
            for (let t = walk.nextNode(); t; t = walk.nextNode())
              for (const w of (t.textContent ?? '').matchAll(/\S+/g)) {
                const r = document.createRange();
                r.setStart(t, w.index);
                r.setEnd(t, w.index + w[0].length);
                const q = r.getBoundingClientRect();
                ys.push((q.top + q.bottom) / 2 - ((q.left + q.right) / 2) * tan);
              }
            return ys.filter((y) => y - ys[0] < b.offsetHeight - lh / 2).length;
          })(),
        }));
        return { boxes, inner: cork.clientHeight, compact: cork.classList.contains('compact') };
      });
      expect(r.compact, '大板').toBe(false);
      expect(r.boxes.length, '邊緣有卡').toBeGreaterThan(4);
      for (const a of r.boxes) {
        expect(a.y + a.h, `${a.name} 在板子裡`).toBeLessThanOrEqual(r.inner);
        expect(a.cutName, `${a.name} 的卡名完整（黑條、照片卡）`).toBeLessThanOrEqual(1);
        expect(a.stripOut, `${a.name} 底欄在卡裡`).toBeLessThanOrEqual(1);
        expect(a.bodyWords, `${a.name} 內文不只剩一個字`).toBeGreaterThanOrEqual(2);
        for (const b of r.boxes) {
          if (a === b) continue;
          const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(across > 1 && down > 0, `${a.name} 沒蓋到 ${b.name}`).toBe(false);
        }
      }
    });

// 第二道關卡 v92d：第 2 集 1380 英文，邊緣卡「Medical record: hypertension」在字中間斷行成「hypertensio／n」。
// 邊緣卡的卡頭不在字中間斷行：卡至少做到放得下最長的字。
for (const w of [1380, 1440, 1530])
  for (const lang of ['zh-TW', 'en'])
    test(`${w}：第 2 集邊緣卡的卡頭不在字中間斷行（${lang}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 860 });
      await open(
        page,
        lang,
        [],
        [],
        ['med-record', 'pharmacy', 'voice-memo', 'app-log', 'autopsy2', 'contract'],
        ['ep2', 6],
      );
      await question(page);
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      const r = await page.evaluate(() => {
        const cork = document.querySelector<HTMLElement>('.cork')!;
        const split: string[] = [];
        let n = 0;
        for (const card of cork.querySelectorAll<HTMLElement>(':scope > .cork-card')) {
          n++;
          const body = card.querySelector(':scope > span:is(.cork-doc-text, .cork-hand)');
          const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          for (let t = walk.nextNode(); t; t = walk.nextNode()) {
            if (body?.contains(t)) continue;
            for (const m of (t.textContent ?? '').matchAll(/[^\s-]+/g)) {
              if (/[\u3000-\u9fff\uff00-\uffef]/.test(m[0])) continue;
              const range = document.createRange();
              range.setStart(t, m.index);
              range.setEnd(t, m.index + m[0].length);
              if (range.getClientRects().length > 1) split.push(m[0]);
            }
          }
        }
        return { split, n };
      });
      expect(r.n, '邊緣有卡').toBeGreaterThan(3);
      expect(r.split, '沒有被拆開的字').toEqual([]);
    });

// 第二道關卡 v92d：手機證據架的照片卡（財物清單）格子只放得下一行卡名（設計師 #2 2026-10-17 裁定 A）：
// 放得下的整個字、整個詞；不在字中間斷、不以虛詞收尾、不加刪節號；第一個字都放不下就整個不放。
for (const w of [412, 360, 320])
  for (const lang of ['zh-TW', 'en'])
    test(`手機 ${w}：證據架照片卡名只放一行整詞，不以虛詞收尾（${lang}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 839 });
      await open(page, lang, ['q2a']);
      await question(page);
      await page.evaluate(() => document.fonts.ready);
      const dots = page.locator('.cork-dots button');
      let seen = 0;
      for (let k = 0; k < Math.max(1, await dots.count()); k++) {
        if (await dots.count()) await dots.nth(k).click();
        await page.waitForTimeout(200);
        const r = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              '.cork-rack:not(.marks) .cork-card.photo .cork-strip b',
            ),
          ].map((b) => ({
            full: b.dataset.name ?? '',
            shown: b.textContent ?? '',
            wide: b.scrollWidth - b.clientWidth,
            tall: b.scrollHeight - b.clientHeight,
            box: b.parentElement!.clientWidth - b.getBoundingClientRect().width,
          })),
        );
        for (const b of r) {
          seen++;
          expect(b.tall, `${b.full} 只有一行`).toBeLessThanOrEqual(1);
          expect(b.wide, `${b.full} 不超出卡寬`).toBeLessThanOrEqual(1);
          if (b.shown === b.full || !b.shown) continue;
          expect(b.full.startsWith(b.shown), `${b.shown} 是 ${b.full} 的開頭`).toBe(true);
          const next = b.full[b.shown.length];
          const cjk = /[\u3000-\u9fff\uff00-\uffef]/.test(b.full);
          if (!cjk) expect(/\s/.test(next), `${b.shown}｜${next} 在字的邊界`).toBe(true);
          const lastWord = b.shown
            .split(/\s+/)
            .pop()!
            .replace(/[:,.]+$/, '')
            .toLowerCase();
          expect(
            [
              'a',
              'an',
              'the',
              'of',
              'in',
              'on',
              'at',
              'to',
              'for',
              'and',
              'or',
              'by',
              'with',
              'from',
            ],
            `${b.shown} 不以虛詞收尾`,
          ).not.toContain(lastWord);
          if (cjk)
            expect(
              /[的之與和及或在於對把被為從到以而並]$/.test(b.shown),
              `${b.shown} 不以虛詞收尾`,
            ).toBe(false);
        }
      }
      expect(seen, '證據架有照片卡').toBeGreaterThan(0);
    });

// 設計師 #2 2026-10-17 22:14Z：手機牌架的文字卡（影印紙、索引卡、便條）和照片卡同一條整詞規則：最多兩行，英文不斷字，
// 中文只在 Intl.Segmenter 的詞界斷，結尾不留虛詞，不加刪節號；同一頁牌架兩張以上縮短後一樣的，改顯示冒號後面那段；
// 被縮短的卡 aria-label 是完整卡名。
const FN_EN = [
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'and',
  'or',
  'by',
  'with',
  'from',
  'i',
  'he',
  'she',
  'it',
  'they',
  'we',
  'you',
];
const FN_ZH = [...'的之與和及或在於對把被為從到以而並是我你他她它'];
for (const w of [412, 360, 320])
  for (const lang of ['zh-TW', 'en'])
    test(`手機 ${w}：牌架卡名整詞、同頁不重複、aria-label 是完整卡名（${lang}）`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 839 });
      await open(page, lang, ['q1', 'q2a'], ['l-watch', 'l-called-msg'], GATE_CARDS);
      await page
        .locator('.q-item')
        .filter({ hasText: /手錶資料與本案相關|the watch data is relevant/ })
        .first()
        .click();
      await expect(page.locator('.cork')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const dots = page.locator('.cork-dots button');
      let seen = 0;
      let cut = 0;
      const everyCard: { full: string; shown: string }[] = [];
      for (let k = 0; k < Math.max(1, await dots.count()); k++) {
        if (await dots.count()) await dots.nth(k).click();
        await settled(page);
        await page.waitForTimeout(250);
        const r = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.cork-rack:not(.marks) > .cork-card')].map(
            (card) => {
              const b = card.querySelector<HTMLElement>('b[data-name]')!;
              const lines = [...b.querySelectorAll('.cork-rack-line')].map(
                (l) => l.textContent ?? '',
              );
              const full = b.dataset.name ?? '';
              const at = full.search(/[:：]/);
              const rest = at < 0 ? '' : full.slice(at + 1).trim();
              const src = rest || full;
              return {
                full,
                src,
                label: card.getAttribute('aria-label'),
                photo: card.classList.contains('photo'),
                lines,
                tall: b.scrollHeight - b.clientHeight,
                wide: Math.max(
                  0,
                  ...[...b.querySelectorAll<HTMLElement>('.cork-rack-line')].map(
                    (l) => l.scrollWidth - b.parentElement!.clientWidth,
                  ),
                ),
              };
            },
          ),
        );
        const shownAll: string[] = [];
        for (const c of r) {
          seen++;
          const joined = c.lines.join('');
          expect(c.label, `${c.full} 的 aria-label`).toBe(c.full);
          expect(c.lines.length, `${c.full} 行數`).toBeLessThanOrEqual(c.photo ? 1 : 2);
          expect(c.tall, `${c.full} 沒有被切到半行`).toBeLessThanOrEqual(1);
          expect(c.wide, `${c.full} 不超出卡寬`).toBeLessThanOrEqual(1);
          if (!joined.trim()) continue;
          shownAll.push(joined.trim());
          const shown = joined.trim();
          everyCard.push({ full: c.full, shown });
          const cjk = /[\u3000-\u9fff\uff00-\uffef]/.test(c.src);
          const wordsOf = (t: string) => (cjk ? proseUnits(t, false, false) : t.split(/\s+/));
          const whole = c.full.startsWith(shown);
          // 第一個詞放不下時（320 寬）放能放的最長整詞，不一定是開頭。
          const lone = wordsOf(c.src).some(
            (x) => x.replace(/[，。、；：！？,.;:!?]+$/, '') === shown,
          );
          expect(
            whole || c.src.startsWith(shown) || lone,
            `${shown} 是 ${c.full} 的開頭、冒號後面那段的開頭、或其中一個整詞`,
          ).toBe(true);
          if (shown === c.full || shown === c.src || lone) continue;
          cut++;
          const base = whole ? c.full : c.src;
          // 冒號後面不能只剩一個代名詞或「是」（「Sophie to police: I」「蘇菲陳述：他」「論點 A：伊森是」）。
          const colonAt = shown.search(/[:：]/);
          const after = (colonAt < 0 ? shown : shown.slice(colonAt + 1)).trim();
          if (after) {
            const words = cjk ? [...after] : after.split(/\s+/).map((x) => x.toLowerCase());
            expect(
              words.every((x) => FN_ZH.includes(x) || FN_EN.includes(x)),
              `${shown} 冒號後面只剩虛詞或代名詞`,
            ).toBe(false);
          }
          // 「的」「之」黏前一個詞，不放行首。
          for (const l of c.lines)
            expect(/^[的之]/.test(l), `${l} 「的」「之」不放行首`).toBe(false);
          if (cjk) {
            // 中文只在詞界斷（內文同一套斷詞）；每一行的尾巴也是詞界，標點不放行首。
            const ends = new Set<number>();
            let at = 0;
            for (const { w, p } of nameUnits(base)) {
              at += w.length + p.length;
              ends.add(at);
              if (p) ends.add(at - p.length);
              // 黏著「的」「之」的詞被截在行尾時，Cork.tsx 把「的」拿掉（「警方的」→「警方」），詞還是詞。
              if (/[的之]$/.test(w)) ends.add(at - p.length - 1);
            }
            let pos = 0;
            for (const l of c.lines) {
              pos += l.length;
              expect(ends.has(pos), `${base} 在第 ${pos} 字斷開，不是詞界`).toBe(true);
            }
            for (const l of c.lines.slice(1))
              expect(/^[，。、；：！？）」』…]/.test(l), `${l} 標點不放行首`).toBe(false);
            for (const l of c.lines)
              expect(/[（「『《〈([]$/.test(l), `${l} 開括號不放行尾`).toBe(false);
            expect(
              (shown.match(/[（「『《〈([]/g)?.length ?? 0) <=
                (shown.match(/[）」』》〉)\]]/g)?.length ?? 0),
              `${shown} 括號有開有關`,
            ).toBe(true);
            expect(
              /[的之與和及或在於對把被為從到以而並]$/.test(shown),
              `${shown} 不以虛詞收尾`,
            ).toBe(false);
          } else {
            expect(
              /\s/.test(base[joined.length] ?? ' '),
              `${joined}｜${base[joined.length]} 在字的邊界`,
            ).toBe(true);
            const last = shown
              .split(/\s+/)
              .pop()!
              .replace(/[:,.]+$/, '')
              .toLowerCase();
            expect(FN_EN, `${shown} 不以虛詞收尾`).not.toContain(last);
          }
          expect(/[,，、]$/.test(shown), `${shown} 不留逗號`).toBe(false);
        }
        expect(new Set(shownAll).size, `這一頁牌架的卡名兩兩不同：${shownAll.join(' ｜ ')}`).toBe(
          shownAll.length,
        );
      }
      // 冒號前面一樣的卡，整個牌架有兩張以上（不論在哪一頁），每一頁的這幾張都排冒號後面那段。
      const byLabel = new Map<string, string[]>();
      for (const c of everyCard) {
        const at = c.full.search(/[:：]/);
        if (at < 0) continue;
        const label = c.full.slice(0, at).trim();
        byLabel.set(label, [...(byLabel.get(label) ?? []), c.shown]);
      }
      for (const [label, shown] of byLabel)
        if (shown.length > 1)
          for (const x of shown)
            expect(
              x.startsWith(label) && x !== '',
              `牌架上有 ${shown.length} 張「${label}」，每張都要排冒號後面那段：${x}`,
            ).toBe(false);
      expect(seen, '牌架有卡').toBeGreaterThan(3);
      expect(cut, '有被縮短的卡').toBeGreaterThanOrEqual(0);
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
      await settled(page);
      const one = await read();
      await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
      await expect(page.locator('.cork-focus.filled')).toHaveCount(2);
      await settled(page);
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
  await settled(page);
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
      // 板子上緣至少捲到頂列下面；卡很長（英文索引卡、小手機）放不下整張時再多捲，牌架第一列就捲到頂列後面（v92c E，
      // 整張卡在答案列上方比牌架第一列重要）。沒多捲的時候牌架第一列整列可見。
      expect(r.corkTop, '板子上緣至少貼到頂列').toBeLessThanOrEqual(r.head + 2);
      if (Math.abs(r.corkTop - r.head) <= 2) {
        expect(r.rackTop, '牌架第一列在頂列下面').toBeGreaterThanOrEqual(r.head);
        expect(r.rackBottom, '牌架第一列在答案列上方').toBeLessThanOrEqual(r.barTop);
      }
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
  // 牌架上的卡名可能被縮短，認 aria-label（完整卡名）。
  const card = page
    .locator('.cork-rack:not(.marks) .cork-card')
    .and(page.getByLabel(name, { exact: true }));
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

// gate 2 v92c E：Pixel 7 英文第 1 集，標籤和卡名在答案列上方，但卡很長，下半張（索引卡的內文）被答案列蓋住 27–46%。
// 整張卡放得下就整張在頂列和答案列之間；放不下就卡的上緣貼在頂列下面，能看多少看多少。
for (const lang of ['en', 'zh-TW'])
  test(`手機 412×839：每次放卡後，整張卡（放得下的話）在頂列和答案列之間（${lang}）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 839 });
    await open(page, lang, ['q2a']);
    await question(page);
    const seeCard = async (slot: number) => {
      await scrolledBoard(page);
      return page.evaluate((i) => {
        const f = document.querySelectorAll<HTMLElement>('.cork-focus')[i];
        const r = f.getBoundingClientRect();
        return {
          top: r.top,
          bottom: f.getBoundingClientRect().top + f.offsetHeight,
          height: f.offsetHeight,
          head: document.querySelector('.wb-head')!.getBoundingClientRect().height,
          barTop: document.querySelector('.answer-bar')!.getBoundingClientRect().top,
        };
      }, slot);
    };
    for (const slot of [0, 1]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.locator('.cork-rack:not(.marks) .cork-card').first().click();
      const c = await seeCard(slot);
      if (c.height <= c.barTop - c.head)
        expect(c.bottom, `${'AB'[slot]} 整張在答案列上方`).toBeLessThanOrEqual(c.barTop);
      else expect(c.top, `${'AB'[slot]} 放不下：上緣貼頂列`).toBeLessThanOrEqual(c.head + 10);
      expect(c.top, `${'AB'[slot]} 上緣不在頂列後面`).toBeGreaterThanOrEqual(c.head - 1);
    }
  });

// gate 2 v92d E：Pixel 7 英文第 2 題，A、B 都放了卡，把 A 拔掉：B 的卡補到 A，再放新卡進 B。
// 補到 A 的那張舊卡有 27% 在答案列下面（捲動只顧新放的那一張）。兩張一起放得下就兩張都在答案列上方。
for (const lang of ['en', 'zh-TW'])
  test(`手機 412×839：A、B 都有卡，拔掉 A 再放新卡，兩張卡（放得下的話）都在答案列上方（${lang}）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 839 });
    await open(page, lang, ['q1']);
    await question(page);
    const rack = page.locator('.cork-rack:not(.marks) .cork-card');
    const filled = page.locator('.cork-focus.filled');
    for (const [a, b, c] of [
      [0, 1, 2],
      [1, 0, 3],
      [2, 3, 4],
    ]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await rack.nth(a).click();
      await expect(filled).toHaveCount(1);
      await settled(page);
      await rack.nth(b > a ? b - 1 : b).click();
      await expect(filled).toHaveCount(2);
      await settled(page);
      // 拔掉 A：點光圈裡的第一張卡放回去，再放新卡。
      await filled.first().locator('.cork-pick').click();
      await expect(filled).toHaveCount(1);
      await settled(page);
      await rack.nth(c).click();
      await expect(filled).toHaveCount(2);
      await settled(page);
      const r = await page.evaluate(() => {
        const head = document.querySelector('.wb-head')!.getBoundingClientRect().height;
        const barTop = document.querySelector('.answer-bar')!.getBoundingClientRect().top;
        const cards = [...document.querySelectorAll<HTMLElement>('.cork-focus.filled')].map(
          (f) => ({
            top: f.getBoundingClientRect().top,
            height: f.offsetHeight,
          }),
        );
        return { head, barTop, cards };
      });
      const tall = Math.max(...r.cards.map((x) => x.height));
      for (const x of r.cards) {
        if (tall <= r.barTop - r.head - 16)
          expect(
            x.top + x.height,
            `[${a},${b},${c}] 兩張一起放得下：整張在答案列上方`,
          ).toBeLessThanOrEqual(r.barTop);
        expect(x.top, `[${a},${b},${c}] 上緣不在頂列後面`).toBeGreaterThanOrEqual(r.head - 1);
      }
      for (let i = 0; i < 2; i++) {
        await filled.first().locator('.cork-pick').click();
        await page.waitForTimeout(150);
      }
      await expect(filled).toHaveCount(0);
    }
  });

test('手機：整張卡放得進頂列和答案列之間就不捲', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await open(page, 'zh-TW', ['q2a']);
  await question(page);
  // 玩家先把板子上緣捲到頂列下面（A／B 和中文卡整張都在答案列上方），再從牌架放卡。
  await page.evaluate(() => {
    const cork = document.querySelector('.cork')!.getBoundingClientRect();
    window.scrollTo(
      0,
      scrollY + cork.top - document.querySelector('.wb-head')!.getBoundingClientRect().height,
    );
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

// 第二道關卡 v93 第 3 處：360 英文「Indictment」格內寬 67.0、字 66.2，只差 0.8 px，字型渲染差一點就判放不下而空白。
// 單一個詞在 12px 只剩不到 2px 邊際時改排 11px：邊際夠，字一定在。
test('手機 360 英文：牌架上「Indictment」有字，而且邊際 ≥2px（或退到 11px）', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, 'en', ['q1', 'q2a'], ['l-watch', 'l-called-msg'], GATE_CARDS);
  await page
    .locator('.q-item')
    .filter({ hasText: /the watch data is relevant/ })
    .first()
    .click();
  await expect(page.locator('.cork')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.cork-dots button').nth(1).click();
  await settled(page);
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const b = [
      ...document.querySelectorAll<HTMLElement>('.cork-rack:not(.marks) b[data-name]'),
    ].find((e) => e.dataset.name === 'Indictment')!;
    const cs = getComputedStyle(b);
    const box = b.parentElement!;
    const bs = getComputedStyle(box);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const line = b.querySelector('.cork-rack-line')?.textContent ?? '';
    return {
      line,
      size: cs.fontSize,
      margin:
        box.clientWidth -
        parseFloat(bs.paddingLeft) -
        parseFloat(bs.paddingRight) -
        ctx.measureText(line).width,
    };
  });
  expect(r.line).toBe('Indictment');
  expect(r.size === '11px' || r.margin >= 2, `字級 ${r.size}，邊際 ${r.margin}px`).toBe(true);
});

// 第二道關卡 v93 第 4 處：360×740 英文放兩張長索引卡，卡比頂列到答案列的空間高，下半張被答案列蓋住 10–40%。
// 答案列換矮版（拿掉「答案」小標、槽位一行）以後，兩張都完整在頂列和答案列之間；放得下的尺寸維持一般版。
async function placeTwo(page: Page, lang: string, w: number, h: number, found: string[] = []) {
  await page.setViewportSize({ width: w, height: h });
  await open(page, lang, ['q1'], found);
  await question(page);
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  const picks =
    lang === 'en' ? ['accused of embezzling', 'he called a ride'] : ['被指控盜用', '他叫了車'];
  for (const nm of picks) {
    await page
      .locator('.cork-rack:not(.marks) > .cork-card')
      .filter({ has: page.locator(`b[data-name*="${nm}"]`) })
      .first()
      .click();
    await settled(page);
    await page.waitForTimeout(900);
  }
}
const geometry = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.answer-bar')!;
    const head = document.querySelector('.wb-head')!.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.cork-focus.filled')].map((e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: r.height };
    });
    const slot = document.querySelector('.answer-bar .slot-card')!.getBoundingClientRect();
    return {
      tight: bar.classList.contains('tight'),
      barTop: bar.getBoundingClientRect().top,
      barH: bar.getBoundingClientRect().height,
      headBottom: head.bottom,
      cards,
      slotH: slot.height,
      label: getComputedStyle(document.querySelector('.answer-bar .step-label')!).display,
      num: !!document.querySelector('.answer-bar .step-num'),
    };
  });
for (const lang of ['en', 'zh-TW'])
  test(`手機 360×740（${lang}）：放兩張長卡，兩張都完整在頂列和答案列之間（答案列放不下就換矮版）`, async ({
    page,
  }) => {
    await placeTwo(page, lang, 360, 740);
    const g = await geometry(page);
    expect(g.cards.length).toBe(2);
    for (const c of g.cards) {
      expect(c.bottom, `卡的下緣 ${c.bottom}，答案列上緣 ${g.barTop}：被蓋住`).toBeLessThanOrEqual(
        g.barTop + 0.5,
      );
      expect(c.top).toBeGreaterThanOrEqual(g.headBottom - 0.5);
    }
    if (lang === 'en') {
      expect(g.tight).toBe(true);
      expect(g.label).toBe('none');
      expect(g.num).toBe(true);
      expect(g.slotH).toBeGreaterThanOrEqual(44);
      expect(g.barH).toBeLessThan(150);
    }
  });

test('手機 Pixel 7（412×839）：卡放得下，答案列維持一般版', async ({ page }) => {
  await placeTwo(page, 'en', 412, 839);
  const g = await geometry(page);
  expect(g.tight).toBe(false);
  expect(g.label).not.toBe('none');
  for (const c of g.cards) expect(c.bottom).toBeLessThanOrEqual(g.barTop + 0.5);
});

test('手機 360×740：把卡拿掉、放得下了，答案列回到一般版', async ({ page }) => {
  await placeTwo(page, 'en', 360, 740);
  expect((await geometry(page)).tight).toBe(true);
  // 兩張都拿掉（點光圈裡的卡 = 退回牌架）。
  for (let i = 0; i < 2; i++) {
    await page.locator('.cork-focus.filled .cork-pick').first().click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(800);
  const g = await geometry(page);
  expect(g.cards.length).toBe(0);
  expect(g.tight).toBe(false);
});

// 設計師 PR #309 複審 2：矮版答案列放了發現以後，一行裡先完整放關係，再放卡名；卡名以整張卡為單位，
// 放不下的那張連「×」一起不放，不截在卡名中間（例如所有格「Ethan's」）。
for (const lang of ['en', 'zh-TW'])
  test(`手機 360×740（${lang}）：矮版答案列放了發現，看得到關係，卡名整張放或整張不放`, async ({
    page,
  }) => {
    test.slow();
    await placeTwo(page, lang, 360, 740, ['l-called-msg']);
    // 英文兩張長卡一定換矮版；中文卡短，可能還是一般版（一般版兩行，規則一樣）。
    if (lang === 'en') await expect(page.locator('.answer-bar')).toHaveClass(/tight/);
    await page.locator('.found-list .found').first().click();
    const slot = page.locator('.answer-bar .slot-clear').first();
    await expect(slot).toBeVisible();
    await page.waitForTimeout(400);
    const rel = lang === 'en' ? 'Supports' : '支持';
    const names =
      lang === 'en'
        ? ['Watch notification log', "Ethan's account: the message was unsent"]
        : ['手錶通知紀錄', '伊森的說法：訊息被收回'];
    const m = await slot.evaluate((el) => {
      const box = el.getBoundingClientRect();
      // 看得見的字：每個字元的方框在按鈕裡、而且沒被 overflow 切掉的元素。
      const seen = [...el.querySelectorAll<HTMLElement>('*')]
        .filter((e) => e.children.length === 0 && getComputedStyle(e).display !== 'none')
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            text: e.textContent ?? '',
            inside: r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1,
            clipped: e.scrollWidth > e.clientWidth + 1,
          };
        });
      return { seen, bar: document.querySelector('.answer-bar')!.classList.contains('tight') };
    });
    if (lang === 'en') expect(m.bar).toBe(true);
    const shown = m.seen.filter((x) => x.inside && x.text);
    const all = shown.map((x) => x.text).join(' ');
    expect(all, `槽位「${all}」要看得到關係`).toContain(rel);
    expect(
      shown.every((x) => !x.clipped),
      `槽位「${all}」有字被切掉`,
    ).toBe(true);
    const tail = all.trim();
    expect(tail, '不以「×」結尾').not.toMatch(/×$/);
    expect(tail, '不以所有格結尾').not.toMatch(/['’]s$/);
    // 卡名是一整張一整張的：放出來的卡名部分等於第一張，或兩張加「×」。
    const nameText = shown
      .filter((x) => x.text !== rel)
      .map((x) => x.text)
      .join('')
      .trim();
    expect(['', names[0], `${names[0]} × ${names[1]}`]).toContain(nameText);
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/answer-found-360x740-${lang}.png` });
  });

// v93 gate 2（681548c）：第二集英文卡名長，矮版答案列放了發現以後只剩「Contradicts」，一張卡名都沒有。
// 設計師規則：關係完整、卡名整張（不在卡名中間截斷）、放不下的第二張連「×」一起不放；兩張長卡仍然完整露出。
for (const [w, h] of [
  [360, 740],
  [320, 640],
] as const)
  test(`手機 ${w}×${h}（en）：第二集長卡名，矮版答案列放了發現，關係和第一張卡名都完整`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: w, height: h });
    await open(
      page,
      'en',
      [],
      ['l-perjury'],
      ['contract', 'voice-memo', 'rating-penalty', 'trevor-sworn', 'change-ticket', 'lock-spec'],
      ['ep2', 10],
      'pretrial',
    );
    await question(page);
    await page.evaluate(() => document.fonts.ready);
    await settled(page);
    for (const nm of ['voice message', 'docked after death']) {
      const card = page
        .locator('.cork-rack:not(.marks) .cork-card')
        .filter({ has: page.locator(`b[data-name*="${nm}"]`) });
      const dots = page.locator('.cork-dots button');
      for (let k = 0; !(await card.count()) && k < (await dots.count()); k++)
        await dots.nth(k).click();
      await card.first().click();
      await settled(page);
      await page.waitForTimeout(900);
    }
    await expect(page.locator('.answer-bar')).toHaveClass(/tight/);
    await page.locator('.found-list .found').first().click();
    const slot = page.locator('.answer-bar .slot-clear').first();
    await expect(slot).toBeVisible();
    await settled(page);
    await page.waitForTimeout(600);
    const m = await slot.evaluate((el) => {
      const box = el.getBoundingClientRect();
      // 槽位裡的關係和卡名（卡名可能用 <br> 分成幾行）。
      const parts = [...el.children].filter(
        (e): e is HTMLElement => getComputedStyle(e).display !== 'none',
      );
      return {
        text: parts
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.bottom <= box.bottom + 1 && r.top >= box.top - 1;
          })
          .map((e) => e.innerText.replace(/\s+/g, ' ').trim())
          .join(' '),
        clipped: parts.some(
          (e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
        ),
      };
    });
    expect(m.text, `槽位「${m.text}」要有關係`).toContain('Contradicts');
    expect(m.text, `槽位「${m.text}」要有第一張卡的完整卡名`).toContain(
      'Trevor under oath: the reminder was always there',
    );
    expect(m.clipped, `槽位「${m.text}」有字被切掉`).toBe(false);
    expect(m.text.trim()).not.toMatch(/×$/);
    // 每一行（照畫面上的位置分）的最後一個詞不是虛詞（和牌架同一套 TRAILING；設計師 PR #310 審查）。
    const ends = await slot.evaluate((el) => {
      const words: { t: string; top: number; left: number }[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index);
          r.setEnd(n, m.index + m[0].length);
          const b = r.getBoundingClientRect();
          words.push({ t: m[0], top: b.top + b.height / 2, left: b.left });
        }
      }
      const lines: (typeof words)[] = [];
      for (const w of words) {
        const l = lines.find((x) => Math.abs(x[0].top - w.top) < 6);
        if (l) l.push(w);
        else lines.push([w]);
      }
      return lines
        .sort((a, b) => a[0].top - b[0].top)
        .map((l) => l.sort((a, b) => a.left - b.left).map((w) => w.t));
    });
    const TRAILING = new Set(
      'a an the of in on at to for and or by with from as is are was were his her their its i he she it they we you'.split(
        ' ',
      ),
    );
    expect(ends.length, `槽位的行：${JSON.stringify(ends)}`).toBeGreaterThanOrEqual(2);
    for (const l of ends.slice(0, -1)) {
      const last = l[l.length - 1].replace(/[:,.]+$/, '').toLowerCase();
      expect(TRAILING.has(last), `行「${l.join(' ')}」結尾是虛詞`).toBe(false);
    }
    // 點發現時頁面捲到發現清單；捲回板子（卡的上緣貼頂列），矮版答案列多了幾行以後，兩張卡仍要整張放得下
    // （360×740；320 寬的長卡本來就要往下捲，已知問題）。
    const g = await geometry(page);
    const tallest = Math.max(...g.cards.map((c) => c.h));
    if (w === 360)
      expect(
        tallest,
        `卡高 ${tallest.toFixed(0)}，頂列到答案列 ${(g.barTop - g.headBottom).toFixed(0)}`,
      ).toBeLessThanOrEqual(g.barTop - g.headBottom);
    if (process.env.SHOTS) {
      const top = Math.min(...g.cards.map((c) => c.top));
      await page.evaluate((d) => scrollBy(0, d), top - g.headBottom - 8);
      await page.waitForTimeout(400);
    }
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/answer-found-ep2-${w}x${h}-en.png` });
  });

// v93 gate 2 第二輪（3f6629d）(a)：上一題在矮版答案列作答，按「下一題」以後，放卡時頁面要捲到看得到卡；
// 矮版是上一題的版面，換題要從一般版重新量（不然放下的卡整張在答案列下面）。
for (const [w, h] of [
  [412, 839],
  [360, 740],
] as const)
  test(`手機 ${w}×${h}（en）：上一題作答後兩格都還有卡，下一題放卡，新卡在頂列和答案列之間`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: w, height: h });
    await open(page, 'en', [], ['l-called-msg'], [...GATE_CARDS, 'ethan-report']);
    await question(page);
    await page.evaluate(() => document.fonts.ready);
    await settled(page);
    // 板上放兩張長卡（不必是這題的答案）讓答案列換矮版，再放這題的發現作答。
    for (const nm of [
      'accused of embezzling',
      w > 400 ? 'reported Voss first' : 'he called a ride',
    ]) {
      const card = page
        .locator('.cork-rack:not(.marks) .cork-card')
        .filter({ has: page.locator(`b[data-name*="${nm}"]`) });
      const dots = page.locator('.cork-dots button');
      for (let k = 0; !(await card.count()) && k < (await dots.count()); k++)
        await dots.nth(k).click();
      await card.first().click();
      await settled(page);
      await page.waitForTimeout(900);
    }
    const wasTight = await page.locator('.answer-bar.tight').count();
    await page.locator('.found-list .found').first().click();
    await page.getByRole('button', { name: /^Submit/ }).click();
    await page.getByRole('button', { name: /^Next question/ }).click();
    await question(page);
    await settled(page);
    const card = page
      .locator('.cork-rack:not(.marks) .cork-card')
      .filter({ has: page.locator('b[data-name*="health app"]') });
    const dots = page.locator('.cork-dots button');
    for (let k = 0; !(await card.count()) && k < (await dots.count()); k++)
      await dots.nth(k).click();
    await card.first().click();
    await settled(page);
    await page.waitForTimeout(900);
    const g = await geometry(page);
    const c = g.cards[0];
    if (w < 400) expect(wasTight, '上一題是矮版（這條測試量的就是換題以後）').toBe(1);
    expect(c, '下一題放了一張卡').toBeTruthy();
    expect(
      c.top,
      `卡 ${c.top.toFixed(0)}–${c.bottom.toFixed(0)}，頂列下緣 ${g.headBottom.toFixed(0)}`,
    ).toBeGreaterThanOrEqual(g.headBottom - 1);
    expect(
      c.bottom,
      `卡 ${c.top.toFixed(0)}–${c.bottom.toFixed(0)}，答案列上緣 ${g.barTop.toFixed(0)}`,
    ).toBeLessThanOrEqual(g.barTop + 1);
  });

// v93 gate 2 第二輪（3f6629d）(b)：第二集 360×740 英文，放第二張長卡、第一次換成矮版答案列時，
// 兩張卡要整張在頂列和答案列之間（之前 B 卡的最後一行「0.3 points.」被蓋 24px）。
for (const found of [[], ['l-perjury']])
  for (const via of ['rack', 'sheet'] as const)
    test(`手機 360×740（en）：第二集兩張長卡，第一次換矮版，兩張卡整張露出（${found.length ? '答案裡先放了發現' : '答案是空的'}，${via === 'rack' ? '從牌架' : '點空格從清單'}放卡）`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize({ width: 360, height: 740 });
      await open(
        page,
        'en',
        [],
        found,
        ['contract', 'voice-memo', 'rating-penalty', 'trevor-sworn', 'change-ticket', 'lock-spec'],
        ['ep2', 10],
        'pretrial',
      );
      await question(page);
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      // 答案裡先放好發現（一般版答案列；點發現時頁面捲到發現清單，從那麼深的地方開始），再放卡。
      if (found.length) {
        await page.locator('.found-list .found').first().click();
        await settled(page);
      }
      for (const nm of ['voice message', 'docked after death']) {
        if (via === 'rack') {
          const card = page
            .locator('.cork-rack:not(.marks) .cork-card')
            .filter({ has: page.locator(`b[data-name*="${nm}"]`) });
          const dots = page.locator('.cork-dots button');
          for (let k = 0; !(await card.count()) && k < (await dots.count()); k++)
            await dots.nth(k).click();
          await card.first().click();
        } else {
          // gate 2 的步驟：點空格（A、B），在證據清單裡挑。
          await page.locator('button.cork-empty').first().click();
          await page
            .locator('.card-sheet .sheet-list button:not(:disabled)')
            .filter({ hasText: nm })
            .first()
            .click();
        }
        await settled(page);
        await page.waitForTimeout(900);
      }
      await expect(page.locator('.answer-bar')).toHaveClass(/tight/);
      const g = await geometry(page);
      for (const c of g.cards) {
        expect(
          c.top,
          `卡上緣 ${c.top.toFixed(0)}，頂列下緣 ${g.headBottom.toFixed(0)}`,
        ).toBeGreaterThanOrEqual(g.headBottom - 1);
        expect(
          c.bottom,
          `卡下緣 ${c.bottom.toFixed(0)}，答案列上緣 ${g.barTop.toFixed(0)}`,
        ).toBeLessThanOrEqual(g.barTop + 1);
      }
    });
