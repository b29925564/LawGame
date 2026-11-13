/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 調解 360 英文（第二道關卡 7075839 舊問題 8；設計師 v93 裁定 一之 4）：
 * 釘住的主按鈕「Call Arthur Calder for approval −1 round」不在單字中間斷行，也不蓋住條件階梯：
 * 內容區的底部讓出按鈕的高度，從最上面捲到最下面，按鈕的方框和每一階看得到的部分都不相交；每一階都捲得到、整階看得到。
 */
async function open(page: Page, scale: number) {
  await page.goto('/');
  await page.evaluate((scale) => {
    localStorage.clear();
    localStorage.setItem('lawgame-lang', 'en');
    localStorage.setItem(
      'lawgame-settings',
      JSON.stringify({ state: { textScale: scale }, version: 1 }),
    );
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep2',
          scene: 12,
          step: 0,
          choices: {},
          cards: [],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  }, scale);
  await page.reload();
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Sit down' }).click();
  await expect(page.locator('.nego-ladder li')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
}

for (const scale of [1, 1.5])
  test(`調解 360 英文 ${scale * 100}%：主按鈕不在字中間斷行，捲到哪裡都不蓋住條件階梯`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page, scale);
    const call = page.getByRole('button', { name: /Call Arthur Calder for approval/ });
    await expect(call).toBeVisible();
    // 按鈕裡的每一個字（含「−1 round」小標籤）都只在一行裡。
    const split = await call.evaluate((el) => {
      const out: string[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode())
        for (const x of (n.textContent ?? '').matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, x.index);
          r.setEnd(n, x.index + x[0].length);
          if (new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1)
            out.push(x[0]);
        }
      const cost = el.querySelector('.cost');
      if (cost && new Set([...cost.getClientRects()].map((q) => Math.round(q.top))).size > 1)
        out.push(cost.textContent ?? '');
      return out;
    });
    expect(split, '按鈕的字被拆成兩行').toEqual([]);

    // 從最上面一路捲到最下面：每一個位置，按鈕和每一階看得到的部分都不相交。
    const hits = await page.evaluate(async () => {
      const body = document.querySelector('.shell-body')!;
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Call Arthur Calder for approval/.test(b.textContent ?? ''),
      )!;
      const out: string[] = [];
      const max = body.scrollHeight - body.clientHeight;
      for (let y = 0; ; y = Math.min(max, y + 8)) {
        body.scrollTop = y;
        await new Promise((r) => requestAnimationFrame(r));
        const fr = body.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        document.querySelectorAll('.nego-ladder li').forEach((li, i) => {
          const r = li.getBoundingClientRect();
          const top = Math.max(r.top, fr.top);
          const bottom = Math.min(r.bottom, fr.bottom);
          if (bottom - top > 0.5 && b.top < bottom - 0.5 && b.bottom > top + 0.5)
            out.push(`捲到 ${Math.round(body.scrollTop)}：第 ${i + 1} 階`);
        });
        if (y >= max) break;
      }
      return out;
    });
    expect(hits, '按鈕蓋住條件階梯').toEqual([]);

    // 捲到最底（設計師 #324：360 英文 150%）：內容區最後一塊（條件階梯下面還有授權額度、對方的話、選項）整塊看得到、
    // 在按鈕上面；每一階和每一個選項都沒有被內容區下緣或按鈕切掉半截。最後一階本身捲到底的情形見下面「每一階都捲得到」的第 4 階。
    const end = await page.evaluate(async () => {
      const body = document.querySelector('.shell-body')!;
      body.scrollTop = body.scrollHeight;
      await new Promise((r) => requestAnimationFrame(r));
      const fr = body.getBoundingClientRect();
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Call Arthur Calder for approval/.test(b.textContent ?? ''),
      )!;
      const b = btn.getBoundingClientRect();
      const items = [...body.querySelectorAll('.nego-ladder li, button')];
      const last = items[items.length - 1].getBoundingClientRect();
      return {
        atBottom: Math.abs(body.scrollTop - (body.scrollHeight - body.clientHeight)) <= 1,
        lastWhole: last.top >= fr.top - 0.5 && last.bottom <= fr.bottom + 0.5,
        lastAboveButton: last.bottom <= b.top + 0.5,
        cut: items
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              (r.top < fr.bottom - 0.5 && r.bottom > fr.bottom + 0.5) ||
              (r.top < b.top - 0.5 && r.bottom > b.top + 0.5)
            );
          })
          .map((e) => e.textContent),
      };
    });
    expect(end, '捲到最底').toEqual({
      atBottom: true,
      lastWhole: true,
      lastAboveButton: true,
      cut: [],
    });

    // 每一階都捲得到：捲到那一階貼著內容區底部時，整階在內容區裡、不在按鈕底下。
    const steps = page.locator('.nego-ladder li');
    for (let i = 0; i < 4; i++) {
      const r = await steps.nth(i).evaluate((li) => {
        li.scrollIntoView({ block: 'end' });
        const fr = document.querySelector('.shell-body')!.getBoundingClientRect();
        const btn = [...document.querySelectorAll('button')].find((b) =>
          /Call Arthur Calder for approval/.test(b.textContent ?? ''),
        )!;
        const b = btn.getBoundingClientRect();
        const x = li.getBoundingClientRect();
        return {
          inside: x.top >= fr.top - 0.5 && x.bottom <= fr.bottom + 0.5,
          covered: b.top < x.bottom - 0.5 && b.bottom > x.top + 0.5,
        };
      });
      expect(r, `第 ${i + 1} 階`).toEqual({ inside: true, covered: false });
    }
  });

/**
 * 320 英文 150%：「$2.5 million」「$1.8 million」放不下一行時折兩行，兩行都要靠右，
 * 和其他價錢對齊同一條右緣（體驗評測 5ad27e3：折行後靠左，其他靠右）。
 */
test('調解 320 英文 150%：價錢折行後每一行仍靠右', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, 1.5);
  const m = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.nego-ladder .v')].map((v) => {
      const cell = v.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(v);
      const lines = [...r.getClientRects()];
      return {
        text: v.textContent,
        lines: lines.length,
        // 每一行字的右緣離格子右緣多遠。
        gap: Math.max(...lines.map((l) => Math.round(cell.right - l.right))),
        right: Math.round(cell.right),
      };
    }),
  );
  expect(
    m.some((x) => x.lines > 1),
    JSON.stringify(m),
  ).toBe(true);
  for (const x of m) expect(x.gap, JSON.stringify(x)).toBeLessThanOrEqual(1);
  expect(new Set(m.map((x) => x.right)).size, JSON.stringify(m)).toBe(1);
});
