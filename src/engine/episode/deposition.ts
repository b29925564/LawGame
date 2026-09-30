import type { DepoQuestion, DepositionScene, Line } from './schema';

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
}

export function startDeposition(s: DepositionScene): DepoState {
  return { left: s.budget, asked: [], anchored: [], gained: [], exposed: [], log: [], over: false };
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
  if (!q || !canAsk(st, id)) return st;
  const log: Line[] = [
    { who: '艾莉絲', text: q.q, mood: '平', thought: false },
    ...(q.objection
      ? [
          {
            who: '對造律師',
            text: `異議，${q.objection}。（證人仍須回答）`,
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
