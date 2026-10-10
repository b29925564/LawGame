/**
 * 招牌時刻的節拍表（設定集第 10.2、10.3 章）。每個時間點都是具名動態權杖的線性組合：
 * 筆錄的 CSS 寫成 calc(n × var(--dur-…))，鏡頭的計時器照同一份權杖換算毫秒，兩邊永遠對得上，
 * 元件裡也不出現裸毫秒。
 */

/** 用得到的權杖：--dur-ui、--dur-rm、--dur-cut-black、--dur-bench-hold…（去掉前綴）。 */
export type Tok = 'ui' | 'rm' | 'cut-black' | 'bench-hold' | 'stamp' | 'redact-in' | 'redact-out';
/** 一個時間點：每個權杖用了幾次。 */
export type At = Partial<Record<Tok, number>>;

export const ZERO: At = {};

export function plus(...xs: At[]): At {
  const out: At = {};
  for (const x of xs)
    for (const [k, n] of Object.entries(x) as [Tok, number][]) out[k] = (out[k] ?? 0) + n;
  return out;
}

/** CSS 用：calc(2 * var(--dur-ui) + var(--dur-stamp))；零就是 0s。 */
export function cssOf(at: At): string {
  const terms = (Object.entries(at) as [Tok, number][])
    .filter(([, n]) => n)
    .map(([k, n]) => (n === 1 ? `var(--dur-${k})` : `${n} * var(--dur-${k})`));
  return terms.length ? `calc(${terms.join(' + ')})` : '0s';
}

/** 計時器用：照樣式表上的權杖換算成毫秒（read 讀 --dur-xxx，讀不到就是 0）。 */
export function msOf(at: At, read: (tok: Tok) => number): number {
  return (Object.entries(at) as [Tok, number][]).reduce((sum, [k, n]) => sum + n * read(k), 0);
}

/** 從某個元素讀權杖（法庭的 --dur-bench-hold 定義在法庭畫面上，所以要從畫面裡的元素讀）。 */
export function tokensFrom(el: Element): (tok: Tok) => number {
  const cs = getComputedStyle(el);
  return (tok) => {
    const v = cs.getPropertyValue(`--dur-${tok}`).trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
  };
}

/**
 * 異議那一拍（第 10.3 章：打字聲 → 一刀黑 → 法官的沉默 → 小章）。
 * 時間從玩家按下異議理由那一刻起算；rows 是筆錄上各段佔的行數（一行一拍 --dur-ui 逐行出現）。
 * - bar：「異議」打完，被異議的問題蓋上黑條（--dur-redact-in）。
 * - black → bench：鏡頭一刀黑（--dur-cut-black），硬切法官席，法官沉默（--dur-bench-hold）。
 * - stamp：章落下（--dur-stamp）；成立時條上的「異議成立」跟著出現。之後法官的話逐行出現（judge）。
 * - 駁回：法官說完，黑條從右邊抽走（unbar，--dur-redact-out），切回證人（back），證人照答（rest）。
 * - 成立：法官說完再停一拍沉默，切回證人；證人不答。
 * - end：輸入解鎖、主按鈕回來、目前行記號變回炭色。
 */
export interface ObjectionBeat {
  sustained: boolean;
  bar: At;
  black: At;
  bench: At;
  stamp: At;
  judge: At;
  unbar?: At;
  back: At;
  /** 法官之後的話（駁回時證人的回答、耐心歸零時的訓斥）從這裡開始逐行出現。 */
  rest: At;
  end: At;
}

export function objectionBeat(
  sustained: boolean,
  rows: { objection: number; judge: number; rest: number },
): ObjectionBeat {
  const bar: At = { ui: rows.objection };
  const black = plus(bar, { 'redact-in': 1 });
  const bench = plus(black, { 'cut-black': 1 });
  const stamp = plus(bench, { 'bench-hold': 1 });
  const judge = plus(stamp, { stamp: 1 });
  const said = plus(judge, { ui: rows.judge });
  if (sustained) {
    const back = plus(said, { 'bench-hold': 1 });
    const rest = plus(back, { 'cut-black': 1 });
    return {
      sustained,
      bar,
      black,
      bench,
      stamp,
      judge,
      back,
      rest,
      end: plus(rest, { ui: rows.rest }),
    };
  }
  const unbar = said;
  const back = plus(unbar, { 'redact-out': 1 });
  const rest = plus(back, { 'cut-black': 1 });
  return {
    sustained,
    bar,
    black,
    bench,
    stamp,
    judge,
    unbar,
    back,
    rest,
    end: plus(rest, { ui: rows.rest }),
  };
}
