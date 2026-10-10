/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// 連錯（設計師 P1-8a）：不抖、不用紅。線沒釘住、鬆脫淡出，兩張卡退回原位；說明是盧卡斯的鉛筆字。
const CARDS = ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo'];
async function board(page: Page, reduced?: boolean) {
  await page.goto('/');
  await page.evaluate(
    ([cards, reduced]) => {
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
            scenes: {},
          },
        }),
      );
      if (reduced) localStorage.setItem('rd.a11y.reducedmotion', '1');
    },
    [CARDS, reduced] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page
    .getByRole('button', { name: /^證據板/ })
    .first()
    .click();
  // 手機版先看疑問清單，點第一題才看到連線台。
  const first = page.getByRole('button', { name: /^01 / });
  if (await first.isVisible()) await first.click();
  const links = page.locator('section.links');
  for (const name of ['財物清單', '心率紀錄']) {
    const side = page.locator('.card.mini').filter({ hasText: name }).first();
    if (await side.isVisible()) await side.locator('.mini-btn').click();
    else {
      await links.getByRole('button', { name: '放一張卡' }).first().click();
      await page.locator('.card-sheet button').filter({ hasText: name }).first().click();
    }
  }
  await expect(page.locator('.cork-focus.filled')).toHaveCount(2);
  await links.getByRole('radio', { name: /^支持/ }).click();
  return links;
}

for (const reduced of [false, true])
  test(`連錯：線沒釘住，兩張卡回原位，說明用鉛筆寫${reduced ? '（減少動態）' : ''}`, async ({
    page,
  }) => {
    const links = await board(page, reduced);
    const hours = page.locator('.hours');
    const before = Number(/\d+/.exec((await hours.getAttribute('aria-label')) ?? '')?.[0]);
    await links.getByRole('button', { name: '連起來' }).click();
    // 原因寫在「連起來」同一列的便條上：便條紙、鉛筆字，兩個主題同一色。
    const note = links.locator('.bench-foot .board-note');
    await expect(note).toContainText('連不起來');
    await expect(note).toHaveCSS('font-family', /LXGW WenKai TC/);
    await expect(note).toHaveCSS('color', 'rgb(52, 64, 79)');
    // 工時留在原地換成新值，不閃紅。
    await expect(hours).toHaveAttribute('aria-label', new RegExp(`剩餘工時 ${before - 1} `));
    await expect(hours.locator('.swap-old')).toHaveCount(0);
    await expect(hours.locator('.swap')).toHaveText(String(before - 1));
    // 卡回原位、連線台清空；沒有任何東西在抖。
    await expect(page.locator('.cork-focus.filled')).toHaveCount(0);
    await expect(page.locator('.cork.missing')).toHaveCount(0);
    await expect(links.getByRole('button', { name: '連起來' })).toBeDisabled();
    await expect(page.locator('.shake, .shake-rel')).toHaveCount(0);
    await expect(note).toBeVisible();
  });

// 「放大」和 A／B（設計師 P2-6 r5）：貼在卡片上緣，一半在卡外、一半壓在白邊上；不進照片、不蓋圖釘。中英文都要放得下。
// 驗收「照片的影像範圍內沒有任何介面元件」：關係結也算，選最長的關係（說明機會／Shows opportunity）量。
// 小手機和窄桌機也量：卡窄的時候「放大」往卡角靠；桌機板子窄於 600px 改用手機板面。
for (const lang of ['zh', 'en'] as const)
  test(`光圈標記不壓照片、小籤不蓋圖釘（${lang}）`, async ({ page, isMobile }) => {
    await page.goto('/');
    await page.evaluate((lang) => {
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
            cards: ['watch-listed', 'watch-photo'],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
      if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
    }, lang);
    await page.reload();
    await page
      .getByRole('button', { name: /^(繼續|Continue)/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: /^(證據板|Board)/ })
      .first()
      .click();
    const first = page.getByRole('button', { name: /^01 / });
    if (await first.isVisible()) await first.click();
    for (const name of [/驗屍照片|Autopsy photo/, /財物清單|Property inventory/]) {
      const side = page.locator('.card.mini').filter({ hasText: name }).first();
      if (await side.isVisible()) await side.locator('.mini-btn').click();
      else {
        await page
          .getByRole('button', { name: /放一張卡|Add a card/ })
          .first()
          .click();
        await page.locator('.card-sheet button').filter({ hasText: name }).first().click();
      }
    }
    await expect(page.locator('.cork-focus.filled .cork-print')).toHaveCount(2);
    await expect(page.locator('.cork .cork-zoom')).toHaveCount(2);
    if (!isMobile) {
      await page
        .locator('section.links')
        .getByRole('radio', { name: /^(說明機會|Shows opportunity)/ })
        .click();
      await expect(page.locator('.cork-knot')).toHaveText(/說明機會|Shows opportunity/);
    }
    const height = page.viewportSize()!.height;
    for (const width of isMobile ? [412, 360, 320] : [1440, 1366, 1280, 1024]) {
      await page.setViewportSize({ width, height });
      // 等推進光圈的轉場跑完。
      await page.waitForTimeout(50);
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            (a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity,
          ),
      );
      expect(await markerProblems(page), `${width}px`).toEqual([]);
    }
  });

async function markerProblems(page: Page) {
  return page.evaluate(() => {
    type P = [number, number];
    // 卡片歪了又放大：用實際的變形算照片四角和圖釘中心（畫面座標）。
    const map = (e: HTMLElement, el: HTMLElement, pts: P[]) => {
      const cs = getComputedStyle(e);
      const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
      const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
      let x = 0;
      let y = 0;
      for (let n: HTMLElement | null = el; n && n !== e; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
      }
      const box = e.getBoundingClientRect();
      // 變形後的框和沒變形時的框，左上角差多少：用原點反推。
      const at = (px: number, py: number) => m.transformPoint(new DOMPoint(px - ox, py - oy));
      const corners = [
        at(0, 0),
        at(e.offsetWidth, 0),
        at(e.offsetWidth, e.offsetHeight),
        at(0, e.offsetHeight),
      ];
      const dx = box.left - Math.min(...corners.map((p) => p.x));
      const dy = box.top - Math.min(...corners.map((p) => p.y));
      return pts.map(([px, py]) => {
        const q = at(x + px, y + py);
        return [dx + q.x, dy + q.y] as P;
      });
    };
    // 兩個凸多邊形有沒有重疊（分離軸）。
    const overlap = (a: P[], b: P[]) => {
      for (const poly of [a, b])
        for (let i = 0; i < poly.length; i++) {
          const [x1, y1] = poly[i];
          const [x2, y2] = poly[(i + 1) % poly.length];
          const pa = a.map(([x, y]) => x * (y1 - y2) + y * (x2 - x1));
          const pb = b.map(([x, y]) => x * (y1 - y2) + y * (x2 - x1));
          if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa))
            return false;
        }
      return true;
    };
    const out: string[] = [];
    const markers = Array.from(
      document.querySelectorAll<HTMLElement>('.cork .cork-tag, .cork .cork-zoom, .cork .cork-knot'),
    ).map((t) => ({ name: t.textContent, r: t.getBoundingClientRect() }));
    for (const card of Array.from(document.querySelectorAll<HTMLElement>('.cork-focus.filled'))) {
      const print = card.querySelector<HTMLElement>('.cork-print')!;
      const pick = card.querySelector<HTMLElement>('.cork-pick')!;
      const photo = map(card, print, [
        [0, 0],
        [print.offsetWidth, 0],
        [print.offsetWidth, print.offsetHeight],
        [0, print.offsetHeight],
      ]);
      const pin = getComputedStyle(pick, '::before');
      const [pc] = map(card, pick, [
        [pick.offsetWidth / 2, parseFloat(pin.top) + parseFloat(pin.height) / 2],
      ]);
      const pr =
        (parseFloat(pin.width) / 2) * (card.getBoundingClientRect().width / card.offsetWidth);
      for (const { name, r } of markers) {
        const rect: P[] = [
          [r.left, r.top],
          [r.right, r.top],
          [r.right, r.bottom],
          [r.left, r.bottom],
        ];
        if (overlap(rect, photo)) out.push(`${name} is over a photo`);
        // 圖釘：圓和標記的矩形不能相交。
        const nx = Math.max(r.left, Math.min(pc[0], r.right));
        const ny = Math.max(r.top, Math.min(pc[1], r.bottom));
        if (Math.hypot(nx - pc[0], ny - pc[1]) < pr) out.push(`${name} covers a pin`);
      }
    }
    return out;
  });
}
