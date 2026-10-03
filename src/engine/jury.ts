import type { Juror, Tag } from './schema';

/** 陪審團規則只需要這兩樣，集數劇本的法庭場景也套用同一套。 */
export interface JuryRules {
  jurors: Juror[];
  threshold: number;
  /** criminal：檢方要超越合理懷疑；civil：原告只要優勢證據（線通常畫在 50）。 */
  burden?: Burden;
  /** 幾個人站在同一邊才算判決；不填＝全體一致。民事常見 6 人中 5 人。 */
  quorum?: number;
}

export type Burden = 'criminal' | 'civil';

/** 陪審團量表與判決的用詞：數字一律是「對舉證方有利」的傾向，越高越不利於辯方。 */
export const TERMS = {
  criminal: {
    lean: '有罪傾向',
    standard: '超越合理懷疑',
    yes: '有罪',
    no: '無罪',
  },
  civil: {
    lean: '有責傾向',
    standard: '優勢證據',
    yes: '有責',
    no: '無責',
  },
} as const;

export const termsOf = (c: Pick<JuryRules, 'burden'>) => TERMS[c.burden ?? 'criminal'];

export type Jury = Record<string, number>;
export type Reaction = '點頭' | '抄筆記' | '皺眉' | '看向被告' | '';

export function startJury(c: JuryRules): Jury {
  return Object.fromEntries(c.jurors.map((j) => [j.id, j.start]));
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * 特質倍率（企劃書 6.10）：說中他的取向 ×1.5；完全不對盤 ×0.5。
 * 有兩個取向的人立場比較硬，說詞沒說中他關心的事，對他幾乎沒有用——
 * 這也是陪審團會出現僵局、而不是整團一起倒的原因。
 */
export function traitMultiplier(j: Juror, tags: readonly Tag[]): number {
  if (tags.some((t) => j.leans.includes(t))) return 1.5;
  return j.leans.length >= 2 ? 0.5 : 1.0;
}

/**
 * 對全體陪審員施加衝擊。impact > 0 代表往無罪方向（有罪傾向下降）。
 * 每位的變動 = 基礎衝擊 × 特質倍率 × 修正。
 */
export function applyImpact(
  c: JuryRules,
  jury: Jury,
  impact: number,
  tags: readonly Tag[],
  modifier = 1,
): { jury: Jury; deltas: Jury } {
  const next: Jury = {};
  const deltas: Jury = {};
  for (const j of c.jurors) {
    const v = clamp(jury[j.id] - impact * traitMultiplier(j, tags) * modifier);
    next[j.id] = v;
    deltas[j.id] = v - jury[j.id];
  }
  return { jury: next, deltas };
}

/** 全體往同一方向移動（例如法官訓斥 +5）。 */
export function shiftAll(
  c: JuryRules,
  jury: Jury,
  amount: number,
  only?: Tag,
): { jury: Jury; deltas: Jury } {
  const next: Jury = {};
  const deltas: Jury = {};
  for (const j of c.jurors) {
    const d = only && !j.leans.includes(only) ? 0 : amount;
    next[j.id] = clamp(jury[j.id] + d);
    deltas[j.id] = next[j.id] - jury[j.id];
  }
  return { jury: next, deltas };
}

/** 表情分級：小變動看不出來，大變動才點頭。要讓玩家讀得出「誰被說動了多少」。 */
export function reaction(delta: number): Reaction {
  if (delta <= -15) return '點頭';
  if (delta <= -5) return '抄筆記';
  if (delta >= 5) return '看向被告';
  if (delta > 0) return '皺眉';
  return '';
}

export interface Round {
  moves: string[];
  jury: Jury;
}

/** 沒有人換邊的那一輪，用這幾句代替重複的陪審長發言。 */
export const STILL = [
  '討論繼續。有人說話，有人沉默，沒有人換邊。',
  '最後一輪。大家都說完了，立場沒有再動。',
];

/** 三輪評議：門檻附近 10 以內的人往多數方向移 5；陪審長再讓所有人往他那邊移 2。 */
export function deliberate(c: JuryRules, jury: Jury): Round[] {
  const rounds: Round[] = [];
  let cur = { ...jury };
  const t = c.threshold;
  const fore = c.jurors.find((j) => j.foreperson) ?? c.jurors[0];
  for (let r = 0; r < 3; r++) {
    const guilty = c.jurors.filter((j) => cur[j.id] >= t).length;
    const dir = guilty * 2 > c.jurors.length ? 1 : guilty * 2 < c.jurors.length ? -1 : 0;
    const next = { ...cur };
    const moves: string[] = [];
    const swayed = new Set<string>();
    for (const j of c.jurors)
      if (dir !== 0 && Math.abs(cur[j.id] - t) < 10) {
        next[j.id] = clamp(cur[j.id] + 5 * dir);
        swayed.add(j.id);
      }
    const foreDir = cur[fore.id] >= t ? 1 : -1;
    for (const j of c.jurors) if (j.id !== fore.id) next[j.id] = clamp(next[j.id] + 2 * foreDir);
    // 換邊要看這一輪結束時的立場：多數推過線、陪審長又拉回來的人沒有換邊（體驗評測 v88 重驗）。
    for (const j of c.jurors)
      if (cur[j.id] >= t !== next[j.id] >= t)
        moves.push(
          swayed.has(j.id) && Math.sign(next[j.id] - cur[j.id]) === dir
            ? `${j.label}被多數說服，改變了立場。`
            : `${j.label}被陪審長說服，改變了立場。`,
        );
    const w = termsOf(c);
    const yes = c.jurors.filter((j) => next[j.id] >= t).length;
    // 第一輪由陪審長開場；之後票數沒動，就照實說沒動，不再重複同一句。
    if (r === 0 || moves.length)
      moves.push(`陪審長（${fore.label}）主張${foreDir > 0 ? w.yes : w.no}。`);
    else moves.push(STILL[r - 1] ?? STILL[STILL.length - 1]);
    moves.push(`表決：${yes} 票${w.yes}，${c.jurors.length - yes} 票${w.no}。`);
    cur = next;
    rounds.push({ moves, jury: cur });
  }
  return rounds;
}

export type Verdict = '無罪' | '有罪' | '有責' | '無責' | '陪審團僵局';

/**
 * 判決：過線（≥ 門檻）的人數達到法定人數，舉證方勝；沒過線的人數達到法定人數，辯方勝；
 * 都不到就是僵局。刑事預設全體一致。
 */
export function verdict(c: JuryRules, jury: Jury): Verdict {
  const n = c.jurors.length;
  const need = Math.min(n, Math.max(1, c.quorum ?? n));
  const over = c.jurors.filter((j) => jury[j.id] >= c.threshold).length;
  const w = termsOf(c);
  if (over >= need) return w.yes;
  if (n - over >= need) return w.no;
  return '陪審團僵局';
}
