/**
 * 審判筆錄的排版（設定集第 9 章 <Transcript>）：每頁 25 行、左側行號、問／答。
 *
 * 行是自己切的，不交給瀏覽器折行：這樣頁行號是算出來的，同一份筆錄在同一個寬度下
 * 永遠落在同一頁同一行，休庭頁只放後半段時行號也接得上，之後對質時浮出的頁行也用同一套。
 * 字寬模型：Courier Prime 是等寬字，拉丁字母與數字 0.6em；中文退回 Noto Serif TC，全形 1em。
 */

export const ROWS_PER_PAGE = 25;

/**
 * 一行的寬（em），照語言固定（視覺設計師 #2，10-09）：中文一行 24 字，英文一行 44 個字元（Courier 0.6em）。
 * 真的筆錄紙每行一樣長：同一種語言在桌機、手機、休庭頁都是同一頁同一行，放不下時縮的是字級，不是行寬。
 */
export const MEASURE_ZH = 24;
export const MEASURE_EN = 44 * 0.6;
export const measureFor = (zh: boolean) => (zh ? MEASURE_ZH : MEASURE_EN);

/** 一句話在筆錄裡的格式：問、答、其他人發言（列名字）、括號裡的紀錄說明。 */
export type RecordKind = 'q' | 'a' | 'say' | 'note';

/** 黑條上寫的字：當庭異議成立的那句，或法官下令整段刪除的證詞（設定集 10.3、7-3）。 */
export type Redaction = '異議成立' | '已自紀錄刪除';

/** 法官對異議的裁定：一枚小章蓋在異議那一行的右邊（設定集 10.3）。 */
export type Ruling = '成立' | '駁回';

export interface RecordEntry {
  kind: RecordKind;
  /** 第一行前面的標記：「問」「答」或「法官：」，已經翻譯好。 */
  tag: string;
  text: string;
  redact?: Redaction;
  /** 這句是律師的異議：法官怎麼裁定。 */
  ruling?: Ruling;
  /** 異議被駁回、證人照樣回答的那句：出現時蓋著黑條，裁定後黑條抽走。 */
  unbar?: boolean;
  /**
   * 同一句的另一種語言（標記與全文）。兩種語言的頁行必須一樣（設計師 bates-review.md 第 3 點：
   * 劇本兩種語言都說「第 42 頁第 7 行」），所以每句佔的行數取兩版比較多的那一版，短的那版後面留空行。
   */
  twin?: { tag: string; text: string };
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

/**
 * 一行的最後一個詞連同後面的標點切下來（中文是最後一個字），前面的開頭括號跟著走。
 * 給裁定章讓位用：章放不下時，這個詞換到下一行，章跟著它。
 */
function tail(row: string): [string, string] {
  const toks = tokens(row);
  let i = toks.length - 1;
  while (i > 0 && toks[i].length === 1 && noStart.test(toks[i])) i--;
  while (i > 0 && toks[i - 1].length === 1 && noEnd.test(toks[i - 1])) i--;
  if (i <= 0) return [row, ''];
  return [toks.slice(0, i).join('').trimEnd(), toks.slice(i).join('')];
}

/**
 * 把一段話切成行。first 是第一行可用的寬（扣掉縮排與標記），其餘每行 measure。
 * reserve：最後一行要留給裁定章的寬（em）。放不下時最後一個詞往下掉一行，章永遠不蓋在字上（設計師 10-09）。
 */
export function wrap(
  text: string,
  measure: number,
  first = measure,
  zh = false,
  reserve = 0,
): string[] {
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
    // 行首禁則：一個標點直接掛在行尾。紙邊只多留一個字的寬（Record.tsx paperX）：已經掛出去一個
    // （「。）」的「。」）就不再掛第二個，最後一個字連同這些標點換到下一行（設計師 #225 第三輪：「）」貼紙邊）。
    if (row && tok.length === 1 && noStart.test(tok)) {
      if (w > limit() + 1e-6) {
        const [head, carry] = tail(row);
        if (head && carry) {
          rows.push(head);
          row = carry + tok;
          w = textWidth(row, zh);
          continue;
        }
      }
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
  const k = rows.length - 1;
  if (reserve > 0 && textWidth(rows[k], zh) + reserve > (k ? measure : first) + 1e-6) {
    const [head, carry] = tail(rows[k]);
    if (head && carry) rows.splice(k, 1, head, carry);
  }
  return rows;
}

/** 一句話切成的行（第一行扣掉縮排與標記）。 */
function wrapEntry(
  kind: RecordKind,
  tag: string,
  text: string,
  measure: number,
  zh: boolean,
  reserve: number,
): string[] {
  const indent = INDENT[kind];
  const tagW = kind === 'q' || kind === 'a' ? TAG_W : textWidth(tag, zh) + 0.6;
  const firstW = Math.max(4, measure - indent - (tag ? tagW : 0));
  return wrap(text, measure, firstW, zh, reserve);
}

/** 另一種語言的排版條件：一行的寬與裁定章的寬。 */
export interface Twin {
  measure: number;
  zh: boolean;
  stamp: (ruling: Ruling) => number;
}

/**
 * 整份筆錄排成行。measure 是一行可用的寬（em）；stamp：有裁定的那句，最後一行要留給章的寬（em）。
 * twin：另一種語言的排版條件。給了就讓每句佔的行數取兩種語言比較多的那一版（空行補在句尾），
 * 兩種語言的頁行就一樣。
 */
export function layout(
  entries: readonly RecordEntry[],
  measure: number,
  zh = false,
  stamp: (ruling: Ruling) => number = () => 0,
  twin?: Twin,
): RecordRow[] {
  const rows: RecordRow[] = [];
  entries.forEach((e, entry) => {
    const indent = INDENT[e.kind];
    const src = e.text.trim();
    let pos = 0;
    const lines = wrapEntry(e.kind, e.tag, e.text, measure, zh, e.ruling ? stamp(e.ruling) : 0);
    const other =
      twin && e.twin
        ? wrapEntry(
            e.kind,
            e.twin.tag,
            e.twin.text,
            twin.measure,
            twin.zh,
            e.ruling ? twin.stamp(e.ruling) : 0,
          ).length
        : 0;
    while (lines.length < other) lines.push('');
    lines.forEach((text, k) => {
      const index = rows.length;
      let space = false;
      if (text) {
        pos = src.indexOf(text, pos) + text.length;
        while (src[pos] === ' ') {
          space = true;
          pos++;
        }
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
  log: readonly { who: string; text?: string }[],
  witness: string,
  { judge, narrator }: { judge: string; narrator: string },
): RecordKind[] {
  return log.map((l, i) => {
    if (l.who === narrator) return 'note';
    if (l.who === witness) return 'a';
    if (l.who !== judge && log[i + 1]?.who === witness) return 'q';
    // 被異議打斷的問題還是「問」：真的筆錄是問句、律師的異議、法官的裁定（成立時證人不答）。
    const next = log[i + 1];
    if (
      l.who !== judge &&
      next &&
      next.who !== l.who &&
      next.text?.startsWith('異議') &&
      log[i + 2]?.who === judge
    )
      return 'q';
    return 'say';
  });
}

/**
 * 庭上的異議與裁定（設定集 10.3）：律師說「異議，…」、下一句是法官，就是一次異議。
 * 法官說「異議駁回」或證人的回答沒被刪＝駁回；其餘＝成立（被異議的問題蓋黑條、證人不答）。
 * 駁回時被異議的那個問題記成 unbar：異議打完時黑條先蓋上，章落下後抽走，問題留在紀錄裡。
 * 舊存檔的成立是「回答印出再蓋黑」（struck 在回答那一行），裁定照樣讀得出來。
 */
export function rulingsOf(
  log: readonly { who: string; text: string; struck?: boolean }[],
  { lawyer, judge, witness }: { lawyer: string; judge: string; witness: string },
): { ruling?: Ruling; unbar?: boolean }[] {
  const out: { ruling?: Ruling; unbar?: boolean }[] = log.map(() => ({}));
  log.forEach((l, i) => {
    const bench = log[i + 1];
    if (l.who !== lawyer || !l.text.startsWith('異議') || bench?.who !== judge) return;
    const answer = log[i + 2]?.who === witness ? log[i + 2] : undefined;
    const overruled = bench.text.startsWith('異議駁回') || (answer && !answer.struck);
    out[i].ruling = overruled ? '駁回' : '成立';
    const asked = log[i - 1];
    if (overruled && asked && ![lawyer, judge, witness].includes(asked.who))
      out[i - 1].unbar = true;
  });
  return out;
}
