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

/**
 * 中文沒有逗號可換行：在詞與詞之間（proseUnits，不拆詞、不讓標點起頭）找兩行最勻的一處；兩行都放得進才換。
 * 不好的位置（第二道關卡 e771fcf 第 3、4 項）照多不好加權，有別的位置就不選：
 * - 2：虛詞、助詞放行尾（「沃斯倒在｜辦公桌旁」「手上的｜論點」，和黑底字卡 fitLine 同一組字）；方位詞、助詞放行首（「辦公桌｜旁的」）。
 * - 1：代名詞放行尾（「故事要靠你｜手上的」）。
 * - 0.5：數量詞放行尾（「一個｜故事」）。
 */
const END_FN = /[的之與和及或在於對把被為從到以而並是了著過沒不又也都就還再很]$/u;
const END_PRON = /[我你他她它]$/u;
const END_MEASURE = /[一二兩三四五六七八九十幾這那每某][個座份張位件條本次句間台輛杯]$/u;
const START_BAD = /^[旁上下裡內外中的了著過]/u;
/**
 * 「著」後面緊接開引號（「或『）：引號裡就是受詞，在引號前換行不算虛詞收尾（「銅牌寫著／「惠特洛克・海爾」。」，#447 大廳）。
 * 範圍只有這一種（設計師 #473 審查）：「著」後面不是引號、或其他虛詞，照樣擋。
 */
export const quoteOk = (l: string, r: string) => /著$/u.test(l) && /^[「『]/u.test(r);
const badness = (l: string, r: string) =>
  (END_FN.test(l) && !quoteOk(l, r) ? 2 : END_PRON.test(l) ? 1 : END_MEASURE.test(l) ? 0.5 : 0) +
  (START_BAD.test(r) ? 2 : 0);
/**
 * 斷詞器有時把代名詞和後面的介系詞切成一個詞（「他在」），整個詞放行尾就是虛詞收尾、找不到別的位置：
 * 字幕換行時拆回兩個，讓「…讓他｜在證人席上…」這種只扣代名詞分的位置可以選（#447 第二集倫理結局）。
 */
const PRON_PREP = /^([我你他她它]們?)([在對把被從到給跟])$/u;
const subUnits = (t: string) =>
  proseUnits(t).flatMap((u) => {
    const m = PRON_PREP.exec(u);
    return m ? [m[1], m[2]] : [u];
  });
function wordLines(card: Card, em: number): { lines: string[]; bad: number } | null {
  const units = subUnits(card.text);
  let best = -1;
  let gap = Infinity;
  let at = 0;
  for (let i = 0; i < units.length - 1; i++) {
    at += units[i].length;
    const l = zhW(card.text.slice(0, at));
    const r = zhW(card.text.slice(at));
    const rest = card.text.slice(at);
    if (l > em || r > em || /^[，。、；：！？」』）…—]/u.test(rest)) continue;
    const d = Math.abs(l - r) + badness(card.text.slice(0, at), rest) * em;
    if (d < gap) {
      best = at;
      gap = d;
    }
  }
  if (best < 0) return null;
  const lines = [card.text.slice(0, best), card.text.slice(best)];
  return { lines, bad: badness(lines[0], lines[1]) };
}

/**
 * 切分器硬換行（逐字貪婪）會排出「…讓他在｜證人席…」：行尾是虛詞、代名詞，或行首是方位詞。
 * 這時把這張和接續的下一張（同一個子句被硬切開的）合起來，在詞與詞之間重排：行數不變多、張數不變，
 * 不好的位置總分變少才換（#447 第二集倫理結局：「你本來可以讓／他在證人席上｜再說一次那句話。」）。
 */
const PUNCT_END = /[，。、；：！？」』）…—]$/u;
const breakBad = (lines: string[]) =>
  lines.slice(0, -1).reduce((n, l, k) => n + badness(l, lines[k + 1]), 0);
function relayout(text: string, em: number, maxLines: number): string[] | null {
  const units = subUnits(text);
  const n = units.length;
  // best[i]：前 i 個詞排完的最少（行數, 分數）；分數＝不好位置 × 100 ＋ 行寬差。
  const best: { lines: number; cost: number; prev: number }[] = Array.from(
    { length: n + 1 },
    () => ({
      lines: Infinity,
      cost: Infinity,
      prev: -1,
    }),
  );
  best[0] = { lines: 0, cost: 0, prev: -1 };
  const pos = [0];
  for (const u of units) pos.push(pos[pos.length - 1] + u.length);
  for (let i = 0; i < n; i++) {
    if (best[i].lines === Infinity) continue;
    for (let j = i + 1; j <= n; j++) {
      const line = text.slice(pos[i], pos[j]);
      if (zhW(line) > em) break;
      if (j < n && /^[，。、；：！？」』）…—]/u.test(text.slice(pos[j]))) continue;
      const bad = j < n ? badness(line, text.slice(pos[j])) : 0;
      const cost = best[i].cost + bad * 100 + (j < n ? em - zhW(line) : 0);
      const lines = best[i].lines + 1;
      if (lines < best[j].lines || (lines === best[j].lines && cost < best[j].cost))
        best[j] = { lines, cost, prev: i };
    }
  }
  if (best[n].lines > maxLines) return null;
  const out: string[] = [];
  for (let j = n; j > 0; j = best[j].prev) out.unshift(text.slice(pos[best[j].prev], pos[j]));
  return out;
}
function rebreak(cards: Card[], em: number): Card[] {
  const out = [...cards];
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    const la = a.lines ?? [a.text];
    const join2 = b && !PUNCT_END.test(a.text);
    const lb = join2 ? (b.lines ?? [b.text]) : [];
    const old = [...la, ...lb];
    // 只救虛詞、代名詞收尾和方位詞起頭（≥ 1 分）；數量詞收尾（0.5）照原樣，冷開場「手裡多了一座／水晶獎盃。」不變。
    if (breakBad(old) < 1) continue;
    const text = join2 ? a.text + b.text : a.text;
    const lines = relayout(text, em, old.length);
    if (!lines || lines.length > old.length || breakBad(lines) >= breakBad(old)) continue;
    const cut = join2 ? Math.max(1, lines.length - lb.length) : lines.length;
    const mk = (ls: string[], from: number): Card => ({
      text: ls.join(''),
      from,
      ...(ls.length > 1 ? { lines: ls } : {}),
    });
    const first = mk(lines.slice(0, cut), a.from);
    const rest = lines.slice(cut);
    out.splice(
      i,
      join2 ? 2 : 1,
      first,
      ...(rest.length ? [mk(rest, a.from + first.text.length)] : []),
    );
  }
  return out;
}

function zhWordLines(card: Card, em: number): Card {
  const w = wordLines(card, em);
  return w ? { ...card, lines: w.lines } : card;
}

/**
 * 中文一張要兩行、又沒有一個逗號能把它分成兩行時，不交給瀏覽器折（會折出「袖口沾了／血」）：
 * 改在最靠中間的逗號分成兩張，每張再照同樣規則排。沒有逗號才在詞與詞之間換行。
 */
/**
 * 一張放得完就一張：一行放得下、在逗號換得成兩行、或在詞與詞之間排得成兩行而且沒有不好的位置（行尾虛詞、行首方位詞…）。
 * 不先在逗號拆成兩張（會議室夜「你要告訴陪審團／一個故事，一個就好。」，第二道關卡 e771fcf 第 4 項：卡數 5→7）。
 */
function zhOne(card: Card, em: number): Card | null {
  const c = zhLines(card, em);
  if (c.lines || zhW(c.text) <= em) return c;
  const w = wordLines(c, em);
  return w && !w.bad ? { ...c, lines: w.lines } : null;
}

function zhFit(card: Card, em: number): Card[] {
  const one = zhOne(card, em);
  if (one) return [one];
  const c = card;
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

/** 排好的每一行都不比框寬（沒排行的卡交給瀏覽器折）。 */
const inRoom = (cards: Card[], room: number) =>
  cards.every((c) => (c.lines ?? []).every((l) => zhW(l) <= room));

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
export function subCards(
  text: string,
  em: number,
  measure?: Measure,
  maxLines = 2,
  room?: number,
): Sub[] {
  const sents = unitsOf(text);
  return sents.flatMap((s) => {
    if (zh(s)) {
      const one = maxLines === 2 ? zhOne({ text: s, from: 0 }, em) : null;
      if (one) return tag([one], false);
      const cut = (e: number) => splitCards(s, e, maxLines, measure).flatMap((c) => zhFit(c, em));
      let cards = cut(em);
      // 切分器容許中文一行比 em 多 1 字；有實際框寬（room）時，切出來有一行比框寬就收緊再切，
      // 不讓瀏覽器把那一行折成第 3 行（第二道關卡 a26de2b 第 2 項：844×390 字幕 150%「沃斯倒在地毯上，」）。
      for (let e = em - 1; room !== undefined && e >= 4 && !inRoom(cards, room); e--)
        cards = cut(e);
      return tag(rebreak(cards, em), false);
    }
    const m = markedFor(s);
    const marked = m && markedCards(m, em, measure);
    if (marked) return tag(marked, true);
    const cards = lined(splitCards(s, em, maxLines, measure), em, measure);
    return tag(unfit(cards, em, measure) ? phraseCards(s, em, measure, maxLines) : cards, false);
  });
}
