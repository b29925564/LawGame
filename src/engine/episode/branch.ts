import type { ClosingScene, Line, When } from './schema';

export type Verdict = '無罪' | '有罪' | '陪審團僵局';

/** 判斷分支條件時看得到的事：判決、選定的理論、旗標、倫理帳本。 */
export interface BranchContext {
  verdict: Verdict | null;
  theory: string | null;
  flags: string[];
  ethics: string[];
}

export function matches(w: When | undefined, c: BranchContext): boolean {
  if (!w) return true;
  if (w.verdict && !(c.verdict && w.verdict.includes(c.verdict))) return false;
  if (w.theory && !(c.theory && w.theory.includes(c.theory))) return false;
  if (w.flags && !w.flags.every((f) => c.flags.includes(f))) return false;
  if (w.notFlags && w.notFlags.some((f) => c.flags.includes(f))) return false;
  if (w.ethics && !w.ethics.some((e) => c.ethics.includes(e))) return false;
  return true;
}

/** 判決後要演的結局：第一個符合的 ending，否則照判決的預設段落。 */
export function endingLines(s: ClosingScene, c: BranchContext): Line[] {
  if (!c.verdict) return [];
  const hit = s.endings.find((e) => matches(e.when, c));
  return hit ? hit.lines : s.verdicts[c.verdict];
}
