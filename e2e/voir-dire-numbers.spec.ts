/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { fitLineUnits, innerUnits } from '../src/ui/lineUnits';

/**
 * 第二道關卡 72a9003 第 3 項：第 2 集第 15 場陪審團遴選，320／360 寬中文 150%，候選人號碼「10」「11」「12」超出號碼欄 3.6px。
 * 號碼欄跟著兩位數的寬度長；每一列的號碼欄一樣寬，頭像還是對齊在同一條線上。
 */
async function open(page: Page, w: number, lang: string, scale: number) {
  await page.setViewportSize({ width: w, height: 640 });
  await page.goto('/');
  await page.evaluate(
    ([lang, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', lang as string);
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
            scene: 15,
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
    [lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await beat.click({ timeout: 3000 }).catch(() => {});
  await page.getByRole('button', { name: /^(開始遴選|Begin jury selection)/ }).click();
  await expect(page.locator('button.cand').nth(11)).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

for (const w of [320, 360])
  for (const lang of ['zh', 'en'])
    for (const scale of [1, 1.5])
      test(`遴選候選人號碼不出框，頭像對齊（${w}・${lang}・${scale * 100}%）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗，手機那一組跑就好');
        await open(page, w, lang, scale);
        const m = await page.evaluate(() =>
          [...document.querySelectorAll('button.cand')].map((c) => {
            const no = c.querySelector('.no')!;
            const box = no.getBoundingClientRect();
            const r = document.createRange();
            r.selectNodeContents(no);
            const t = r.getBoundingClientRect();
            const pic = c.querySelector('.no + *')!.getBoundingClientRect();
            return {
              no: no.textContent,
              over: Math.max(t.right - box.right, box.left - t.left),
              pic: pic.left,
            };
          }),
        );
        expect(m.length).toBe(12);
        for (const x of m)
          expect(x.over, `${x.no} 號超出號碼欄 ${x.over.toFixed(1)}px`).toBeLessThanOrEqual(0.5);
        const lefts = m.map((x) => x.pic);
        expect(
          Math.max(...lefts) - Math.min(...lefts),
          `頭像左緣 ${lefts.join(', ')}`,
        ).toBeLessThanOrEqual(0.5);
      });

/**
 * 設計師 關卡 72a9003（#329 @8e5c11c 截圖）：候選人卡的介紹 320／360 中文 150% 把詞拆開（「安全檢｜查。」「按業績抽｜成。」）。
 * 和黑底字卡一樣排行：只在詞與詞之間換行，每一行至少 3 個字（標點不算）。
 */
for (const w of [320, 360])
  for (const scale of [1, 1.25, 1.5])
    test(`遴選候選人介紹不在詞中間換行、每行至少 3 個字（${w}・zh・${scale * 100}%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗，手機那一組跑就好');
      await open(page, w, 'zh', scale);
      const got = await page.locator('button.cand .line, button.cand .job').evaluateAll((els) =>
        els.map((el) => {
          const text = el.textContent ?? '';
          const starts: number[] = [];
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let off = 0;
          let lastTop = -1;
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const s = n.textContent ?? '';
            for (let i = 0; i < s.length; i++, off++) {
              const r = document.createRange();
              r.setStart(n, i);
              r.setEnd(n, i + 1);
              const top = Math.round(r.getBoundingClientRect().top);
              if (lastTop >= 0 && Math.abs(top - lastTop) > 6) starts.push(off);
              lastTop = top;
            }
          }
          return { text, starts, cls: el.className };
        }),
      );
      expect(got.length).toBe(24);
      // 每行至少 3 個字是介紹的規則；職稱（「小型物流行老闆」）只看不在詞中間斷。
      for (const { text, starts, cls } of got) {
        const marks = new Set<number>();
        let pos = 0;
        // 單位之間；單位比一行還寬時，它內部的詞界也可以（退路 B），詞中間不行。
        for (const u of fitLineUnits(text))
          for (const x of innerUnits(u)) marks.add((pos += x.length));
        const cuts = [0, ...starts, text.length];
        for (let k = 1; k < cuts.length; k++) {
          const row = text.slice(cuts[k - 1], cuts[k]);
          if (k < cuts.length - 1)
            expect
              .soft(marks.has(cuts[k]), `「${text.slice(0, cuts[k])}｜${text.slice(cuts[k])}」`)
              .toBe(true);
          if (cuts.length > 2 && cls === 'line')
            expect
              .soft(row.match(/[\p{L}\p{N}]/gu)?.length ?? 0, `「${row}」不到 3 個字（${text}）`)
              .toBeGreaterThanOrEqual(3);
        }
      }
      // 名字（譯名）放不下時只斷在「・」後面。
      const names = await page.locator('button.cand strong').evaluateAll((els) =>
        els.map((el) => {
          let text = '';
          const cuts: number[] = [];
          let lastTop = -1;
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (n.parentElement?.closest('.job')) continue;
            const s = n.textContent ?? '';
            for (let i = 0; i < s.length; i++) {
              const r = document.createRange();
              r.setStart(n, i);
              r.setEnd(n, i + 1);
              const top = Math.round(r.getBoundingClientRect().top);
              if (lastTop >= 0 && Math.abs(top - lastTop) > 6) cuts.push(text.length);
              lastTop = top;
              text += s[i];
            }
          }
          return { text, cuts };
        }),
      );
      for (const { text, cuts } of names)
        for (const at of cuts)
          expect.soft(text[at - 1], `名字「${text.slice(0, at)}｜${text.slice(at)}」`).toBe('・');
    });
