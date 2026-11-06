import { canCut, sentencesOf, splitCards, type Card } from './court/subtitleSplit';
import { proseUnits } from './lineUnits';
import { markedCards, markedFor, twoLines, widthOf } from './plateBreaks';

type Measure = ((t: string) => number) | undefined;

const zh = (t: string) => /\p{Script=Han}/u.test(t);
const words = (t: string) => t.split(/\s+/).filter(Boolean);
/** 只剩一個字的句子（「是。」「No.」）：單獨一張太短，併進旁邊那一句。 */
const tiny = (s: string) =>
  zh(s) ? [...s.replace(/[\s。！？.!?」』"”’)）…—]/gu, '')].length < 3 : words(s).length < 2;
const join = (a: string, b: string) => (zh(a) ? a + b : `${a} ${b}`);
/** 接續卡（一句的第二張以後）至少幾個字：兩個字的卡（「at Lucas.」）是第 10 章不准的那種。 */
export const MIN_TAIL_WORDS = 3;

/**
 * 沒標斷點的英文句：一張放得下兩行（片語規則排，每一行都不比框寬，不放寬）、接續卡至少 MIN_TAIL_WORDS 個字，
 * 切點不落在冠詞、介系詞後面。能一張放完就一張。
 */
function phraseCards(text: string, em: number, measure: Measure, maxLines: number): Card[] {
  const ws = words(text);
  const fit = (a: number, b: number) =>
    maxLines === 2 ? twoLines(ws.slice(a, b), em, measure) : null;
  const cards: Card[] = [];
  let at = 0;
  for (let a = 0; a < ws.length;) {
    let b = ws.length;
    let lines = fit(a, b);
    if (!lines) {
      // 從放得進的最長一張往回找：切點合片語規則、剩下的至少 MIN_TAIL_WORDS 個字；都找不到，放寬到只要放得進。
      let max = a + 1;
      while (max < ws.length && fit(a, max + 1)) max++;
      const ok = (c: number) => canCut(ws, c) && ws.length - c >= MIN_TAIL_WORDS;
      b = -1;
      for (let c = max; c > a; c--)
        if (ok(c)) {
          b = c;
          break;
        }
      if (b < 0) b = max;
      lines = fit(a, b) ?? [ws.slice(a, b).join(' ')];
    }
    const t = ws.slice(a, b).join(' ');
    cards.push({ text: t, from: at, ...(lines.length > 1 ? { lines } : {}) });
    at += t.length + 1;
    a = b;
  }
  return cards;
}

/** 英文的卡放不下一行就硬換行（片語規則排，不交給瀏覽器照空白折：會折出「leads to the / holding cells.」）。 */
const lined = (cards: Card[], em: number, measure: Measure): Card[] =>
  cards.map((c) => {
    if (c.lines || widthOf(c.text, measure) <= em) return c;
    const lines = twoLines(words(c.text), em, measure);
    return lines && lines.length > 1 ? { ...c, lines } : c;
  });

/** 英文的卡有哪一行比框寬、或接續卡太短：切分器的結果不能用。 */
const unfit = (cards: Card[], em: number, measure: Measure) =>
  cards.some(
    (c, i) =>
      (c.lines ?? [c.text]).some((l) => widthOf(l, measure) > em + 0.01) ||
      (i > 0 && words(c.text).length < MIN_TAIL_WORDS),
  );

const zhW = (t: string) =>
  [...t].reduce((n, ch) => n + (/\p{Script=Han}|[\u3000-ヿ＀-￯]/u.test(ch) ? 1 : 0.6), 0);
/**
 * 中文一張兩行時，在最靠中間的逗號後面換行（字幕慣例）：「法警在門口停了一下，／讓伊森回頭。」
 * 兩半各自放得進一行才換；沒有逗號、或沒有一個逗號兩半都放得進，就照瀏覽器自己折。
 */
function zhLines(card: Card, em: number): Card {
  if (card.lines || zhW(card.text) <= em) return card;
  let best = -1;
  let gap = Infinity;
  for (const m of card.text.matchAll(/[，、；：]/g)) {
    const c = (m.index ?? 0) + 1;
    const l = zhW(card.text.slice(0, c));
    const r = zhW(card.text.slice(c));
    if (l > em || r > em || r === 0) continue;
    if (Math.abs(l - r) < gap) {
      best = c;
      gap = Math.abs(l - r);
    }
  }
  return best < 0 ? card : { ...card, lines: [card.text.slice(0, best), card.text.slice(best)] };
}

/** 中文沒有逗號可換行：在詞與詞之間（proseUnits，不拆詞、不讓標點起頭）找兩行最勻的一處；兩行都放得進才換。 */
function zhWordLines(card: Card, em: number): Card {
  const units = proseUnits(card.text);
  let best = -1;
  let gap = Infinity;
  let at = 0;
  for (let i = 0; i < units.length - 1; i++) {
    at += units[i].length;
    const l = zhW(card.text.slice(0, at));
    const r = zhW(card.text.slice(at));
    const rest = card.text.slice(at);
    if (l > em || r > em || /^[，。、；：！？」』）…—]/u.test(rest)) continue;
    // 方位詞、助詞不放行首（「辦公桌／旁的地毯上」）：有別的位置就不選這裡。
    const d = Math.abs(l - r) + (/^[旁上下裡內外中的了著過]/u.test(rest) ? em : 0);
    if (d < gap) {
      best = at;
      gap = d;
    }
  }
  return best < 0 ? card : { ...card, lines: [card.text.slice(0, best), card.text.slice(best)] };
}

/**
 * 中文一張要兩行、又沒有一個逗號能把它分成兩行時，不交給瀏覽器折（會折出「袖口沾了／血」）：
 * 改在最靠中間的逗號分成兩張，每張再照同樣規則排。沒有逗號才在詞與詞之間換行。
 */
function zhFit(card: Card, em: number): Card[] {
  const c = zhLines(card, em);
  if (c.lines || zhW(c.text) <= em) return [c];
  let best = -1;
  let gap = Infinity;
  for (const m of c.text.matchAll(/[，、；：]/g)) {
    const at = (m.index ?? 0) + 1;
    if (at >= c.text.length) continue;
    const d = Math.abs(zhW(c.text.slice(0, at)) - zhW(c.text.slice(at)));
    if (d < gap) {
      best = at;
      gap = d;
    }
  }
  if (best < 0) return [zhWordLines(c, em)];
  return [
    ...zhFit({ text: c.text.slice(0, best), from: c.from }, em),
    ...zhFit({ text: c.text.slice(best), from: c.from + best }, em),
  ];
}

/** 一張字幕卡：of ＝ 這一句一共分成幾張；marked ＝ 這一句的斷點是人手標的（plateBreaks.ts）。 */
export type Sub = Card & { of: number; marked: boolean };
const tag = (cards: Card[], marked: boolean): Sub[] =>
  cards.map((c) => ({ ...c, of: cards.length, marked }));

/**
 * 字幕的單位：一般是一句。只有一個字的句子（「Nothing.」「是。」）不單獨成一張，接在前一句後面當同一個單位
 * （「…at the neck. Nothing.」）；沒有前一句才接到後一句前面（「No. I never saw him go in.」）。
 * 不看寬度：同一句台詞在每個寬度都是同樣的單位，不會一下往前併、一下往後併（體驗評測 v93 關卡 2：
 * 「Nothing.」被併進下一句，變成一張卡兩句）。
 */
export function unitsOf(text: string): string[] {
  const units: string[] = [];
  let carry = '';
  for (const s of sentencesOf(text).filter(Boolean)) {
    if (carry) {
      units.push(join(carry, s));
      carry = '';
    } else if (tiny(s)) {
      if (units.length) units[units.length - 1] = join(units[units.length - 1], s);
      else carry = s;
    } else units.push(s);
  }
  if (carry) units.push(carry);
  return units;
}

/**
 * 底圖上的字幕（設定集 10.1）：一張卡一個完整的句子，最多兩行。
 * 先分成單位（unitsOf：一句，一字句接在旁邊那句）；一個單位放不下兩行，才分成幾張：英文照人工斷點（plateBreaks.ts），
 * 沒標的才退回切分器（逗號、片語規則），中文在逗號、再不行在詞界（splitCards）。
 */
export function subCards(text: string, em: number, measure?: Measure, maxLines = 2): Sub[] {
  const sents = unitsOf(text);
  return sents.flatMap((s) => {
    if (zh(s))
      return tag(
        splitCards(s, em, maxLines, measure).flatMap((c) => zhFit(c, em)),
        false,
      );
    const m = markedFor(s);
    const marked = m && markedCards(m, em, measure);
    if (marked) return tag(marked, true);
    const cards = lined(splitCards(s, em, maxLines, measure), em, measure);
    return tag(unfit(cards, em, measure) ? phraseCards(s, em, measure, maxLines) : cards, false);
  });
}
