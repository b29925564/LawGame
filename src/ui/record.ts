/**
 * 審判筆錄的排版（設定集第 9 章 <Transcript>）：每頁 25 行、左側行號、問／答。
 *
 * 行是自己切的，不交給瀏覽器折行：這樣頁行號是算出來的，同一份筆錄在同一個寬度下
 * 永遠落在同一頁同一行，休庭頁只放後半段時行號也接得上，之後對質時浮出的頁行也用同一套。
 * 字寬模型：Courier Prime 是等寬字，拉丁字母與數字 0.6em；中文退回 Noto Serif TC，全形 1em。
 */

export const ROWS_PER_PAGE = 25;

/**
 * 一行的寬（em）。真的筆錄紙每行一樣長，所以行寬固定：同一份筆錄在桌機、手機、休庭頁都是同一頁同一行。
 * 只有放不下（字級調大、很窄的視窗）時才縮，那時頁行號跟著字級變。
 */
export const MEASURE = 15;

/** 一句話在筆錄裡的格式：問、答、其他人發言（列名字）、括號裡的紀錄說明。 */
export type RecordKind = 'q' | 'a' | 'say' | 'note';

/** 黑條上寫的字：當庭異議成立的那句，或法官下令整段刪除的證詞（設定集 10.3、7-3）。 */
export type Redaction = '異議成立' | '已自紀錄刪除';

export interface RecordEntry {
  kind: RecordKind;
  /** 第一行前面的標記：「問」「答」或「法官：」，已經翻譯好。 */
  tag: string;
  text: string;
  redact?: Redaction;
}

export interface RecordRow {
  /** 整份筆錄的第幾行，從 0 起算。 */
  index: number;
  page: number;
  line: number;
  /** 屬於第幾句話。 */
  entry: number;
  /** 這句話的第一行（帶標記）。 */
  first: boolean;
  /** 第一行的縮排（em），續行從行首開始，跟真的筆錄一樣。 */
  indent: number;
  text: string;
  /** 這一行字的寬度（em），黑條照這個長度蓋。 */
  width: number;
  /** 原文在這一行結尾處有空白（英文在詞間換行）：報讀時要補回一個空白，中文則直接接下一行。 */
  space: boolean;
}

// 第一行的縮排：問答先空一格再放標記；發言人的名字靠左一格；括號說明縮更深。
const INDENT: Record<RecordKind, number> = { q: 2, a: 2, say: 2, note: 4 };
// 問答標記佔的寬：「問」「Q.」後面再空一格。
const TAG_W = 2.4;

const wide = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/** 中文筆錄裡的刪節號、破折號、彎引號用中文字型排成全形（Courier 的版本太窄，「……」會擠成六個點）。 */
export const CJK_PUNCT = /[…—“”‘’]/;

/** 一個字的寬（em）。zh：中文筆錄，CJK_PUNCT 也算全形。 */
export function charWidth(ch: string, zh = false): number {
  return wide.test(ch) || (zh && CJK_PUNCT.test(ch)) ? 1 : 0.6;
}

export function textWidth(s: string, zh = false): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch, zh);
  return w;
}

// 不放行首的標點：放不下時掛在上一行尾（最多超出一個字），不讓它孤零零開一行。
const noStart = /[，。、；：？！」』）》〉】,.;:?!)\]…—]/;
// 不放行尾的標點：跟著下一個字走。
const noEnd = /[「『（《〈【([]/;

/** 切成詞：拉丁字母連成一個詞（遇空白才斷），中文一字一詞，空白單獨一個。 */
function tokens(text: string): string[] {
  const out: string[] = [];
  let word = '';
  for (const ch of text) {
    if (ch === ' ' || wide.test(ch)) {
      if (word) out.push(word);
      word = '';
      out.push(ch);
    } else word += ch;
  }
  if (word) out.push(word);
  return out;
}

/** 把一段話切成行。first 是第一行可用的寬（扣掉縮排與標記），其餘每行 measure。 */
export function wrap(text: string, measure: number, first = measure, zh = false): string[] {
  const rows: string[] = [];
  let row = '';
  let w = 0;
  const limit = () => (rows.length ? measure : first);
  const flush = () => {
    rows.push(row.trimEnd());
    row = '';
    w = 0;
  };
  const toks = tokens(text.trim());
  for (let i = 0; i < toks.length; i++) {
    let tok = toks[i];
    if (tok === ' ' && !row) continue;
    // 開頭括號不留在行尾：和下一個字一起量。
    if (noEnd.test(tok) && i + 1 < toks.length && toks[i + 1] !== ' ') tok += toks[++i];
    const tw = textWidth(tok, zh);
    if (w + tw <= limit() + 1e-6) {
      row += tok;
      w += tw;
      continue;
    }
    // 行首禁則：一個標點直接掛在行尾。
    if (row && tok.length === 1 && noStart.test(tok)) {
      row += tok;
      w += tw;
      continue;
    }
    if (tok === ' ') {
      flush();
      continue;
    }
    if (row) flush();
    // 比一整行還長的詞（網址、長數字）：硬切。
    while (textWidth(tok, zh) > limit() + 1e-6) {
      let cut = '';
      let cw = 0;
      for (const ch of tok) {
        if (cw + charWidth(ch, zh) > limit() + 1e-6) break;
        cut += ch;
        cw += charWidth(ch, zh);
      }
      if (!cut) cut = [...tok][0];
      rows.push(cut);
      tok = tok.slice(cut.length);
    }
    row = tok;
    w = textWidth(tok, zh);
  }
  if (row || !rows.length) flush();
  return rows;
}

/** 整份筆錄排成行。measure 是一行可用的寬（em）。 */
export function layout(entries: readonly RecordEntry[], measure: number, zh = false): RecordRow[] {
  const rows: RecordRow[] = [];
  entries.forEach((e, entry) => {
    const indent = INDENT[e.kind];
    const tagW = e.kind === 'q' || e.kind === 'a' ? TAG_W : textWidth(e.tag, zh) + 0.6;
    const firstW = Math.max(4, measure - indent - (e.tag ? tagW : 0));
    const src = e.text.trim();
    let pos = 0;
    wrap(e.text, measure, firstW, zh).forEach((text, k) => {
      const index = rows.length;
      pos = src.indexOf(text, pos) + text.length;
      let space = false;
      while (src[pos] === ' ') {
        space = true;
        pos++;
      }
      rows.push({
        index,
        page: Math.floor(index / ROWS_PER_PAGE) + 1,
        line: (index % ROWS_PER_PAGE) + 1,
        entry,
        first: k === 0,
        indent: k === 0 ? indent : 0,
        text,
        width: textWidth(text, zh),
        space,
      });
    });
  });
  return rows;
}

/**
 * 每句話在筆錄裡算問、答還是發言：證人說的是答；緊接著證人回答的那句律師發言是問；
 * 法官與其他發言（異議、裁定）列名字；旁白是括號裡的紀錄說明。
 */
export function kindsOf(
  log: readonly { who: string }[],
  witness: string,
  { judge, narrator }: { judge: string; narrator: string },
): RecordKind[] {
  return log.map((l, i) => {
    if (l.who === narrator) return 'note';
    if (l.who === witness) return 'a';
    if (l.who !== judge && log[i + 1]?.who === witness) return 'q';
    return 'say';
  });
}
