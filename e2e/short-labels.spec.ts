/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EN_NAMES } from '../src/ui/enNames';
import { innerUnits, PROPER_ZH, ROOMS_ZH } from '../src/ui/lineUnits';

/**
 * v93 排字規則（設計師裁定 4d80149）的全站掃描，320／360 × 125／150% × 中英，每一種場景讀檔進去：
 * 1. 不出框：每個文字節點的每一行（Range 量字框）都在它的框（最近的區塊）和外面兩層區塊的內寬裡。
 * 2. 專有名詞、房名、職稱不拆（enNames、PROPER_ZH、ROOMS_ZH）：除非整個名詞比框的內寬還寬（退路 B），那時只能拆在名詞內部的詞界。
 * 3. 手機框和黑底字卡的中文換行時，最後一行至少三個字（數字也算）。
 * 長篇內文（逐字稿內文、信件列表、法典、片尾、法庭字幕）是 v94 的範圍，不在這裡（LONG）。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep2', { scenes: Record<string, unknown> } & Record<string, unknown>>;

type Seed = 'blank' | 'vd' | 'closing' | 'hung' | 'clear';
const SCENES: [string, number, string, number, Seed][] = [
  ['ep1', 0, '冷開場', 0, 'blank'],
  ['ep1', 0, '冷開場 22:33', 1, 'blank'],
  ['ep1', 0, '冷開場 22:41', 2, 'blank'],
  ['ep1', 0, '冷開場訊息', 3, 'blank'],
  ['ep1', 0, '冷開場叫車', 4, 'blank'],
  ['ep1', 0, '冷開場上車', 5, 'blank'],
  ['ep1', 0, '冷開場對話選項', 6, 'blank'],
  ['ep1', 1, '集名卡', 0, 'blank'],
  ['ep1', 2, '對話', 0, 'blank'],
  ['ep1', 4, '訪談', 0, 'blank'],
  ['ep1', 7, '桌面', 0, 'blank'],
  ['ep1', 10, '取證', 0, 'blank'],
  ['ep1', 11, '協商', 0, 'blank'],
  ['ep1', 13, '案件理論', 0, 'blank'],
  ['ep1', 15, '選陪審團', 0, 'blank'],
  ['ep1', 16, '開場陳述', 0, 'blank'],
  ['ep1', 17, '交互詰問', 0, 'blank'],
  ['ep1', 22, '辯方', 0, 'blank'],
  ['ep1', 26, '結辯', 0, 'blank'],
  ['ep2', 0, '冷開場', 0, 'blank'],
  ['ep2', 0, '冷開場（赫克托）', 1, 'blank'],
  ['ep2', 0, '冷開場派單', 4, 'blank'],
  ['ep2', 4, '訪談', 0, 'blank'],
  ['ep2', 6, '桌面', 0, 'blank'],
  ['ep2', 8, '取證', 0, 'blank'],
  ['ep2', 9, '取證（對方）', 0, 'blank'],
  ['ep2', 11, '幕卡', 0, 'blank'],
  ['ep2', 12, '調解', 0, 'blank'],
  ['ep2', 14, '案件理論', 0, 'blank'],
  ['ep2', 15, '選陪審團', 0, 'clear'],
  ['ep2', 16, '開場陳述', 0, 'vd'],
  ['ep2', 17, '交互詰問', 0, 'vd'],
  ['ep2', 21, '結辯', 0, 'closing'],
  ['ep2', 22, '尾聲對話', 0, 'hung'],
  ['ep2', 30, '尾聲來電', 0, 'hung'],
  ['ep2', 30, '尾聲來電（通知）', 2, 'hung'],
  ['ep2', 30, '尾聲來電（回覆）', 3, 'hung'],
  ['ep2', 30, '尾聲來電（選項）', 4, 'hung'],
];
/**
 * 長篇內文（v94，設計師 v93 排字規則定案）：逐字稿內文（對白、旁白、語音紀錄）、桌面的信件與文件列表、法典、片尾名單、
 * 字幕卡的台詞（說話的人照查）、文件內文。
 */
const LONG =
  '.transcript, .speech, .narration, .vo-log, .list .row-item, .terms, .credits, .sub-card .tx, .doc-lines';
/**
 * 自己量框的地方（只略過「不出框」，專有名詞照查）：幕卡的幕序、幕名直排，方框是瀏覽器縮出來的（直排的 inline-block 只有一欄寬），
 * 真正的框是卡左右 26u 的邊線，act-card-narrow.spec.ts 量字的範圍（Range）在不在那兩條線裡。
 */
const OWN = '.act-head';

function progressOf(ep: string, scene: number, step: number, seed: Seed) {
  const blank = {
    episode: ep,
    scene,
    step,
    choices: ep === 'ep1' ? { 'cold-open': { 3: 0, 6: 1 } } : { 'cold-open': { 4: 1 } },
    cards: [],
    flags: [],
    ethics: [],
    scenes: {},
  };
  if (seed === 'blank') return blank;
  const src = seeds.ep2;
  const scenes = { ...(src.scenes as Record<string, unknown>) };
  const keep =
    seed === 'clear'
      ? {}
      : seed === 'vd'
        ? { 'voir-dire': scenes['voir-dire'] }
        : seed === 'closing'
          ? Object.fromEntries(Object.entries(scenes).filter(([k]) => k !== 'closing'))
          : scenes;
  return { ...src, scene, step, scenes: keep };
}

async function open(
  page: Page,
  ep: string,
  scene: number,
  step: number,
  seed: Seed,
  lang: string,
  scale: number,
) {
  await page.goto('/');
  await page.evaluate(
    ([progress, lang, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { textScale: scale, voScale: scale }, version: 1 }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }),
      );
    },
    [progressOf(ep, scene, step, seed), lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const beat = page.locator('.place-beat');
  if (await beat.count()) await beat.click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

/** 幕序（「第三｜幕」不可以；第二道關卡 4d80149 之後的全站掃描在證詞錄取的眉標找到）。 */
const ORDS = ['一', '二', '三', '四', '五', '六', '七'].map((n) => `第${n}幕`);
/** 名詞 → 允許的拆點（名詞內部的詞界：英文是空白後面，中文是 innerUnits 的切點）。 */
// 房名、職稱也是一個詞（第二道關卡 464a280 第 5 項、裁定 3）。
const NAMES = [...EN_NAMES, ...PROPER_ZH, ...ROOMS_ZH, ...ORDS]
  .sort((a, b) => b.length - a.length)
  .map((n) => {
    const cuts: number[] = [];
    if (/\p{Script=Han}/u.test(n)) {
      let at = 0;
      for (const u of innerUnits(n).slice(0, -1)) cuts.push((at += u.length));
    } else for (let i = 1; i < n.length; i++) if (n[i - 1] === ' ') cuts.push(i);
    return { n, cuts };
  });

const scan = (page: Page) =>
  page.evaluate(
    ([names, long, own]) => {
      const vis = (e: Element | null): boolean => {
        for (let x = e; x && x !== document.body; x = x.parentElement) {
          const cs = getComputedStyle(x);
          if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0')
            return false;
          if (/auto|scroll/.test(cs.overflowX) && x.scrollWidth > x.clientWidth) return false;
          // 只給讀屏器的字（sr-only：1px 的框、超出的裁掉），畫面上沒有。
          const xr = x.getBoundingClientRect();
          if (cs.overflow === 'hidden' && (xr.width <= 1 || xr.height <= 1)) return false;
          if (x.closest('[aria-hidden="true"], [inert]')) return false;
        }
        return true;
      };
      const inline = (e: Element) =>
        /^(inline|inline-block|inline-flex|inline-grid|contents)$/.test(
          getComputedStyle(e).display,
        );
      const blockOf = (e: Element | null) => {
        let x = e;
        while (x && x !== document.body && inline(x)) x = x.parentElement;
        return x;
      };
      const content = (e: Element) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        const n = (v: string) => parseFloat(v) || 0;
        return {
          l: r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft),
          r: r.right - n(cs.borderRightWidth) - n(cs.paddingRight),
        };
      };
      const name = (e: Element) =>
        `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
      const over: string[] = [];
      const split: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const r = document.createRange();
      const byBlock = new Map<Element, Text[]>();
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        if (!n.textContent?.trim() || !n.parentElement || !vis(n.parentElement)) continue;
        if (n.parentElement.closest(long)) continue;
        const b = blockOf(n.parentElement);
        if (!b) continue;
        byBlock.set(b, [...(byBlock.get(b) ?? []), n]);
        // 1. 不出框：這個區塊和外面兩層區塊（到絕對定位的為止）。
        if (n.parentElement.closest(own)) continue;
        r.selectNodeContents(n);
        const rects = [...r.getClientRects()].filter((q) => q.width && q.height);
        let box: Element | null = b;
        for (let k = 0; box && box !== document.body && k < 3; k++) {
          const c = content(box);
          const q = rects.find((q) => q.right > c.r + 1 || q.left < c.l - 1);
          if (q) {
            over.push(
              `「${n.textContent.trim().slice(0, 24)}」超出 ${name(box)} ${Math.round(Math.max(q.right - c.r, c.l - q.left))}px`,
            );
            break;
          }
          if (/absolute|fixed/.test(getComputedStyle(box).position)) break;
          box = blockOf(box.parentElement);
        }
      }
      // 2. 專有名詞不拆。
      for (const [b, nodes] of byBlock) {
        const text = nodes
          .map((n) => n.textContent)
          .join('')
          .replace(/\u00a0/g, ' ');
        const used = new Array(text.length).fill(false);
        const at = (i: number): [Text, number] => {
          let o = i;
          for (const n of nodes) {
            if (o < n.length) return [n, o];
            o -= n.length;
          }
          return [nodes[nodes.length - 1], nodes[nodes.length - 1].length];
        };
        const cw = content(b);
        for (const { n, cuts } of names as { n: string; cuts: number[] }[]) {
          for (let s = text.indexOf(n); s >= 0; s = text.indexOf(n, s + 1)) {
            if (used.slice(s, s + n.length).some(Boolean)) continue;
            used.fill(true, s, s + n.length);
            let top: number | null = null;
            let cut = -1;
            for (let i = 0; i < n.length; i++) {
              const [tn, o] = at(s + i);
              r.setStart(tn, o);
              r.setEnd(tn, Math.min(o + 1, tn.length));
              const q = r.getClientRects()[0];
              if (!q || !q.width) continue;
              if (top !== null && q.top > top + 4) {
                cut = i;
                break;
              }
              top = q.top;
            }
            if (cut < 0) continue;
            // 退路 B：整個名詞比框的內寬還寬時，拆在名詞內部的詞界可以。
            const [tn] = at(s);
            const cs = getComputedStyle(tn.parentElement!);
            const ctx = document.createElement('canvas').getContext('2d')!;
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            if ('letterSpacing' in ctx)
              ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
            const wide = ctx.measureText(n).width > cw.r - cw.l - 1;
            let c = cut;
            while (c > 0 && n[c - 1] === ' ') c--;
            const okCut = cuts.includes(cut) || cuts.includes(c) || cuts.includes(c + 1);
            if (!(wide && okCut))
              split.push(
                `${n.slice(0, cut)}｜${n.slice(cut)}（${name(b)}${wide ? '，放不下但拆在詞中間' : ''}）`,
              );
          }
        }
      }
      // 3. 手機框和黑底字卡的中文：換行時最後一行至少三個字（設計師 v93 排字規則第 4 條；「盧卡斯的手機響｜了。」）。
      const tail: string[] = [];
      for (const el of document.querySelectorAll(
        '.phone-body .bubble, .phone-body .replies button, .cine-text',
      )) {
        if (!vis(el) || !/\p{Script=Han}/u.test(el.textContent ?? '')) continue;
        let last = '';
        let top: number | null = null;
        let lines = 0;
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null)
          for (let i = 0; i < n.length; i++) {
            r.setStart(n, i);
            r.setEnd(n, i + 1);
            const q = r.getClientRects()[0];
            if (!q || !q.width) continue;
            if (top === null || q.top > top + 4) {
              lines++;
              last = '';
            }
            top = q.top;
            last += n.data[i];
          }
        // 數字也算字（「18 分鐘。」是四個字）。
        const han = last.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
        if (lines > 1 && han < 3) tail.push(`${el.textContent?.trim()}（最後一行「${last}」）`);
      }
      return { over: [...new Set(over)], split: [...new Set(split)], tail };
    },
    [NAMES, LONG, OWN] as const,
  );

for (const w of [320, 360])
  for (const scale of [1.25, 1.5])
    for (const lang of ['zh', 'en'] as const)
      test(`短標籤排字規則：不出框、專有名詞不拆（${w} 寬・${scale * 100}%・${lang}）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
        test.setTimeout(300_000);
        await page.setViewportSize({ width: w, height: 740 });
        for (const [ep, scene, label, step, seed] of SCENES) {
          await open(page, ep, scene, step, seed, lang, scale);
          const m = await scan(page);
          const at = `${ep} ${label}（scene ${scene} step ${step}）`;
          expect.soft(m.over, `${at} 字出框`).toEqual([]);
          expect.soft(m.split, `${at} 專有名詞拆開`).toEqual([]);
          expect.soft(m.tail, `${at} 最後一行不到三個字`).toEqual([]);
        }
      });
