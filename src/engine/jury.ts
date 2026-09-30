import type { Juror, Tag } from './schema';

/** 陪審團規則只需要這兩樣，集數劇本的法庭場景也套用同一套。 */
export interface JuryRules {
  jurors: Juror[];
  threshold: number;
}

export type Jury = Record<string, number>;
export type Reaction = '點頭' | '抄筆記' | '皺眉' | '看向被告' | '';

export function startJury(c: JuryRules): Jury {
  return Object.fromEntries(c.jurors.map((j) => [j.id, j.start]));
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function traitMultiplier(j: Juror, tags: readonly Tag[]): number {
  return tags.some((t) => j.leans.includes(t)) ? 1.5 : 1.0;
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
    for (const j of c.jurors) {
      if (dir !== 0 && Math.abs(cur[j.id] - t) < 10) {
        const before = cur[j.id] >= t;
        next[j.id] = clamp(cur[j.id] + 5 * dir);
        if (before !== next[j.id] >= t) moves.push(`${j.label}被多數說服，改變了立場。`);
      }
    }
    const foreDir = cur[fore.id] >= t ? 1 : -1;
    for (const j of c.jurors) if (j.id !== fore.id) next[j.id] = clamp(next[j.id] + 2 * foreDir);
    moves.push(`陪審長（${fore.label}）主張${foreDir > 0 ? '有罪' : '無罪'}。`);
    cur = next;
    rounds.push({ moves, jury: cur });
  }
  return rounds;
}

export type Verdict = '無罪' | '有罪' | '陪審團僵局';

export function verdict(c: JuryRules, jury: Jury): Verdict {
  const guilty = c.jurors.filter((j) => jury[j.id] >= c.threshold).length;
  if (guilty === c.jurors.length) return '有罪';
  if (guilty === 0) return '無罪';
  return '陪審團僵局';
}
