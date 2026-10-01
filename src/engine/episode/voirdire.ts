import type { Candidate, VoirDireScene } from './schema';

export interface VoirDireState {
  /** 剩下幾次提問。 */
  left: number;
  asked: string[];
  /** 玩家用掉的無因迴避。 */
  struck: string[];
  /** 檢方用掉的無因迴避。 */
  theirs: string[];
  /** 有因迴避剔除的人。 */
  excused: string[];
  /** 沒有根據就聲請剔除的次數：開庭第一天法官耐心照這個數字扣。 */
  wrong: number;
  seated: string[] | null;
}

export function startVoirDire(s: VoirDireScene): VoirDireState {
  return {
    left: s.questions,
    asked: [],
    struck: [],
    theirs: [],
    excused: [],
    wrong: 0,
    seated: null,
  };
}

const gone = (st: VoirDireState) => [...st.struck, ...st.theirs, ...st.excused];

/** 還在候選席上的人。 */
export function pool(s: VoirDireScene, st: VoirDireState): Candidate[] {
  return s.candidates.filter((c) => !gone(st).includes(c.id));
}

export function canAsk(st: VoirDireState, id: string): boolean {
  return st.seated === null && st.left > 0 && !st.asked.includes(id);
}

export function ask(s: VoirDireScene, st: VoirDireState, id: string): VoirDireState {
  if (!canAsk(st, id) || !s.candidates.some((c) => c.id === id)) return st;
  return { ...st, left: st.left - 1, asked: [...st.asked, id] };
}

/**
 * 有因迴避：候選人問過、而且明確表示偏見時才成立。
 * 沒有根據就提出，法官記下來（開庭第一天耐心 −1）。
 */
export function challenge(s: VoirDireScene, st: VoirDireState, id: string): VoirDireState {
  const c = s.candidates.find((x) => x.id === id);
  if (!c || st.seated !== null || gone(st).includes(id)) return st;
  if (c.cause && st.asked.includes(id)) return { ...st, excused: [...st.excused, id] };
  return { ...st, wrong: st.wrong + 1 };
}

export function canStrike(s: VoirDireScene, st: VoirDireState, id: string): boolean {
  return (
    st.seated === null &&
    st.struck.length < s.peremptories &&
    !gone(st).includes(id) &&
    pool(s, st).length > s.seats
  );
}

/** 無因迴避：不用理由，但只有 3 次，而且檢方會跟著砍掉對你最有利的人。 */
export function strike(s: VoirDireScene, st: VoirDireState, id: string): VoirDireState {
  if (!canStrike(s, st, id)) return st;
  const next = { ...st, struck: [...st.struck, id] };
  // 檢方也不會把候選席砍到坐不滿。
  if (next.theirs.length >= s.peremptories || pool(s, next).length <= s.seats) return next;
  const target = [...pool(s, next)].sort(
    (a, b) => b.value - a.value || a.id.localeCompare(b.id),
  )[0];
  return target ? { ...next, theirs: [...next.theirs, target.id] } : next;
}

export function canSeat(s: VoirDireScene, st: VoirDireState): boolean {
  return st.seated === null && pool(s, st).length >= s.seats;
}

/** 入席：候選名單由上往下補滿 12 個位子。 */
export function seat(s: VoirDireScene, st: VoirDireState): VoirDireState {
  if (!canSeat(s, st)) return st;
  return {
    ...st,
    seated: pool(s, st)
      .slice(0, s.seats)
      .map((c) => c.id),
  };
}

export function done(st: VoirDireState): boolean {
  return st.seated !== null;
}

/** 選定的 12 人，陪審長是領導特質最高的那位（企劃書 6.10）。 */
export function panel(s: VoirDireScene, st: VoirDireState) {
  const seated = (st.seated ?? []).map((id) => s.candidates.find((c) => c.id === id)!);
  const chief = [...seated].sort((a, b) => b.lead - a.lead || a.id.localeCompare(b.id))[0];
  return seated.map((c) => ({
    id: c.id,
    label: `${c.name}・${c.job}`,
    leans: c.leans,
    start: c.start,
    foreperson: c.id === chief?.id,
  }));
}
