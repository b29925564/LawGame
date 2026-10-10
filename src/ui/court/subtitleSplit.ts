/**
 * 字幕一張卡最多兩行（設定集 10.1）：長句不截斷，拆成幾張依序換。
 * 寬度用 em 估：漢字與全形 1，其他 0.6；中文任何字之間都能斷（標點不放行首），英文只在空白斷。
 */
const NO_LINE_START = /[，。、；：！？）」』”’…—,.;:!?)\]]/;

const w = (ch: string) => (/[\p{Script=Han}\u3000-ヿ＀-￯]/u.test(ch) ? 1 : 0.6);

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

function latinLines(text: string, em: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const wd = (a: number, b: number) => lineWidth(words.slice(a, b).join(' '));
  const allowed = (b: number) => {
    const prev = words[b - 1];
    const next = words[b];
    if (NO_AFTER.has(norm(prev))) return false;
    if (TITLES.has(norm(prev)) && isCap(next)) return false;
    if (/^[\d$%.,-]+$/.test(prev)) return false;
    if (/\w-\w/.test(prev)) return false;
    if (isCap(prev) && isCap(next) && !/[.!?,;:]$/.test(prev)) return false;
    return true;
  };
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
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
    width = 0;
  };
  // 單字（連續非空白、非漢字）不拆；漢字逐字。
  const tokens =
    text.match(/[\p{Script=Han}\u3000-ヿ＀-￯]|\s+|[^\s\p{Script=Han}\u3000-ヿ＀-￯]+/gu) ?? [];
  for (const tok of tokens) {
    const tw = [...tok].reduce((n, ch) => n + w(ch), 0);
    if (width + tw > em && line.trim() && !(tok.length === 1 && NO_LINE_START.test(tok))) flush();
    if (!line && /^\s+$/.test(tok)) continue;
    line += tok;
    width += tw;
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

const lineWidth = (t: string) => [...t].reduce((n, ch) => n + w(ch), 0);
const SENTENCE = /[^。！？.!?]+(?:[。！？.!?]+[」』”’)）]*\s*)?/g;
const CLAUSE = /[^，、；：—,;:]+(?:[，、；：—,;:]+\s*)?/g;

const zhOf = (t: string) => /[\p{Script=Han}]/u.test(t);
const join = (parts: string[]) => parts.join(zhOf(parts[0] ?? '') ? '' : ' ');

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
export function splitCards(text: string, em: number, maxLines = 2): Card[] {
  const fits = (t: string) => lineBreaks(t, em).length <= maxLines;
  const pieces = (t: string, re: RegExp) => {
    // 「Mr.」「Dr.」後面的句點不是句尾：併回下一段。
    const out: string[] = [];
    for (const x of (t.match(re) ?? [t]).filter((y) => y.trim())) {
      if (out.length && /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\.\s*$/.test(out[out.length - 1]))
        out[out.length - 1] += x;
      else out.push(x);
    }
    return out;
  };
  const cards: Card[] = [];
  let at = 0;
  const push = (parts: string[]) => {
    const t = join(parts.map((x) => x.trim()));
    const used = parts.reduce((n, x) => n + x.length, 0);
    const single = parts.length > 1 && parts.every((x) => lineBreaks(x.trim(), em).length === 1);
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
      cards.push({ text: join(grp), from: at });
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
