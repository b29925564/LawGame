/**
 * 字幕一張卡最多兩行（設定集 10.1）：長句不截斷，拆成幾張依序換。
 * 寬度用 em 估：漢字與全形 1，其他 0.6；中文任何字之間都能斷（標點不放行首），英文只在空白斷。
 */
const NO_LINE_START = /[，。、；：！？）」』”’…—,.;:!?)\]]/;

const w = (ch: string) => (/[\p{Script=Han}\u3000-ヿ＀-￯]/u.test(ch) ? 1 : 0.6);

function greedy(text: string, em: number): string[] {
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
  for (let k = 1; n > 1 && k <= 8 && lineWidth(lines[n - 1]) < 0.3 * em; k++) {
    const next = greedy(text, em - k);
    if (next.length !== n) break;
    lines = next;
  }
  return lines;
}

const lineWidth = (t: string) => [...t].reduce((n, ch) => n + w(ch), 0);
const width = (t: string) => [...t].reduce((n, ch) => n + w(ch), 0);

/** 兩行的一張裡有句號：兩半各自放得進一行才在句號後換行，不然照原本的斷法。 */
function breakAtSentence(text: string, em: number): string[] | null {
  let best: string[] | null = null;
  for (const m of text.matchAll(/[。！？.!?]+\s*/g)) {
    const cut = (m.index ?? 0) + m[0].length;
    const a = text.slice(0, cut).trim();
    const b = text.slice(cut).trim();
    if (!a || !b || width(a) > em || width(b) > em) continue;
    if (!best || Math.max(width(a), width(b)) < Math.max(width(best[0]), width(best[1])))
      best = [a, b];
  }
  return best;
}

/** 拆成每張最多 maxLines 行的幾段；回傳每段的文字與它在原句裡的起點（字元數，用來對時間）。 */
export function splitCards(
  text: string,
  em: number,
  maxLines = 2,
): { text: string; from: number; lines?: string[] }[] {
  const lines = lineBreaks(text, em);
  const out: { text: string; from: number; lines?: string[] }[] = [];
  let at = 0;
  for (let i = 0; i < lines.length; i += maxLines) {
    let part = lines.slice(i, i + maxLines);
    let forced: string[] | undefined;
    if (part.length === 2) {
      const zh0 = /[\p{Script=Han}]/u.test(part[0]);
      forced = breakAtSentence(part.join(zh0 ? '' : ' '), em) ?? undefined;
      if (forced) part = forced;
    }
    const zh = /[\p{Script=Han}]/u.test(part[0]);
    out.push({ text: part.join(zh ? '' : ' '), from: at, ...(forced ? { lines: forced } : {}) });
    at += part.reduce((n, l) => n + l.length, 0);
  }
  return out;
}
