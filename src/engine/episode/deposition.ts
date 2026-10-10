import type { DepoQuestion, DepositionScene, Line } from './schema';
import type { Objection } from './trial';

export interface DepoState {
  /** 剩下幾個提問額度。 */
  left: number;
  asked: string[];
  /** 已經在宣誓下講死的說法，開庭時可以跳過鎖定那一步（企劃書 6.9.4）。 */
  anchored: string[];
  /** 問出來的卡片。 */
  gained: string[];
  /** 被洩漏的論點：對方會在庭上準備反擊，衝擊減半（企劃書 6.8 底牌反擊）。 */
  exposed: string[];
  log: Line[];
  over: boolean;
  /** 對方主導：問到第幾題、異議錯了幾次、留下的旗標。 */
  i?: number;
  wrong?: number;
  flags?: string[];
  /** 該擋沒擋住（沒異議或理由錯）的題目：對方因此多拿到的東西寫在題目的 missed。 */
  slipped?: string[];
}

/** 對方主導的錄取，玩家能用的異議：庭上那幾種，加上指示證人不回答的「特權」。 */
export type DepoObjection = Objection | '特權';
export const DEPO_OBJECTIONS: DepoObjection[] = [
  '誘導',
  '傳聞',
  '推測',
  '無關',
  '已問已答',
  '缺乏基礎',
  '特權',
];

export function startDeposition(s: DepositionScene): DepoState {
  return {
    left: s.budget,
    asked: [],
    anchored: [],
    gained: [],
    exposed: [],
    log: [],
    over: s.side === 'theirs' && s.script.length === 0,
    i: 0,
    wrong: 0,
    flags: [],
    slipped: [],
  };
}

/** 對方主導時，現在輪到的問題。 */
export function current(s: DepositionScene, st: DepoState) {
  return st.over ? undefined : s.script[st.i ?? 0];
}

/**
 * 對方主導：對方問一題，玩家選擇異議（或不異議）。錄取時沒有法官當場裁決，
 * 證人照樣回答，異議只記在筆錄上，開庭時才算數；只有「特權」可以指示證人不回答。
 */
export function defend(s: DepositionScene, st: DepoState, reason: DepoObjection | null): DepoState {
  const q = current(s, st);
  if (s.side !== 'theirs' || !q) return st;
  const right = reason !== null && reason === q.objection;
  const silenced = right && reason === '特權';
  // 對沒有毛病的問題提異議：站不住，也要記下來，回顧才標得出和「擋錯了」不同的那一種。
  const flag = right
    ? 'preserved'
    : reason === null && q.objection
      ? 'waived'
      : reason !== null && !q.objection
        ? 'baseless'
        : null;
  const log: Line[] = [
    { who: s.examiner, text: q.q, mood: '平', thought: false },
    ...(reason
      ? [{ who: '盧卡斯', text: `異議，${reason}。`, mood: '硬' as const, thought: false }]
      : []),
    ...(silenced
      ? [{ who: '盧卡斯', text: '我指示證人不要回答。', mood: '硬' as const, thought: false }]
      : [{ who: s.witness.name, text: q.a, mood: '平' as const, thought: false }]),
  ];
  const i = (st.i ?? 0) + 1;
  // 這題有毛病卻沒擋對：對方多拿到的東西。
  const missed = q.objection && !right ? q.missed : { gives: [], flags: [] };
  const flags = [
    ...(st.flags ?? []),
    ...(flag ? [`depo:${s.id}:${q.id}:${flag}`] : []),
    ...missed.flags,
  ];
  return {
    ...st,
    i,
    wrong: (st.wrong ?? 0) + (reason !== null && !right ? 1 : 0),
    asked: [...st.asked, q.id],
    slipped: q.objection && !right ? [...(st.slipped ?? []), q.id] : st.slipped,
    anchored: q.anchors && !silenced ? [...new Set([...st.anchored, q.anchors])] : st.anchored,
    gained: [...new Set([...st.gained, ...(silenced ? [] : q.gives), ...missed.gives])],
    flags: [...new Set(flags)],
    log: [...st.log, ...log],
    over: i >= s.script.length,
  };
}

export function questionsOf(s: DepositionScene, topic: string): DepoQuestion[] {
  return s.topics.find((t) => t.id === topic)?.questions ?? [];
}

export function canAsk(st: DepoState, id: string): boolean {
  return !st.over && st.left > 0 && !st.asked.includes(id);
}

/** 提問：證人宣誓回答，不管對方律師異議與否（錄取時法官不在場）。 */
export function ask(s: DepositionScene, st: DepoState, id: string): DepoState {
  const q = s.topics.flatMap((t) => t.questions).find((x) => x.id === id);
  if (s.side === 'theirs' || !q || !canAsk(st, id)) return st;
  const log: Line[] = [
    { who: '盧卡斯', text: q.q, mood: '平', thought: false },
    ...(q.objection
      ? [
          {
            who: '對造律師',
            text: `異議，${q.objection}。（庭外取證沒有法官裁決，異議只記錄在案，證人仍須回答）`,
            mood: '硬' as const,
            thought: false,
          },
        ]
      : []),
    { who: s.witness.name, text: q.a, mood: '平', thought: false },
  ];
  const left = st.left - 1;
  return {
    ...st,
    left,
    asked: [...st.asked, id],
    anchored: q.anchors ? [...new Set([...st.anchored, q.anchors])] : st.anchored,
    gained: [...new Set([...st.gained, ...q.gives])],
    exposed: [...new Set([...st.exposed, ...q.tips])],
    log: [...st.log, ...log],
    over: left <= 0,
  };
}

/** 額度沒用完也可以提早結束——問得少，洩漏得也少。 */
export function finish(st: DepoState): DepoState {
  return { ...st, over: true };
}

export function done(st: DepoState): boolean {
  return st.over;
}
