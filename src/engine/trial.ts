import type { CaseData } from './schema';

export interface TrialState {
  index: number;
  resolved: string[];
  persuasion: number;
  message: string;
}

export type TrialOutcome = 'ongoing' | 'win' | 'lose';

export function startTrial(c: CaseData): TrialState {
  return { index: 0, resolved: [], persuasion: c.trial.persuasion, message: c.trial.intro };
}

export function move(c: CaseData, t: TrialState, delta: number): TrialState {
  const n = c.trial.statements.length;
  return { ...t, index: (t.index + delta + n) % n, message: '' };
}

export function press(c: CaseData, t: TrialState): TrialState {
  return { ...t, message: c.trial.statements[t.index].press };
}

export function present(c: CaseData, t: TrialState, evidenceId: string): TrialState {
  const s = c.trial.statements[t.index];
  if (s.contradiction?.evidence === evidenceId) {
    const resolved = t.resolved.includes(s.id) ? t.resolved : [...t.resolved, s.id];
    return { ...t, resolved, message: s.contradiction.rebuttal };
  }
  return { ...t, persuasion: t.persuasion - 1, message: c.trial.wrongEvidence };
}

export function outcome(c: CaseData, t: TrialState): TrialOutcome {
  if (t.persuasion <= 0) return 'lose';
  const needed = c.trial.statements.filter((s) => s.contradiction).length;
  return t.resolved.length >= needed ? 'win' : 'ongoing';
}
