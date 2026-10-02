import type { Argument, CaseData, Tag } from './schema';
import {
  applyImpact,
  deliberate,
  shiftAll,
  verdict,
  type Jury,
  type Round,
  type Verdict,
} from './jury';

export type Lock = 'none' | 'weak' | 'strong';
export interface ClaimState {
  lock: Lock;
  setup: boolean;
  result: 'none' | 'impeached' | 'softened';
}
export interface LogLine {
  who: string;
  text: string;
}
export type Stage = 'expert' | 'witness' | 'closing' | 'done';

export interface CrossState {
  stage: Stage;
  patience: number;
  admitted: string[];
  asked: string[];
  claims: Record<string, ClaimState>;
  used: string[];
  impeachments: number;
  fifth: boolean;
  rebuked: boolean;
  jury: Jury;
  deltas: Jury;
  log: LogLine[];
  rounds: Round[];
  verdict: Verdict | null;
}

export const JUDGE = '法官';
export const YOU = '盧卡斯';

export function startCross(c: CaseData, jury: Jury): CrossState {
  return {
    stage: 'expert',
    patience: c.patience,
    admitted: c.cards.filter((x) => x.admitted).map((x) => x.id),
    asked: [],
    claims: Object.fromEntries(
      c.witness.claims.map((cl) => [cl.id, { lock: 'none', setup: false, result: 'none' }]),
    ),
    used: [],
    impeachments: 0,
    fifth: false,
    rebuked: false,
    jury,
    deltas: {},
    log: [{ who: JUDGE, text: `辯方可以開始詰問${c.expert.name}。` }],
    rounds: [],
    verdict: null,
  };
}

function say(s: CrossState, ...lines: LogLine[]): CrossState {
  return { ...s, log: [...s.log, ...lines].slice(-8) };
}

/** 扣法官耐心；歸零時公開訓斥（全體有罪傾向 +5）並取消剩餘詰問。 */
function losePatience(c: CaseData, s: CrossState, why: string): CrossState {
  let next = say({ ...s, patience: s.patience - 1, deltas: {} }, { who: JUDGE, text: why });
  if (next.patience <= 0) {
    const r = shiftAll(c, next.jury, 5);
    next = say(
      { ...next, jury: r.jury, deltas: r.deltas, rebuked: true, stage: 'closing' },
      {
        who: JUDGE,
        text: '律師，我已經警告過你了。本庭不容許這樣浪費陪審團的時間。詰問到此為止。',
      },
    );
  }
  return next;
}

/** 重複同一個問題＝糾纏：法官耐心 −1，重視情感的陪審員反感。 */
function badger(c: CaseData, s: CrossState): CrossState {
  const r = shiftAll(c, s.jury, 2, '情感');
  const next = losePatience(c, s, '異議成立。律師，這個問題證人已經回答過了。');
  return next.rebuked ? next : { ...next, jury: r.jury, deltas: r.deltas };
}

function ask(c: CaseData, s: CrossState, key: string, q: string, a: string, who: string) {
  if (s.asked.includes(key)) return { state: badger(c, s), repeat: true };
  return {
    state: say(
      { ...s, asked: [...s.asked, key], deltas: {} },
      { who: YOU, text: q },
      { who, text: a },
    ),
    repeat: false,
  };
}

export function askExpert(c: CaseData, s: CrossState, qid: string): CrossState {
  const q = c.expert.questions.find((x) => x.id === qid)!;
  const r = ask(c, s, `expert:${qid}`, q.q, q.a, c.expert.name);
  if (r.repeat) return r.state;
  if (q.irrelevant)
    return losePatience(c, r.state, '律師，請問這和本案有什麼關係？請換下一個問題。');
  if (q.admits && !r.state.admitted.includes(q.admits))
    return { ...r.state, admitted: [...r.state.admitted, q.admits] };
  return r.state;
}

export function toWitness(c: CaseData, s: CrossState): CrossState {
  return say(
    { ...s, stage: 'witness', deltas: {} },
    { who: JUDGE, text: `檢方傳喚${c.witness.name}。辯方可以開始詰問。` },
  );
}

export function lock(
  c: CaseData,
  s: CrossState,
  claimId: string,
  how: 'strong' | 'weak',
): CrossState {
  const cl = c.witness.claims.find((x) => x.id === claimId)!;
  const line = cl.lock[how];
  const r = ask(c, s, `lock:${claimId}:${how}`, line.q, line.a, c.witness.name);
  if (r.repeat) return r.state;
  const cur = r.state.claims[claimId];
  const next: Lock = cur.lock === 'strong' ? 'strong' : how;
  return { ...r.state, claims: { ...r.state.claims, [claimId]: { ...cur, lock: next } } };
}

export function setup(c: CaseData, s: CrossState, claimId: string): CrossState {
  const cl = c.witness.claims.find((x) => x.id === claimId)!;
  const r = ask(c, s, `setup:${claimId}`, cl.setup.q, cl.setup.a, c.witness.name);
  if (r.repeat) return r.state;
  const cur = r.state.claims[claimId];
  return { ...r.state, claims: { ...r.state.claims, [claimId]: { ...cur, setup: true } } };
}

export function irrelevant(c: CaseData, s: CrossState, i: number): CrossState {
  const line = c.witness.irrelevant[i];
  const r = ask(c, s, `irrelevant:${i}`, line.q, line.a, c.witness.name);
  if (r.repeat) return r.state;
  return losePatience(c, r.state, '檢方異議：與本案無關。異議成立。');
}

export function hasFoundation(c: CaseData, s: CrossState, claimId: string): boolean {
  const cl = c.witness.claims.find((x) => x.id === claimId)!;
  return s.claims[claimId].setup || s.admitted.includes(cl.needs);
}

/** 對質：出示論點卡。三步都完成＝彈劾成功（×1.5）；沒鎖死只有 ×0.5。 */
export function confront(c: CaseData, s: CrossState, claimId: string, arg: Argument): CrossState {
  const cl = c.witness.claims.find((x) => x.id === claimId)!;
  const cur = s.claims[claimId];
  if (cur.result !== 'none') return badger(c, s);
  let next = say(s, { who: YOU, text: `（出示「${arg.name}」）${arg.text}` });
  if (arg.id !== cl.argument)
    return losePatience(c, next, '律師，這份論點和證人剛才的說法有什麼關係？');
  if (!hasFoundation(c, next, claimId))
    return losePatience(c, next, '檢方異議：缺乏證據基礎。異議成立，這份資料不得出示。');
  const strong = cur.lock === 'strong';
  const r = applyImpact(c, next.jury, arg.strength, arg.tags, strong ? 1.5 : 0.5);
  next = say(
    {
      ...next,
      jury: r.jury,
      deltas: r.deltas,
      used: [...next.used, arg.id],
      impeachments: next.impeachments + (strong ? 1 : 0),
      claims: { ...next.claims, [claimId]: { ...cur, result: strong ? 'impeached' : 'softened' } },
    },
    { who: c.witness.name, text: strong ? cl.confront.strong : cl.confront.weak },
  );
  const last = c.witness.claims[c.witness.claims.length - 1];
  if (next.impeachments >= 2 && next.claims[last.id].result === 'impeached') {
    next = say(
      { ...next, fifth: true, stage: 'closing' },
      { who: c.witness.name, text: c.witness.breakdown },
    );
  }
  return next;
}

export function toClosing(s: CrossState): CrossState {
  return { ...s, stage: 'closing', deltas: {} };
}

/** 結辯：選論點與基調。已在詰問用過的論點只是重述，衝擊小；新論點較有份量。 */
export function closing(c: CaseData, s: CrossState, args: Argument[], tone: Tag): CrossState {
  let jury = s.jury;
  const total: Jury = {};
  for (const a of args.slice(0, c.closing.max)) {
    const mod = s.used.includes(a.id) ? 0.1 : 0.3;
    const r = applyImpact(c, jury, a.strength, [...a.tags, tone], mod);
    jury = r.jury;
    for (const [k, v] of Object.entries(r.deltas)) total[k] = (total[k] ?? 0) + v;
  }
  const rounds = deliberate(c, jury);
  const final = rounds[rounds.length - 1].jury;
  return { ...s, stage: 'done', jury: final, deltas: total, rounds, verdict: verdict(c, final) };
}
