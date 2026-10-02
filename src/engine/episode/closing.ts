import {
  applyImpact,
  deliberate,
  shiftAll,
  verdict,
  type Jury,
  type JuryRules,
  type Round,
  type Verdict,
} from '../jury';
import type { Tag } from '../schema';
import type { ClosingScene, Question, Theory } from './schema';

export interface ClosingState {
  /** 挑出來的論點，順序就是講的順序。 */
  picked: string[];
  tone: string | null;
  jury: Jury;
  /** 結辯講完、評議之前的心證：畫面上要看得到這一段話說動了誰。 */
  spoken: Jury | null;
  deltas: Jury;
  rounds: Round[];
  verdict: Verdict | null;
  /** 開場許下卻沒兌現的承諾；結辯開始前已經反噬進心證。 */
  broken: string[];
  /** 民事判有責時的判決表；其他判決或沒設定金額時沒有。 */
  award?: Award | null;
}

export interface Award {
  /** 損害總額。 */
  total: number;
  /** 死者自己的過失比例（百分比）。 */
  fault: number;
  /** 扣掉過失比例後的判賠金額。 */
  amount: number;
  /** 懲罰性賠償：null＝沒有進入這一輪；found＝成立與否，votes＝過門檻的人數。 */
  punitive: { found: boolean; amount: number; votes: number; need: number } | null;
}

const avg = (j: Jury) => {
  const v = Object.values(j);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};
/** 金額取到十萬。 */
const round = (n: number) => Math.round(n / 100000) * 100000;

/**
 * 判決表：票數離門檻越近，陪審團越覺得死者自己也有錯（過失比例往上浮動 swing），
 * 判得越重則往下。懲罰性賠償用較高的門檻再評一輪，達到法定人數才成立。
 */
export function award(
  s: ClosingScene,
  rules: JuryRules,
  jury: Jury,
  fault: number,
  punitiveBonus: number | null,
): Award | null {
  const d = s.damages;
  if (!d) return null;
  const lean = Math.max(-1, Math.min(1, (rules.threshold + 20 - avg(jury)) / 20));
  const f = Math.max(0, Math.min(100, Math.round(fault + d.swing * lean)));
  const amount = round((d.total * (100 - f)) / 100);
  let punitive: Award['punitive'] = null;
  if (d.punitive && punitiveBonus !== null) {
    const n = rules.jurors.length;
    const need = Math.min(n, Math.max(1, rules.quorum ?? n));
    const votes = rules.jurors.filter(
      (j) => (jury[j.id] ?? 0) + punitiveBonus >= d.punitive!.threshold,
    ).length;
    const found = votes >= need;
    punitive = { found, amount: found ? round(amount * d.punitive.ratio) : 0, votes, need };
  }
  return { total: d.total, fault: f, amount, punitive };
}

/** 調解時估的開庭風險：最好情況（死者過失最高）到最壞情況（全額）。 */
export function exposure(s: ClosingScene, faults: number[]): { low: number; high: number } | null {
  const d = s.damages;
  if (!d) return null;
  const most = Math.min(100, Math.max(0, ...faults) + d.swing);
  return { low: round((d.total * (100 - most)) / 100), high: d.total };
}

/** 結辯重述已經呈現過的論點，力道打對折（企劃書 6.9.8 的近因效應仍然疊在上面）。 */
const RECAP = 0.25;
/** 結辯固定要講滿 picks 個論點；每空一格，檢方的說法就沒人反駁，全體往有罪移這麼多。 */
export const EMPTY_SLOT = 6;
/** 沒有案件理論，論點散成一盤，結辯力道打七折。 */
export const NO_THEORY = 0.7;

/** 案件理論本身的代價（schema 的 theory.jury）：結辯開始時全體、再依取向另外往有責／有罪移。 */
export function theoryCost(rules: JuryRules, jury: Jury, cost: Theory['jury']): Jury {
  if (!cost) return jury;
  let out = cost.all ? shiftAll(rules, jury, cost.all).jury : jury;
  for (const [tag, n] of Object.entries(cost.leans))
    if (n) out = shiftAll(rules, out, n, tag as Tag).jury;
  return out;
}

export function startClosing(jury: Jury, broken: string[] = []): ClosingState {
  return {
    picked: [],
    tone: null,
    jury,
    spoken: null,
    deltas: {},
    rounds: [],
    verdict: null,
    broken,
  };
}

export function togglePick(s: ClosingScene, st: ClosingState, id: string): ClosingState {
  if (st.verdict) return st;
  if (st.picked.includes(id)) return { ...st, picked: st.picked.filter((x) => x !== id) };
  if (st.picked.length >= s.picks) return st;
  return { ...st, picked: [...st.picked, id] };
}

export function setTone(s: ClosingScene, st: ClosingState, tone: string): ClosingState {
  if (st.verdict || !s.tones.some((t) => t.id === tone)) return st;
  return { ...st, tone };
}

/**
 * 要挑幾個論點：規定的數量，但手上不夠的話，有幾個挑幾個（一個都沒有也能只靠基調結辯）。
 * 挑不滿的空格不是免費的，deliver 時每格都會反噬。
 */
export function needed(s: ClosingScene, available: number): number {
  return Math.min(s.picks, available);
}

export function canDeliver(s: ClosingScene, st: ClosingState, available = s.picks): boolean {
  return !st.verdict && st.tone !== null && st.picked.length === needed(s, available);
}

/**
 * 結辯：論點依序施加衝擊，最後一個 ×1.3（近因效應），
 * 基調說中陪審員取向的另外加成。接著三輪評議，然後判決。
 */
export function deliver(
  s: ClosingScene,
  st: ClosingState,
  rules: JuryRules,
  args: Question['argument'][],
  exposed: string[] = [],
  theory = true,
): ClosingState {
  if (!canDeliver(s, st, args.length)) return st;
  const tone = s.tones.find((t) => t.id === st.tone)!;
  const empty = s.picks - st.picked.length;
  let jury = empty > 0 ? shiftAll(rules, st.jury, EMPTY_SLOT * empty).jury : st.jury;
  st.picked.forEach((id, i) => {
    const a = args.find((x) => x.id === id);
    if (!a) return;
    const last = i === st.picked.length - 1;
    // 洩漏過的論點，對方在庭上已經打過預防針，結辯再講一次也只剩一半。
    // 結辯是提醒，不是新證據：陪審團已經在庭上聽過一次，所以只有一半的力道。
    const modifier =
      RECAP * (last ? 1.3 : 1) * (exposed.includes(id) ? 0.5 : 1) * (theory ? 1 : NO_THEORY);
    jury = applyImpact(rules, jury, a.strength, [...a.tags, tone.tag] as Tag[], modifier).jury;
  });
  const rounds = deliberate(rules, jury);
  const final = rounds[rounds.length - 1].jury;
  return { ...st, jury: final, spoken: jury, rounds, verdict: verdict(rules, final) };
}

export function done(st: ClosingState): boolean {
  return st.verdict !== null;
}
