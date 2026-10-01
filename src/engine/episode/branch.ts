import type { ClosingScene, Line, When } from './schema';

export type Verdict = '無罪' | '有罪' | '陪審團僵局';
export type Outcome = 'deal' | 'dismissed';

/** 判斷分支條件時看得到的事：判決、選定的理論、旗標、倫理帳本。 */
export interface BranchContext {
  verdict: Verdict | null;
  /** 提前收場的方式；走到判決的話是 null。 */
  outcome: Outcome | null;
  deal: string | null;
  theory: string | null;
  flags: string[];
  ethics: string[];
  cards: string[];
  /** 庭上出示過（對質或逼出緘默權）或結辯用過的論點。 */
  presented: string[];
}

export function matches(w: When | undefined, c: BranchContext): boolean {
  if (!w) return true;
  if (w.verdict && !(c.verdict && w.verdict.includes(c.verdict))) return false;
  if (w.outcome && !(c.outcome && w.outcome.includes(c.outcome))) return false;
  if (w.deal && !(c.deal && w.deal.includes(c.deal))) return false;
  if (w.theory && !(c.theory && w.theory.includes(c.theory))) return false;
  if (w.flags && !w.flags.every((f) => c.flags.includes(f))) return false;
  if (w.notFlags && w.notFlags.some((f) => c.flags.includes(f))) return false;
  if (w.cards && !w.cards.every((x) => c.cards.includes(x))) return false;
  if (w.presented && !w.presented.every((x) => c.presented.includes(x))) return false;
  if (w.ethics && !w.ethics.some((e) => c.ethics.includes(e))) return false;
  return true;
}

/** 判決後要演的結局：第一個符合的 ending，否則照判決的預設段落。 */
export function endingLines(s: ClosingScene, c: BranchContext): Line[] {
  if (!c.verdict) return [];
  const hit = s.endings.find((e) => matches(e.when, c));
  return hit ? hit.lines : s.verdicts[c.verdict];
}
