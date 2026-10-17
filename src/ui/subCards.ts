import { sentences, splitCards, type Card } from './court/subtitleSplit';

type Measure = ((t: string) => number) | undefined;

const zh = (t: string) => /\p{Script=Han}/u.test(t);
/** 只剩一個字的句子（「是。」「No.」）：單獨一張太短，併進旁邊那一句。 */
const tiny = (s: string) =>
  zh(s)
    ? [...s.replace(/[\s。！？.!?」』"”’)）…—]/gu, '')].length < 3
    : s.split(/\s+/).filter(Boolean).length < 2;
const join = (a: string, b: string) => (zh(a) ? a + b : `${a} ${b}`);
const widthOf = (t: string, measure: Measure) => (measure ? measure(t) : t.length * 0.6);

/**
 * 切分器（splitCards）把尾巴只剩一個字的末行併回前一行，寬度放寬到 1.35 倍，那是排版用的；
 * 字幕框放不下，瀏覽器會多折一行、變三行。英文有哪一行比框寬，就整句改用逐字貪婪折行，每張最多兩行。
 */
function strictCards(text: string, em: number, measure: Measure, maxLines: number): Card[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && widthOf([...cur, w].join(' '), measure) <= em) cur.push(w);
    else lines.push([w]);
  }
  const cards: string[][][] = [];
  for (let i = 0; i < lines.length; i += maxLines) cards.push(lines.slice(i, i + maxLines));
  // 最後一張只剩一個字：把前一張最後一行的最後一個字挪下來陪它。
  const last = cards[cards.length - 1];
  const prev = cards[cards.length - 2];
  if (prev && last.length === 1 && last[0].length === 1) {
    const from = prev[prev.length - 1];
    if (from.length > 1 && widthOf([from[from.length - 1], last[0][0]].join(' '), measure) <= em)
      last[0].unshift(from.pop() as string);
  }
  let at = 0;
  return cards.map((c) => {
    const ls = c.map((l) => l.join(' '));
    const card: Card = { text: ls.join(' '), from: at, ...(ls.length > 1 ? { lines: ls } : {}) };
    at += card.text.length + 1;
    return card;
  });
}

const tooWide = (cards: Card[], em: number, measure: Measure) =>
  cards.some((c) => c.lines?.some((l) => widthOf(l, measure) > em + 0.01));

/**
 * 底圖上的字幕（設定集 10.1）：一張卡一個完整的句子，最多兩行。
 * 先依句號、問號、驚嘆號分句；一句放不下兩行，才在逗號、分號、冒號切子句，最後才在詞界斷（splitCards）。
 * 只有一個字的句子併進前一句（沒有前一句就併進後一句），放得進兩行才併。
 */
export function subCards(text: string, em: number, measure?: Measure, maxLines = 2): Card[] {
  const sents: string[] = [];
  const fitsOne = (s: string) => splitCards(s, em, maxLines, measure).length === 1;
  let carry = '';
  for (const s of sentences(text).filter(Boolean)) {
    if (carry) {
      // 前面有個一字句等著併進這一句。
      const m = join(carry, s);
      if (fitsOne(m)) sents.push(m);
      else sents.push(carry, s);
      carry = '';
    } else if (tiny(s)) {
      const prev = sents[sents.length - 1];
      if (prev && fitsOne(join(prev, s))) sents[sents.length - 1] = join(prev, s);
      else carry = s;
    } else sents.push(s);
  }
  if (carry) sents.push(carry);
  return sents.flatMap((s) => {
    const cards = splitCards(s, em, maxLines, measure);
    return !zh(s) && tooWide(cards, em, measure) ? strictCards(s, em, measure, maxLines) : cards;
  });
}
