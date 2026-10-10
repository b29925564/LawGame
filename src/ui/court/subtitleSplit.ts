/**
 * 字幕一張卡最多兩行（設定集 10.1）：長句不截斷，拆成幾張依序換。
 * 寬度用 em 估：漢字與全形 1，其他 0.55；中文任何字之間都能斷（標點不放行首），英文只在空白斷。
 */
const NO_LINE_START = /[，。、；：！？）」』”’…—,.;:!?)\]]/;

const w = (ch: string) => (/[\p{Script=Han}\u3000-ヿ＀-￯]/u.test(ch) ? 1 : 0.55);

export function lineBreaks(text: string, em: number): string[] {
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

/** 拆成每張最多 maxLines 行的幾段；回傳每段的文字與它在原句裡的起點（字元數，用來對時間）。 */
export function splitCards(
  text: string,
  em: number,
  maxLines = 2,
): { text: string; from: number }[] {
  const lines = lineBreaks(text, em);
  const out: { text: string; from: number }[] = [];
  let at = 0;
  for (let i = 0; i < lines.length; i += maxLines) {
    const part = lines.slice(i, i + maxLines);
    const zh = /[\p{Script=Han}]/u.test(part[0]);
    out.push({ text: part.join(zh ? '' : ' '), from: at });
    at += part.reduce((n, l) => n + l.length, 0);
  }
  return out;
}
