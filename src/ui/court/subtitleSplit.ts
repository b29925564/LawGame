/**
 * 字幕一張卡最多兩行（設定集 10.1）：長句不截斷，拆成幾張依序換。
 * 寬度用 em 估：漢字與全形 1，其他 0.6；中文任何字之間都能斷（標點不放行首），英文只在空白斷。
 */
import { proseUnits } from '../lineUnits';
import { type Marked, markedFor } from './judgeBreaks';

const NO_LINE_START = /[，。、；：！？）」』”’…—,.;:!?)\]]/;

const w = (ch: string) => (/[\p{Script=Han}\u3000-ヿ＀-￯]/u.test(ch) ? 1 : 0.6);
/** 英文用實際字型量過的寬度（em）；沒有就照每字 0.6em 估（偏寬）。splitCards 進來時暫時掛上。 */
let MEASURE: ((t: string) => number) | undefined;

// 英文在詞界斷行的片語規則（設計師 #257 r4，業界字幕慣例）：
// 冠詞、限定詞、所有格、介系詞後面不切（要切就切在它前面）；連接詞、關係詞前面優先切；
// 稱謂與後面的名字、數字與後面的單位、名字的姓和名不拆；一張至少兩個字，找不到切點寧可多一個字。
const NO_AFTER = new Set(
  'a an the this that these those his her its their my your our with beside on in at to of from for by into onto as than over under about through between'.split(
    ' ',
  ),
);
const CONJ = new Set('and but or because which who when while if so'.split(' '));
const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');
const isCap = (w: string) => /^[A-Z][a-z]/.test(w);

const TITLES = new Set(
  'officer detective det sergeant sgt lieutenant captain chief deputy judge counsel attorney prosecutor agent dr mr mrs ms prof coroner'.split(
    ' ',
  ),
);

/** 英文在第 b 個字前面切得開嗎（詞界規則）。 */
function canCut(words: string[], b: number) {
  const prev = words[b - 1];
  const next = words[b];
  if (NO_AFTER.has(norm(prev))) return false;
  if (TITLES.has(norm(prev)) && isCap(next)) return false;
  if (/^[\d$%.,-]+$/.test(prev)) return false;
  if (/\w-\w/.test(prev)) return false;
  if (isCap(prev) && isCap(next) && !/[.!?,;:]$/.test(prev)) return false;
  return true;
}

function latinLines(text: string, em: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const wd = (a: number, b: number) => lineWidth(words.slice(a, b).join(' '));
  const allowed = (b: number) => canCut(words, b);
  const cuts: number[] = [0];
  let start = 0;
  while (start < n) {
    let j = start;
    while (j < n && wd(start, j + 1) <= em) j++;
    if (j === start) j = start + 1;
    if (j >= n) break;
    let cut = -1;
    // 連接詞、關係詞前面優先（前半至少半行）；不然取最後一個可切的點，至少兩個字。
    for (let b = j; b >= start + 2; b--) {
      if (allowed(b) && CONJ.has(norm(words[b])) && wd(start, b) >= 0.5 * em) {
        cut = b;
        break;
      }
    }
    if (cut < 0)
      for (let b = j; b >= start + 2; b--)
        if (allowed(b)) {
          cut = b;
          break;
        }
    // 找不到切點：往後找下一個可切的點，多幾個字、行寬超過 35% 以內；再不行就照貪婪斷。
    if (cut < 0) {
      for (let b = j + 1; b <= n && wd(start, b) <= em * 1.35; b++) {
        if (b === n || allowed(b)) {
          cut = b;
          break;
        }
      }
    }
    if (cut < 0) cut = Math.max(start + 1, j);
    cuts.push(cut);
    start = cut;
  }
  // 尾巴只剩一個字（「scene.」）：併回前一行；放不下就把前一行最後一個可切的點挪下來。
  while (cuts.length > 1 && n - cuts[cuts.length - 1] < 2) {
    const prevStart = cuts[cuts.length - 2];
    const last = cuts[cuts.length - 1];
    if (wd(prevStart, n) <= em * 1.35) {
      cuts.pop();
      break;
    }
    let moved = -1;
    for (let b = last - 1; b >= prevStart + 2; b--) {
      if (allowed(b) && n - b >= 2) {
        moved = b;
        break;
      }
    }
    if (moved < 0) break;
    cuts[cuts.length - 1] = moved;
    break;
  }
  return cuts.map((c, i) => words.slice(c, cuts[i + 1] ?? n).join(' '));
}

function greedy(text: string, em: number): string[] {
  if (!/[\p{Script=Han}]/u.test(text)) return latinLines(text, em);
  const lines: string[] = [];
  let line = '';
  let width = 0;
  // 最近一個標點後面的斷點：字串位置與到那裡的寬度。
  let punct: { at: number; width: number } | null = null;
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
    width = 0;
    punct = null;
  };
  // 換行單位是詞（lineUnits 的中文斷詞，標點跟前一個詞）：詞不從中間斷；詞本身比一行還寬才逐字。
  const wordsOf = (t: string) => proseUnits(t, false);
  const tokens = wordsOf(text).flatMap((u) =>
    [...u].reduce((n, ch) => n + w(ch), 0) > em && !/\s/.test(u) ? [...u] : [u],
  );
  for (const tok of tokens) {
    const tw = [...tok].reduce((n, ch) => n + w(ch), 0);
    // 行尾的標點可以懸出一格（避頭尾）：詞本身放得進行內，只有它後面的標點超出就不換行。
    const hang = (tok.match(/[，。、；：！？）」』,.;:!?]+$/)?.[0] ?? '').length;
    if (
      width + tw - Math.min(hang, 1) > em &&
      line.trim() &&
      !(tok.length === 1 && NO_LINE_START.test(tok))
    ) {
      // 要換行：優先斷在標點後面（前半至少 0.4 行、後半連這個詞放得進一行），不然斷在詞與詞之間。
      const p = punct as { at: number; width: number } | null;
      if (p && p.width >= 0.4 * em && width - p.width + tw <= em && p.at < line.length) {
        const rest = line.slice(p.at);
        const restW = width - p.width;
        line = line.slice(0, p.at);
        flush();
        line = rest;
        width = restW;
      } else flush();
    }
    if (!line && /^\s+$/.test(tok)) continue;
    line += tok;
    width += tw;
    if (/[，、；：。！？,;:]$/.test(tok)) punct = { at: line.length, width };
  }
  flush();
  return lines;
}

/** 貪婪斷行後最後一行只剩幾個字（孤字）：把行寬一格一格縮，行數不變就用比較勻的那一版。 */
export function lineBreaks(text: string, em: number): string[] {
  let lines = greedy(text, em);
  const n = lines.length;
  for (
    let k = 1;
    n > 1 &&
    k <= 8 &&
    (lineWidth(lines[n - 1]) < 0.3 * em || /^[^\s\p{Script=Han}]+$/u.test(lines[n - 1]));
    k++
  ) {
    const next = greedy(text, em - k);
    if (next.length !== n) break;
    lines = next;
  }
  return lines;
}

const lineWidth = (t: string) =>
  MEASURE && !/[\p{Script=Han}]/u.test(t) ? MEASURE(t) : [...t].reduce((n, ch) => n + w(ch), 0);
const SENTENCE = /[^。！？.!?]+(?:[。！？.!?]+[」』”’)）]*\s*)?/g;
const CLAUSE = /[^，、；：—,;:]+(?:[，、；：—,;:]+\s*)?/g;

const zhOf = (t: string) => /[\p{Script=Han}]/u.test(t);
const join = (parts: string[]) => parts.join(zhOf(parts[0] ?? '') ? '' : ' ');

/** 依正規表示式分段；「Mr.」「Dr.」後面的句點不是句尾：併回下一段。 */
function piecesOf(t: string, re: RegExp) {
  const out: string[] = [];
  for (const x of (t.match(re) ?? [t]).filter((y) => y.trim())) {
    if (out.length && /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\.\s*$/.test(out[out.length - 1]))
      out[out.length - 1] += x;
    else out.push(x);
  }
  return out;
}

/** 一段文字的句子（Mr./Dr. 等後面的句點不算句尾）。 */
export const sentencesOf = (text: string) =>
  piecesOf(text, SENTENCE)
    .map((x) => x.trim())
    .filter(Boolean);

export interface Card {
  text: string;
  /** 在原句裡的起點（字元數），用來對時間。 */
  from: number;
  /** 幾個整句各佔一行時，硬換行用。 */
  lines?: string[];
}

/**
 * 字幕分張（設計師 #257）：切在標點，不是排滿就切。
 * 1. 先照句號、問號、驚嘆號分句，整句裝進一張（行數 ≤ maxLines）；
 * 2. 一句放不下，在逗號、分號、冒號、破折號分子句裝張；
 * 3. 子句還放不下，才在詞界斷（lineBreaks，中文逐字、英文在空白），每 maxLines 行一張。
 * 一句放得進一張就不拆；每張盡量是完整的句子或子句。
 */
export function splitCards(
  text: string,
  em: number,
  maxLines = 2,
  measure?: (t: string) => number,
): Card[] {
  const keep = MEASURE;
  MEASURE = measure;
  try {
    return splitCardsAt(text, em, maxLines);
  } finally {
    MEASURE = keep;
  }
}

function splitCardsAt(text: string, em: number, maxLines: number): Card[] {
  // 放得進一張＝行數不超過、而且每一行真的不比框寬（尾巴併回前一行放寬到 1.35 倍只是排版用，字幕框放不下，瀏覽器會多折一行）。
  const strict = (t: string) =>
    lineBreaks(t, em).every((l) => lineWidth(l) <= em + (zhOf(l) ? 1 : 0.01));
  const fits = (t: string) => lineBreaks(t, em).length <= maxLines && strict(t);
  const pieces = piecesOf;
  const cards: Card[] = [];
  let at = 0;
  const push = (parts: string[]) => {
    const t = join(parts.map((x) => x.trim()));
    const used = parts.reduce((n, x) => n + x.length, 0);
    const single =
      parts.length > 1 &&
      parts.length <= maxLines &&
      parts.every((x) => lineBreaks(x.trim(), em).length === 1 && strict(x.trim()));
    cards.push({ text: t, from: at, ...(single ? { lines: parts.map((x) => x.trim()) } : {}) });
    at += used;
  };
  // 把一串片段依序裝進張，裝不下就換張；片段本身放不下交給 overflow。
  const pack = (parts: string[], overflow: (p: string) => void) => {
    let cur: string[] = [];
    const flush = () => {
      if (cur.length) push(cur);
      cur = [];
    };
    for (const p of parts) {
      if (cur.length && fits(join([...cur, p].map((x) => x.trim())))) {
        cur.push(p);
      } else if (fits(p.trim())) {
        flush();
        cur.push(p);
      } else {
        flush();
        overflow(p);
      }
    }
    flush();
  };
  const hard = (p: string) => {
    const lines = lineBreaks(p.trim(), em);
    for (let k = 0; k < lines.length; k += maxLines) {
      const grp = lines.slice(k, k + maxLines);
      // 兩行以上照量好的斷點硬換行，不交給瀏覽器重折（會多出一行）。
      cards.push({ text: join(grp), from: at, ...(grp.length > 1 ? { lines: grp } : {}) });
      at += grp.reduce((n, x) => n + x.length, 0);
    }
  };
  // 尾巴的子句太短（「counsel.」）就併回前一個，不單獨成一張。
  const clauses = (p: string) => {
    const ps = pieces(p, CLAUSE);
    while (ps.length > 1 && lineWidth(ps[ps.length - 1].trim()) < 0.5 * em) {
      const last = ps.pop() as string;
      ps[ps.length - 1] += last;
    }
    pack(ps, hard);
  };
  pack(pieces(text, SENTENCE), clauses);
  return cards.length ? cards : [{ text, from: 0 }];
}

/** 一張字幕要停多久（單位數 × --dur-sub-unit）：漢字 1，其他 0.35；至少 SUB_MIN_UNITS。 */
export const SUB_MIN_UNITS = 10;
export const readUnits = (t: string) =>
  Math.round([...t].reduce((n, ch) => n + (/\s/.test(ch) ? 0 : w(ch) === 1 ? 1 : 0.35), 0));

/** 一行放得下幾 em：框寬（左右各 16px 邊距、最寬 36 個字）扣內距 24px，再留 8% 餘裕；不低於 8。 */
export const subEm = (boxWidth: number, px: number) =>
  Math.max(8, Math.floor(((Math.min(boxWidth - 32, 36 * px) - 24) / px) * 0.92));

export interface JudgeCard extends Card {
  /** 這張說話者名併進第一行（框少一行高）：呼叫端要併行、而且這張放得進併行的寬度才會有。 */
  compact?: true;
}

/** 單行略寬於框（尾巴併回前一行的結果）：在片語邊界勻成兩行，兩行各自放得進框；找不到回傳 null。 */
function balancedTwo(s: string, em: number, lead = 0, relax = false): string[] | null {
  const zh = zhOf(s);
  const u = zh ? proseUnits(s, false) : s.split(/\s+/).filter(Boolean);
  const glue = zh ? '' : ' ';
  let best: { score: number; lines: string[] } | null = null;
  for (let b = 1; b < u.length; b++) {
    if (!zh && !(relax || canCut(u, b))) continue;
    const a = u.slice(0, b).join(glue).trim();
    const c = u.slice(b).join(glue).trim();
    const eps = zh ? 1 : 0.01;
    const wa = lineWidth(a);
    const wc = lineWidth(c);
    if (wa > em - lead + eps || wc > em + eps || (zh && (wa < 3 || wc < 3))) continue;
    // 標點後面斷最優先（設計師 #290 第三輪：「律師，／這個問題沒有問題。」），其次兩行勻。
    const lone = !zh && (b < 2 || u.length - b < 2) ? 30 : 0; // 一行只有一個字：最後才選
    const score = lone + Math.abs(wa - lead - wc) - (/[，、；：,;:]$/.test(a) ? 100 : 0);
    if (!best || score < best.score) best = { score, lines: [a, c] };
  }
  return best ? best.lines : null;
}

/**
 * 說話者名併進第一行（lead em 寬）時，這張放不放得進兩行：第一行比框窄 lead，第二行整寬。
 * 一行放得下就一行；不然在片語邊界勻成兩行。
 */
function fitLead(s: string, em: number, lead: number): string[] | null {
  if (lineWidth(s) <= em - lead + (zhOf(s) ? 1 : 0.01)) return [s];
  if (lineWidth(s) > 2 * em - lead) return null;
  // 守詞界規則找不到切點（「with that／question, counsel.」）：寧可切在限定詞後面，也不讓框蓋到燈管。
  return (
    balancedTwo(s, em, lead) ??
    (CUT_EXCEPTIONS.includes(s.toLowerCase()) ? balancedTwo(s, em, lead, true) : null)
  );
}

/** 兩行放得下：行寬一格一格縮（尾巴併回前一行會讓行寬超過框寬，縮一點就排得進）；還是不行就勻成兩行。放不下回傳 null。 */
function fitTwo(s: string, em: number): string[] | null {
  for (let k = 0; k <= 3; k++) {
    const t = lineBreaks(s, em - k);
    if (t.length <= 2 && t.every((l) => lineWidth(l) <= em + (zhOf(l) ? 1 : 0.01))) return t;
  }
  return lineWidth(s) <= 2 * em ? balancedTwo(s, em) : null;
}

/**
 * 英文分張的切點偏好（設計師 #290 第三輪）：動詞和它的受詞、補語不分開，優先切在介系詞片語或子句的前面
 * （「Counsel, don't put the answer／in the question.」），或標點後面。沒有這樣的切點才切在別處（罰分，不禁止）。
 */
const BREAK_BEFORE = new Set(
  'in on at to of from for by into onto with beside over under about through between than as and but or because which who when while if so'.split(
    ' ',
  ),
);

/**
 * 詞界規則找不到切點、只能切在限定詞後面的卡（設計師例外，只有這一句；清單每多一句都要再給設計師看）。
 * 單元測試釘住這份清單。
 */
export const CUT_EXCEPTIONS: readonly string[] = ['with that question, counsel.'];

const ENDS_PUNCT = /[，、；：。！？,;:.!?]["”’)」』）]*$/;

/**
 * 一句放不下兩行：在片語邊界切成幾張，每張兩行以內、不留單字卡（設計師 #290 第三輪）。
 * 切點：英文守詞界規則（canCut），中文只在詞與詞之間；偏好標點後面、連接詞前面；張數最少，再求各張勻。
 */
function phraseCards(
  s: string,
  em: number,
  fit: (t: string) => string[] | null = (t) => fitTwo(t, em),
): Card[] | null {
  const zh = zhOf(s);
  const u = zh ? proseUnits(s, false) : s.split(/\s+/).filter(Boolean);
  const n = u.length;
  const glue = zh ? '' : ' ';
  const textOf = (a: number, b: number) => u.slice(a, b).join(glue).trim();
  const memo = new Map<string, number>();
  const cost = (a: number, b: number) => {
    const key = a + ',' + b;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let c = Infinity;
    const t = textOf(a, b);
    if (t && (a === 0 || zh || canCut(u, a)) && fit(t)) {
      const wd = lineWidth(t);
      const one = zh ? wd < 4 : b - a < 2;
      if (!one || (a === 0 && b === n))
        c =
          1000 +
          (b === n || ENDS_PUNCT.test(t) ? 0 : 150) +
          (!zh && a > 0 && !ENDS_PUNCT.test(textOf(0, a)) && !BREAK_BEFORE.has(norm(u[a]))
            ? 500
            : 0) -
          (!zh && a > 0 && CONJ.has(norm(u[a])) ? 50 : 0) +
          300 * (wd / (2 * em)) ** 2;
    }
    memo.set(key, c);
    return c;
  };
  const best: { c: number; from: number }[] = Array.from({ length: n + 1 }, () => ({
    c: Infinity,
    from: -1,
  }));
  best[0].c = 0;
  for (let b = 1; b <= n; b++)
    for (let a = 0; a < b; a++) {
      if (best[a].c === Infinity) continue;
      const c = best[a].c + cost(a, b);
      if (c < best[b].c) best[b] = { c, from: a };
    }
  if (best[n].c === Infinity) return null;
  const cuts: number[] = [];
  for (let b = n; b > 0; b = best[b].from) cuts.unshift(b);
  const out: Card[] = [];
  let a = 0;
  let at = 0;
  for (const b of cuts) {
    const t = textOf(a, b);
    const ls = fit(t) as string[];
    out.push({ text: t, from: at, ...(ls.length > 1 ? { lines: ls } : {}) });
    at += u.slice(a, b).reduce((m, x) => m + x.length, 0) + (zh ? 0 : b - a);
    a = b;
  }
  return out;
}

/**
 * 照人工斷點（judgeBreaks.ts）排一句：先只用第一優先的分張點，每一段都放得進兩行就夠；
 * 不夠才加第二優先。每段的換行只在標記的位置（沒用到的分張點也算）。放不進回傳 null。
 * lead：說話者名併進第一行佔的寬度（em）。
 */
function markedParts(
  words: string[],
  m: Marked,
  em: number,
  a0: number,
  b0: number,
  lead: number,
  opts: { oneLine?: boolean; noWeak?: boolean } = {},
): { a: number; b: number; lines: string[] }[] | null {
  const eps = 0.01;
  const text = (a: number, b: number) => words.slice(a, b).join(' ');
  let fallback = false;
  const fitRange = (a: number, b: number) => {
    const t = text(a, b);
    if (lineWidth(t) <= em - lead + eps) return [t];
    if (opts.oneLine) return null;
    // 先只用正常的換行點（/、沒用到的分張點）；放不進才用勉強的（~）。
    for (const weak of opts.noWeak ? [false] : [false, true]) {
      let best: { score: number; lines: string[] } | null = null;
      for (let c = a + 1; c < b; c++) {
        if (!m.kinds[c] || (m.kinds[c] === 'W') !== weak) continue;
        const x = text(a, c);
        const y = text(c, b);
        const wx = lineWidth(x);
        const wy = lineWidth(y);
        if (wx > em - lead + eps || wy > em + eps) continue;
        const score = Math.abs(wx - lead - wy);
        if (!best || score < best.score) best = { score, lines: [x, y] };
      }
      if (best) return best.lines;
    }
    // 標的換行點都放不進：這一段退回一般規則（單元測試會抓出來，不應該發生在標好的台詞上）。
    return fallback ? (lead ? fitLead(t, em, lead) : fitTwo(t, em)) : null;
  };
  for (const [fb, allow] of (opts.noWeak
    ? [
        [false, ['1']],
        [false, ['1', '2']],
      ]
    : [
        [false, ['1']],
        [false, ['1', '2']],
        [true, ['1', '2']],
      ]) as [boolean, string[]][]) {
    fallback = fb;
    const at = [a0];
    for (let c = a0 + 1; c < b0; c++) if (allow.includes(m.kinds[c])) at.push(c);
    at.push(b0);
    // 張數最少，再求第二優先用得少。
    const best: { cost: number; from: number }[] = at.map(() => ({ cost: Infinity, from: -1 }));
    best[0].cost = 0;
    for (let j = 1; j < at.length; j++)
      for (let i = 0; i < j; i++) {
        if (best[i].cost === Infinity || !fitRange(at[i], at[j])) continue;
        const cost = best[i].cost + 1000 + (i > 0 && m.kinds[at[i]] === '2' ? 1 : 0);
        if (cost < best[j].cost) best[j] = { cost, from: i };
      }
    const last = at.length - 1;
    if (best[last].cost === Infinity) continue;
    const cuts: number[] = [];
    for (let j = last; j > 0; j = best[j].from) cuts.unshift(j);
    let prev = 0;
    return cuts.map((j) => {
      const part = { a: at[prev], b: at[j], lines: fitRange(at[prev], at[j]) as string[] };
      prev = j;
      return part;
    });
  }
  return null;
}

/**
 * 法官的話分張（設計師 #290 第二、三輪）：一張是一個完整的句子，最多兩行，放得下就不切；
 * 張數不隨寬度變（只要每句在這個寬度放得進兩行）。一句超過兩行，在片語邊界切成兩張以上（phraseCards），不出三行、不出單字卡。
 * compact：說話者名併進第一行時名字佔幾 em（lead），以及這張在原本排法下的行數要不要併（when）；null＝不併。
 */
export function judgeCards(
  text: string,
  em: number,
  compact: {
    lead: number;
    when: (lines: number) => boolean;
    /** 名字獨立一行、台詞 n 行的框（不併行）會不會蓋到燈管或鐘。 */
    hits: (lines: number) => boolean;
  } | null,
  measure?: (t: string) => number,
  useMarks = true,
): JudgeCard[] {
  const keep = MEASURE;
  MEASURE = measure;
  try {
    const out: JudgeCard[] = [];
    let at = 0;
    for (const piece of piecesOf(text, SENTENCE)) {
      const s = piece.trim();
      if (!s) continue;
      const from = at;
      at += piece.length;
      const marked = useMarks && !zhOf(s) ? markedFor(s) : undefined;
      const sw = s.split(/\s+/).filter(Boolean);
      if (marked && marked.words.length === sw.length) {
        const parts =
          markedParts(sw, marked, em, 0, sw.length, 0, { noWeak: true }) ??
          markedParts(sw, marked, em, 0, sw.length, 0);
        if (parts) {
          // 字元起點：第 i 個字前面有 i 個空白。
          const offs: number[] = [];
          let o = 0;
          for (const w of sw) {
            offs.push(o);
            o += w.length + 1;
          }
          for (const pt of parts) {
            let lines = pt.lines;
            // 台詞放得進一行：說話者名獨立一行，不併行（設計師 #290）。兩行以上才考慮併行。
            if (compact && lines.length > 1 && compact.when(lines.length)) {
              const push = (xs: { a: number; b: number; lines: string[] }[], c: boolean) => {
                for (const x of xs)
                  out.push({
                    text: sw.slice(x.a, x.b).join(' '),
                    from: from + offs[x.a],
                    ...(x.lines.length > 1 ? { lines: x.lines } : {}),
                    ...(c ? { compact: true as const } : {}),
                  });
              };
              // 併行（不用勉強換行點）→ 每張一行、名字獨立一行（高度一樣）→ 併行（可用勉強換行點）。
              const a = markedParts(sw, marked, em, pt.a, pt.b, compact.lead, { noWeak: true });
              if (a) {
                push(a, true);
                continue;
              }
              const b = markedParts(sw, marked, em, pt.a, pt.b, 0, { oneLine: true, noWeak: true });
              if (b) {
                push(b, false);
                continue;
              }
              // 併行會逼出勉強換行點：不併行，名字獨立一行、台詞兩行（三列）；只要不蓋到燈管和鐘就用，壓頭照舊接受。
              if (!compact.hits(2)) {
                const t3 = markedParts(sw, marked, em, pt.a, pt.b, 0, { noWeak: true });
                if (t3) {
                  push(t3, false);
                  continue;
                }
              }
              const c = markedParts(sw, marked, em, pt.a, pt.b, compact.lead);
              if (c) {
                push(c, true);
                continue;
              }
              lines = pt.lines;
            }
            out.push({
              text: sw.slice(pt.a, pt.b).join(' '),
              from: from + offs[pt.a],
              ...(lines.length > 1 ? { lines } : {}),
            });
          }
          continue;
        }
      }
      const ls = fitTwo(s, em);
      const cards: Card[] = ls
        ? [{ text: s, from: 0, ...(ls.length > 1 ? { lines: ls } : {}) }]
        : (phraseCards(s, em) ?? splitCardsAt(s, em, 2));
      for (const c of cards) {
        const rows = c.lines?.length ?? 1;
        const plain = () => out.push({ ...c, from: from + c.from });
        if (!compact || rows < 2 || !compact.when(rows)) {
          plain();
          continue;
        }
        // 併行放不進：在片語邊界再切成幾張（每張都放得進併行），再不行才維持原樣。
        const fit = (t: string) => fitLead(t, em, compact.lead);
        const sub = fit(c.text) ? [c] : phraseCards(c.text, em, fit);
        if (!sub) {
          plain();
          continue;
        }
        for (const x of sub) {
          const ls = fit(x.text) as string[];
          out.push({
            text: x.text,
            from: from + c.from + x.from,
            ...(ls.length > 1 ? { lines: ls } : {}),
            compact: true as const,
          });
        }
      }
    }
    return out.length ? out : [{ text, from: 0 }];
  } finally {
    MEASURE = keep;
  }
}
