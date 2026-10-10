/**
 * 判決四拍的時間表（設定集 10.5「判決：三種停法 × 窗光」）。
 * 時間碼以裁決書出現為 0；① 是裁決書手寫，② 切黑條頁，③ 黑底字卡，④ 窗光。
 * 設定集的碼是「勾」的情況（手寫在 2.400 結束）：之後每一拍都排在「最後一筆寫完再停 --dur-verdict-settle」之後
 * （設計師 #249 第 2 條），所以僵局寫「未達一致」四個字，②③④ 一起往後推。
 * 毫秒全部來自權杖（court.css／styles.css）：這裡只拼，不寫死。
 */
export type Verdict = '無罪' | '有罪' | '陪審團僵局';

export interface Tokens {
  /** --dur-hand-lead */ lead: number;
  /** --dur-hand */ hand: number;
  /** --dur-pen-lift */ lift: number;
  /** --dur-verdict-settle */ settle: number;
  /** --dur-cut-black */ cutBlack: number;
  /** --dur-redact-out */ redactOut: number;
  /** --dur-redact-in */ redactIn: number;
  /** --dur-turn */ turn: number;
  /** --dur-lightmove */ lightMove: number;
  /** --dur-frame */ frame: number;
  /** --dur-verdict-light-hold */ lightHold: number;
}

/** 設定集 10.5 時間碼表裡，相對於「② 切黑條頁」的偏移（ms）：黑條何時開始動之後的各個點。 */
const SPEC = {
  // 筆錄頁出現 → 黑條開始動（2.483 → 2.983）
  read: 500,
  // 黑條抽到停點之後 → 字卡（無罪 3.483→3.966、有罪 4.050→4.866、僵局 3.233→4.466）
  afterPull: { 無罪: 483, 有罪: 816, 陪審團僵局: 1233 },
  // 有罪：抽完 → 第 22 行再蓋（3.483 → 3.883）
  recoverGap: 400,
} as const;

export interface Beats {
  /** ② 黑條頁：切黑開始 → 筆錄頁出現 → 黑條開始動 → 停（抽到幾格，共 12）。 */
  black: number;
  record: number;
  pull: number;
  pullEnd: number;
  /** 抽到的格數（無罪、有罪 12；僵局 6）。 */
  stop: number;
  /** 有罪：被告姓名那一行再蓋上的起迄；其餘 null。 */
  recover: [number, number] | null;
  /** ③ 字卡起迄。 */
  card: [number, number];
  /** ④ 窗光亮起、移到落點的時間、整段結束（結論帶與評議欄才出現）。 */
  light: number;
  lightLanded: number;
  done: number;
}

/** handUnits／lifts：pen().end() 回報的最後一筆（字數、提筆次數）；any 為 false 表示現場沒寫字。 */
export function beatsOf(
  v: Verdict,
  end: { u: number; lifts: number; any: boolean },
  k: Tokens,
): Beats {
  const handEnd = end.any ? k.lead + end.u * k.hand + end.lifts * k.lift : 0;
  const black = handEnd + k.settle;
  const record = black + k.cutBlack;
  const pull = record + SPEC.read;
  const stop = v === '陪審團僵局' ? 6 : 12;
  // 抽走：12 格 --dur-redact-out（500ms）；僵局 6 格 × 1 格（--dur-frame）。
  const pullEnd = pull + (stop === 12 ? k.redactOut : stop * k.frame);
  const recover: [number, number] | null =
    v === '有罪' ? [pullEnd + SPEC.recoverGap, pullEnd + SPEC.recoverGap + k.redactIn] : null;
  const settled = recover ? recover[1] : pullEnd;
  const cardAt = settled + SPEC.afterPull[v];
  const cardEnd = cardAt + k.turn;
  const light = cardEnd + k.cutBlack;
  // 無罪的光一亮就在被告席；有罪、僵局從被告席移到各自的落點。
  const lightLanded = v === '無罪' ? light : light + k.lightMove;
  return {
    black,
    record,
    pull,
    pullEnd,
    stop,
    recover,
    card: [cardAt, cardEnd],
    light,
    lightLanded,
    done: lightLanded + k.lightHold,
  };
}

/** 窗光落點（設定集 10.5 窗光燈組：世界座標 x，辯方席 −1.75…0.35、檢方席 1.35…3.45；公尺）。 */
export const LANDING: Record<Verdict, { n: 1 | 2 | 3; x: number; label: string }> = {
  無罪: { n: 1, x: -1.0, label: '被告席' },
  有罪: { n: 2, x: 0.3, label: '桌角' },
  陪審團僵局: { n: 3, x: 0.86, label: '走道' },
};
export const WORLD_X: [number, number] = [-1.75, 3.45];
/** 落點在整個法庭寬度上的位置（0–1）。 */
export const landingAt = (v: Verdict) => (LANDING[v].x - WORLD_X[0]) / (WORLD_X[1] - WORLD_X[0]);

/** 從樣式表讀權杖（ms）；讀不到就是 0。 */
export function readTokens(el: Element = document.documentElement): Tokens {
  const cs = getComputedStyle(el);
  const ms = (name: string) => {
    const raw = cs.getPropertyValue(name).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? (raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n) : 0;
  };
  return {
    lead: ms('--dur-hand-lead'),
    hand: ms('--dur-hand'),
    lift: ms('--dur-pen-lift'),
    settle: ms('--dur-verdict-settle'),
    cutBlack: ms('--dur-cut-black'),
    redactOut: ms('--dur-redact-out'),
    redactIn: ms('--dur-redact-in'),
    turn: ms('--dur-turn'),
    lightMove: ms('--dur-lightmove'),
    frame: ms('--dur-frame'),
    lightHold: ms('--dur-verdict-light-hold'),
  };
}
