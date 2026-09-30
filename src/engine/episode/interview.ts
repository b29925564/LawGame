import type { InterviewScene, Line, Topic } from './schema';

export interface InterviewState {
  guard: number;
  asked: string[];
  pressed: string[];
  shown: string[];
  log: Line[];
  gained: string[];
  over: boolean;
}

export function startInterview(s: InterviewScene): InterviewState {
  return {
    guard: s.meter.start,
    asked: [],
    pressed: [],
    shown: [],
    log: [...s.intro],
    gained: [],
    over: false,
  };
}

const add = (st: InterviewState, lines: Line[]): InterviewState => ({
  ...st,
  log: [...st.log, ...lines],
});

/** 戒心滿了就結束訪談，證人不再回答（企劃書 6.3）。 */
function bumpGuard(s: InterviewScene, st: InterviewState, by: number): InterviewState {
  const guard = Math.max(0, Math.min(s.meter.max, st.guard + by));
  if (guard >= s.meter.max && !st.over) return add({ ...st, guard, over: true }, s.guarded);
  return { ...st, guard };
}

/** 還問得到的話題：卡片湊齊才解鎖，問過就不再列出。 */
export function openTopics(s: InterviewScene, st: InterviewState, held: string[]): Topic[] {
  return s.topics.filter(
    (t) =>
      !st.asked.includes(t.id) && t.needs.every((n) => held.includes(n) || st.gained.includes(n)),
  );
}

export function ask(s: InterviewScene, st: InterviewState, topicId: string): InterviewState {
  const t = s.topics.find((x) => x.id === topicId);
  if (!t || st.over || st.asked.includes(t.id)) return st;
  const next = add(
    { ...st, asked: [...st.asked, t.id], gained: [...st.gained, ...t.gives] },
    t.lines,
  );
  return t.guard ? bumpGuard(s, next, t.guard) : next;
}

/** 施壓：戒心 +2，但手上有能反駁他的卡片時他會吐實。 */
export function press(
  s: InterviewScene,
  st: InterviewState,
  pressId: string,
  held: string[],
): InterviewState {
  const p = s.press.find((x) => x.id === pressId);
  if (!p || st.over || st.pressed.includes(p.id)) return st;
  const has = held.includes(p.needs) || st.gained.includes(p.needs);
  const next = add(
    { ...st, pressed: [...st.pressed, p.id], gained: has ? [...st.gained, ...p.gives] : st.gained },
    has ? p.lines : p.blank,
  );
  return bumpGuard(s, next, 2);
}

/** 安撫：戒心 −1。 */
export function calm(s: InterviewScene, st: InterviewState): InterviewState {
  if (st.over) return st;
  return bumpGuard(s, add(st, s.calm), -1);
}

/** 關鍵話題問完才能收工，否則玩家會帶著問不完的案子進第二幕。 */
export function canFinish(s: InterviewScene, st: InterviewState): boolean {
  return st.over || s.topics.filter((t) => t.key).every((t) => st.asked.includes(t.id));
}
