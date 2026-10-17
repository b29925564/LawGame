import { latinBreakAllowed, type Card } from './court/subtitleSplit';

/**
 * 底圖字幕的英文人工斷點（設計師 #296 字幕模式第二版）：字幕業的做法，不讓程式猜英文句子結構。
 * 凡是在任何寬度、字級下會分成兩張以上的英文句，都在這裡標（單元測試 plateCards.test.ts 擋：沒標就紅）。
 * 記號和法庭的 judgeBreaks.ts（#290）同一套，標記取代原本的空白，字串本身不帶記號：
 *   |  分張點，第一優先（先只用這些；整句每一段都放得進兩行就夠了）
 *   ¦  分張點，第二優先（第一優先用完還有段放不進兩行，才再加這些）
 *   /  只換行（不分張）
 *   ~  勉強的換行點（只有 / 與分張點都放不進才用）
 * 沒有用到的分張點，在合成一張時當換行點用。
 * 設計師表裡的 ▏ ＝ |、▎ ＝ ¦、／ ＝ /。
 * #290 合併以後，這裡的解析器（parseMarked／plainOf／markedFor）和 judgeBreaks.ts 的是同一份：改成共用一個，兩張斷點表各留各的。
 */
export const PLATE_BREAKS: readonly string[] = [
  // ── 設計師 #296 字幕模式第二版（83b3c40）的斷點，照無襯線 500（Plex Sans）的實測字寬重排 ──
  // 最窄手機（360）加 150%：卡內寬 11.4em。「sentencing courtroom」不能拆、「of the」要黏在名詞前面，整個名詞片語兩行放不下，
  // 只好在 the 後面勉強換行（~，要設計師確認，見 WEAK_USED）。
  'The side door/of the~sentencing courtroom|leads/to the holding cells.',
  'Halfway down he stops|and looks back/at Lucas.',
  "And it has to stand|on the arguments/you've actually got.",
  "His hands are cuffed/in front of him;|he can't offer one.",
  'At the door the bailiff/pauses long enough|for Ethan to look back.',
  "On the courthouse/steps,|Ethan's sister/is waiting for him.",
  'Change the story/halfway|and all they remember/is that you changed it.',
];

/**
 * 勉強的換行點（~）用到的組合：只有「最窄手機（卡內寬 296px）加字幕 150%」，每一個都要設計師確認（#290 同一個規矩）。
 * 單元測試釘住這份清單；多一處都要再給設計師看。
 */
export const WEAK_USED: readonly string[] = [
  'The side door of the~sentencing courtroom leads to the holding cells. @296px/150%',
];

export type MarkKind = '1' | '2' | 'L' | 'W';

export interface Marked {
  words: string[];
  /** kinds[b]：第 b 個字前面的標記（沒有就是空字串）。 */
  kinds: ('' | MarkKind)[];
}

const key = (t: string) => t.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

export function parseMarked(src: string): Marked {
  const words: string[] = [];
  const kinds: ('' | MarkKind)[] = [];
  let kind: '' | MarkKind = '';
  for (const tok of src.split(/([|¦/~ ])/)) {
    if (tok === '|') kind = '1';
    else if (tok === '¦') kind = '2';
    else if (tok === '/') kind = 'L';
    else if (tok === '~') kind = 'W';
    else if (tok === ' ' || tok === '') continue;
    else {
      words.push(tok);
      kinds.push(words.length > 1 ? kind : '');
      kind = '';
    }
  }
  return { words, kinds };
}

export const plainOf = (m: Marked) => m.words.join(' ');

const BY_TEXT = new Map(PLATE_BREAKS.map((s) => [key(plainOf(parseMarked(s))), parseMarked(s)]));

/** 這一句的標記（比對時不分直彎撇號、空白）；沒標回傳 undefined。 */
export const markedFor = (sentence: string) => BY_TEXT.get(key(sentence));

type Measure = ((t: string) => number) | undefined;
export const widthOf = (t: string, measure: Measure) => (measure ? measure(t) : t.length * 0.6);

/**
 * 沒有標換行點的一張卡排成一行或兩行：放得下一行就一行；不然只在合片語規則的地方換行（冠詞、介系詞、稱謂後面不換），
 * 兩半都不比框寬（不放寬），取兩半最勻的，一個字的行排在最後（沒有別的選擇才用）。排不進兩行回傳 null。
 */
export function twoLines(ws: string[], em: number, measure: Measure): string[] | null {
  const wd = (a: number, b: number) => widthOf(ws.slice(a, b).join(' '), measure);
  const n = ws.length;
  if (wd(0, n) <= em) return [ws.join(' ')];
  let best = -1;
  let score = Infinity;
  for (let c = 1; c < n; c++) {
    if (!latinBreakAllowed(ws, c)) continue;
    const l = wd(0, c);
    const r = wd(c, n);
    if (l > em || r > em) continue;
    const sc = Math.abs(l - r) + (c === 1 || n - c === 1 ? 1000 : 0);
    if (sc < score) {
      best = c;
      score = sc;
    }
  }
  return best < 0 ? null : [ws.slice(0, best).join(' '), ws.slice(best).join(' ')];
}

/** 照標的排一句：先只用第一優先的分張點，每一段都放得進兩行就夠；不夠才加第二優先。標的放不進回傳 null。 */
export function markedCards(m: Marked, em: number, measure: Measure): Card[] | null {
  const { words, kinds } = m;
  const text = (a: number, b: number) => words.slice(a, b).join(' ');
  const wd = (a: number, b: number) => widthOf(text(a, b), measure);
  // 一張（字範圍 [a,b)）排成一行或兩行：整張一行放得下就不換行；不然在標的位置換行（/ 先，分張點次之，~ 最後），取兩半最勻的；
  // 標的位置都放不進，才用片語規則（lineBreaks）排，而且每一行都不能比框寬。
  const layout = (a: number, b: number): string[] | null => {
    if (wd(a, b) <= em) return [text(a, b)];
    for (const group of [['L'], ['1', '2'], ['W']]) {
      let best = -1;
      let gap = Infinity;
      for (let c = a + 1; c < b; c++) {
        if (!kinds[c] || !group.includes(kinds[c])) continue;
        const l = wd(a, c);
        const r = wd(c, b);
        if (l > em || r > em) continue;
        if (Math.abs(l - r) < gap) {
          best = c;
          gap = Math.abs(l - r);
        }
      }
      if (best >= 0) return [text(a, best), text(best, b)];
    }
    return twoLines(words.slice(a, b), em, measure);
  };
  for (const cutKinds of [['1'], ['1', '2']]) {
    const cuts = [0];
    for (let c = 1; c < words.length; c++)
      if (kinds[c] && cutKinds.includes(kinds[c])) cuts.push(c);
    cuts.push(words.length);
    const cards: Card[] = [];
    let at = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const lines = layout(cuts[i], cuts[i + 1]);
      if (!lines) break;
      const t = lines.join(' ');
      cards.push({ text: t, from: at, ...(lines.length > 1 ? { lines } : {}) });
      at += t.length + 1;
    }
    if (cards.length === cuts.length - 1) return cards;
  }
  return null;
}
