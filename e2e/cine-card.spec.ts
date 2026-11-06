/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { proseUnits } from '../src/ui/lineUnits';

/**
 * 冷開場的黑底字卡（.cine）：第二道關卡 7075839 舊問題 5、6（設計師裁定 v93 一之 1、2）。
 * 1. 桌機上正文欄置中：正文欄中心＝視窗中心 ±1px，「繼續」右緣＝正文欄右緣 ±1px。
 * 2. 中文照 fitLine 規則斷行：只在 Intl.Segmenter 的詞界斷，行尾不留虛詞，最後一行至少 3 個字（標點不算）。
 */
type Card = { episode: 'ep1' | 'ep2'; step: number; zh: string };
/** 兩集冷開場所有的黑底字卡（22:49 那一格有底圖，是字幕卡，不在這裡）。 */
const CARDS: Card[] = [
  { episode: 'ep1', step: 0, zh: '週五深夜' },
  { episode: 'ep1', step: 1, zh: '城東一間小公寓' },
  { episode: 'ep1', step: 11, zh: '大廳閘門' },
  { episode: 'ep1', step: 12, zh: '港邊的公車亭' },
  { episode: 'ep1', step: 14, zh: '公車進站' },
  { episode: 'ep2', step: 0, zh: '週二傍晚' },
  { episode: 'ep2', step: 5, zh: '東河街' },
  { episode: 'ep2', step: 6, zh: '車停在路邊' },
];
const CHOICES = { ep1: { 3: 0, 6: 1 }, ep2: { 4: 1 } };

async function open(page: Page, card: Card, lang: 'zh' | 'en', scale = 1) {
  await page.goto('/');
  await page.evaluate(
    ([card, lang, choices, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', lang);
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
            episode: card.episode,
            scene: 0,
            step: card.step,
            choices: { 'cold-open': choices },
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [card, lang, CHOICES[card.episode], scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const text = page.locator('.cine .cine-text');
  await expect(text).toBeVisible();
  if (lang === 'zh') await expect(text).toContainText(card.zh);
  await page.evaluate(() => document.fonts.ready);
  // 正文的進場動畫（rise）跑完再量。
  await page.waitForTimeout(700);
}

for (const width of [1100, 1530, 1920])
  for (const lang of ['zh', 'en'] as const)
    test(`黑底字卡在桌機上置中：正文欄中心＝視窗中心，「繼續」右緣＝正文欄右緣（${width}・${lang}）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
      await page.setViewportSize({ width, height: 900 });
      for (const card of [CARDS[0], CARDS[2], CARDS[5]]) {
        await open(page, card, lang);
        const m = await page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const text = r('.cine .cine-text');
          const time = r('.cine .cine-time');
          const next = r('.cine .cine-next');
          return {
            mid: document.documentElement.clientWidth / 2,
            text: { l: text.left, r: text.right },
            time: { l: time.left, r: time.right },
            next: next.right,
          };
        });
        const tag = `${card.episode} 第 ${card.step} 步`;
        expect(
          Math.abs((m.text.l + m.text.r) / 2 - m.mid),
          `${tag} 正文欄中心`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs((m.time.l + m.time.r) / 2 - m.mid),
          `${tag} 時刻欄中心`,
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(m.next - m.text.r), `${tag}「繼續」右緣對正文欄右緣`).toBeLessThanOrEqual(
          1,
        );
      }
    });

/** 虛詞（含副詞、助詞、介詞、連詞與代名詞）：沒有標點接著時不放行尾。和證據板牌架的 FN_ZH 同一組，再加上助詞與副詞。 */
const FN = new Set([...'的之與和及或在於對把被為從到以而並是我你他她它了著過沒不又也都就還再很']);
const PUNCT = /[\s，。、；：！？）」』〉》…—,.;:!?)\]]/u;
const WORD = /[\p{L}\p{N}]/u;

// 320 寬 150%：第二道關卡 25376da 第 5 項（「卡爾德｜港東區」）。
for (const [label, w, h, scale] of [
  ['Pixel 7', 0, 0, 1],
  ['360', 360, 740, 1],
  ['1530', 1530, 900, 1],
  ['320', 320, 640, 1],
  ['320 150%', 320, 640, 1.5],
] as const)
  test(`黑底字卡的中文照 fitLine 斷行：詞界、行尾沒有虛詞、末行至少 3 個字（${label}）`, async ({
    page,
  }, info) => {
    test.skip(
      (info.project.name === 'chromium') !== (label === 'Pixel 7'),
      'Pixel 7 跑手機那一組，其他自己設視窗大小跑桌機那一組',
    );
    if (w) await page.setViewportSize({ width: w, height: h });
    for (const card of CARDS) {
      await open(page, card, 'zh', scale);
      // 每一個字的位置：換行的地方是新一行第一個字在全文裡的位置（空白不算行首）。
      const got = await page.locator('.cine .cine-text').evaluate((el) => {
        const text = el.textContent ?? '';
        const starts: number[] = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let off = 0;
        let lastTop = -1;
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const s = n.textContent ?? '';
          for (let i = 0; i < s.length; i++, off++) {
            if (/\s/.test(s[i])) continue;
            const r = document.createRange();
            r.setStart(n, i);
            r.setEnd(n, i + 1);
            const top = Math.round(r.getBoundingClientRect().top);
            if (lastTop >= 0 && Math.abs(top - lastTop) > 6) starts.push(off);
            lastTop = top;
          }
        }
        return {
          text,
          starts,
          clipped: el.scrollWidth > el.clientWidth + 1,
          ellipsis: getComputedStyle(el).textOverflow === 'ellipsis',
        };
      });
      const tag = `${label} ${card.episode} 第 ${card.step} 步「${got.text}」`;
      expect.soft(got.clipped, `${tag} 字被切掉`).toBe(false);
      expect.soft(got.ellipsis, `${tag} 不用省略號`).toBe(false);
      // 詞界：Intl.Segmenter 的詞加上本作的固定詞（lineUnits.ts 的 KEEP）。
      const marks = new Set<number>();
      let pos = 0;
      for (const u of proseUnits(got.text, false, false)) marks.add((pos += u.length));
      const cuts = [0, ...got.starts, got.text.length];
      for (let k = 1; k < cuts.length - 1; k++) {
        const at = cuts[k];
        const line = got.text.slice(cuts[k - 1], at).trimEnd();
        // 「按了 1」這種：數字跟著前面的字成一個單位，中間的空白也不能斷。
        expect
          .soft(marks.has(at), `${tag} 斷在詞中間：「${line}｜${got.text.slice(at, at + 4)}」`)
          .toBe(true);
        const last = line[line.length - 1];
        if (!PUNCT.test(last))
          expect.soft(FN.has(last), `${tag} 行尾是虛詞：「${line}」`).toBe(false);
      }
      const tail = got.text.slice(cuts[cuts.length - 2]);
      expect
        .soft([...tail].filter((c) => WORD.test(c)).length, `${tag} 最後一行「${tail}」不到 3 個字`)
        .toBeGreaterThanOrEqual(3);
    }
  });

/**
 * 窄手機放大字級：字卡不能把頁面撐寬，每個字都在正文欄裡（第二道關卡 e771fcf 第 1 項：
 * 「〈給稽核部的說明_v3〉。」整段不拆，360 中文 150% 寬 351px、欄只有 312px，頁面被撐到 376px）。
 * 篇名放得進一行才整段不拆；放不進就在篇名裡的詞界斷。
 */
for (const w of [360, 320])
  for (const scale of [1.25, 1.5])
    for (const lang of ['zh', 'en'] as const)
      test(`黑底字卡在窄手機放大字級不溢出（${w}・${scale * 100}%・${lang}）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
        await page.setViewportSize({ width: w, height: 740 });
        for (const card of CARDS) {
          await open(page, card, lang, scale);
          const m = await page.evaluate(() => {
            const el = document.querySelector('.cine .cine-text') as HTMLElement;
            const box = el.getBoundingClientRect();
            const r = document.createRange();
            r.selectNodeContents(el);
            let right = 0;
            for (const x of r.getClientRects()) right = Math.max(right, x.right);
            return {
              text: el.textContent,
              page: document.documentElement.scrollWidth,
              view: document.documentElement.clientWidth,
              over: right - box.right,
              clip: el.scrollWidth - el.clientWidth,
            };
          });
          const tag = `${card.episode} 第 ${card.step} 步「${m.text}」`;
          expect.soft(m.page, `${tag} 頁面被撐寬`).toBeLessThanOrEqual(m.view);
          expect.soft(m.over, `${tag} 字超出正文欄`).toBeLessThanOrEqual(1);
          expect.soft(m.clip, `${tag} 正文欄內容比欄寬`).toBeLessThanOrEqual(1);
          // 地名不拆（第二道關卡 25376da 第 5 項："east Calder ⏎ Harbor"）。
          if (lang === 'en' && card.episode === 'ep2' && card.step === 0) {
            const rows = await page.evaluate(() => {
              const el = document.querySelector('.cine .cine-text')!;
              const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                const i = n.textContent!.indexOf('Calder');
                if (i < 0) continue;
                const r = document.createRange();
                r.setStart(n, i);
                r.setEnd(n, i + 'Calder Harbor'.length);
                return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
              }
              return -1;
            });
            expect.soft(rows, `${tag}「Calder Harbor」排成幾行`).toBe(1);
          }
        }
      });

/**
 * 手機上字卡放不下要捲時，選單鈕釘在原位不跟著捲走（設計師裁定 25376da：捲到底時頂邊只剩半個）。
 */
test('窄手機字卡捲到底，選單鈕還在原位（320・150%・中英）', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
  await page.setViewportSize({ width: 320, height: 568 });
  let scrolled = 0;
  for (const lang of ['zh', 'en'] as const)
    for (const card of CARDS) {
      await open(page, card, lang, 1.5);
      const menu = page.locator('.menu-toggle');
      const before = await menu.boundingBox();
      const moved = await page.evaluate(() => {
        scrollTo(0, document.documentElement.scrollHeight);
        return scrollY;
      });
      if (moved > 0) scrolled++;
      const after = await menu.boundingBox();
      expect(
        after?.y,
        `${lang} ${card.episode} 第 ${card.step} 步 捲了 ${moved}px，選單鈕的上緣`,
      ).toBe(before?.y);
    }
  // 至少有一張真的要捲，這條才量得到東西。
  expect(scrolled).toBeGreaterThan(0);
});
