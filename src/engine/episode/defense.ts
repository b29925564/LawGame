import { applyImpact, shiftAll, type Jury, type JuryRules } from '../jury';
import type { Tag } from '../schema';
import type { DefenseScene } from './schema';

export interface DefenseLine {
  who: string;
  text: string;
}

export interface DefenseState {
  stage: 'prep' | 'direct' | 'done';
  /** 選的準備方式。 */
  prep: string | null;
  asked: string[];
  jury: Jury;
  deltas: Jury;
  /** 被教過的證人在反詰問露了餡。 */
  leaked: boolean;
  log: DefenseLine[];
}

export const YOU = '盧卡斯';
/** 辯方自己傳的證人，陪審團本來就打折聽：直接詰問的衝擊只算這麼多，彈劾檢方證人才是主力。 */
export const OWN_WITNESS = 0.4;
export const DA = '莫羅檢察官';
/** 自己的證人被抓到照稿念，陪審團連你先前替他們建立的懷疑也一起打折：往有責拉回這一部分（3/4，任何理論露餡都會輸）。 */
export const TAINT = 0.75;

export function startDefense(jury: Jury): DefenseState {
  return { stage: 'prep', prep: null, asked: [], jury, deltas: {}, leaked: false, log: [] };
}

const say = (st: DefenseState, ...lines: DefenseLine[]): DefenseState => ({
  ...st,
  log: [...st.log, ...lines],
});

/** 證人準備：選一種，之後的直接詰問都照這一種算。 */
export function prepare(s: DefenseScene, st: DefenseState, optionId: string): DefenseState {
  const o = s.prep.options.find((x) => x.id === optionId);
  if (!o || st.stage !== 'prep') return st;
  return { ...st, stage: 'direct', prep: o.id };
}

export const prepOption = (s: DefenseScene, st: DefenseState) =>
  s.prep.options.find((x) => x.id === st.prep) ?? null;

/** 這一題還缺哪些卡片或論點。 */
export function missing(s: DefenseScene, qid: string, held: string[]): string[] {
  return (s.questions.find((q) => q.id === qid)?.needs ?? []).filter((n) => !held.includes(n));
}

export function canAsk(
  s: DefenseScene,
  st: DefenseState,
  qid: string,
  held: string[] = [],
): boolean {
  return (
    st.stage === 'direct' &&
    st.asked.length < s.asks &&
    !st.asked.includes(qid) &&
    s.questions.some((q) => q.id === qid) &&
    missing(s, qid, held).length === 0
  );
}

/**
 * 直接詰問一題。衝擊 = 基礎 × 準備倍率 ×（被教過的措辭再乘一次）×（倒著問減半）。
 * 問滿或玩家收尾時才換檢方反詰問。
 */
export function ask(
  s: DefenseScene,
  st: DefenseState,
  rules: JuryRules,
  qid: string,
  held: string[] = [],
): DefenseState {
  if (!canAsk(s, st, qid, held)) return st;
  const q = s.questions.find((x) => x.id === qid)!;
  const o = prepOption(s, st)!;
  const last = st.asked.length
    ? Math.max(...st.asked.map((id) => s.questions.find((x) => x.id === id)!.seq))
    : -1;
  const ordered = q.seq > last;
  const mod = OWN_WITNESS * o.multiplier * (q.rehearsed ? o.rehearsed : 1) * (ordered ? 1 : 0.5);
  const r = applyImpact(rules, st.jury, q.impact, q.tags as Tag[], mod);
  return say(
    { ...st, asked: [...st.asked, q.id], jury: r.jury, deltas: r.deltas },
    { who: YOU, text: q.q },
    { who: s.witness.name, text: q.a },
  );
}

/** 直接詰問結束，換檢方反詰問：開門的題被翻出來；被教過又問過教過的措辭，就被問「有人教你嗎」。 */
export function finish(s: DefenseScene, st: DefenseState, rules: JuryRules): DefenseState {
  if (st.stage !== 'direct') return st;
  let next: DefenseState = { ...st, stage: 'done', deltas: {} };
  const o = prepOption(s, st);
  for (const id of st.asked) {
    const d = s.questions.find((x) => x.id === id)?.door;
    if (!d) continue;
    const r = shiftAll(rules, next.jury, d.penalty);
    next = say(
      { ...next, jury: r.jury },
      { who: s.examiner ?? DA, text: d.q },
      { who: s.witness.name, text: d.a },
    );
  }
  // 前面的選擇讓對方多了能問的題（條件已在 witnessScene 篩過）。
  for (const x of s.cross) {
    if ((x.unlessAsked ?? []).some((id) => st.asked.includes(id))) continue;
    const r = shiftAll(rules, next.jury, x.penalty);
    next = say(
      { ...next, jury: r.jury },
      { who: s.examiner ?? DA, text: x.q },
      { who: s.witness.name, text: x.a },
    );
  }
  const exposed =
    !!o?.coached && st.asked.some((id) => s.questions.find((x) => x.id === id)?.rehearsed);
  if (exposed) {
    const back: Jury = { ...next.jury };
    for (const j of rules.jurors)
      if (back[j.id] !== undefined && back[j.id] < j.start)
        back[j.id] = Math.round(back[j.id] + (j.start - back[j.id]) * TAINT);
    const r = shiftAll(rules, back, s.leak.penalty);
    next = say(
      { ...next, jury: r.jury, leaked: true },
      { who: s.examiner ?? DA, text: s.leak.q },
      { who: s.witness.name, text: s.leak.a },
    );
  }
  // 這一輪全部往有罪方向的變動，畫面上要看得到。
  const deltas: Jury = {};
  for (const id of Object.keys(next.jury)) deltas[id] = next.jury[id] - st.jury[id];
  return { ...next, deltas };
}
