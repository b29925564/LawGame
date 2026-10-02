import type { InterviewScene, Line, Topic } from './schema';
import { YOU } from './trial';

export interface InterviewState {
  guard: number;
  /** 還剩幾次安撫。 */
  calms: number;
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
    calms: s.calms,
    asked: [],
    pressed: [],
    shown: [],
    log: [...s.intro],
    gained: [],
    over: false,
  };
}

/** 玩家選的問題本身也要出現在筆錄裡，不然只看得到證人的回答。 */
const asks = (text: string): Line => ({ who: YOU, text, mood: '平', thought: false });

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
  const next = add({ ...st, asked: [...st.asked, t.id], gained: [...st.gained, ...t.gives] }, [
    asks(t.label),
    ...t.lines,
  ]);
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
    [asks(p.label), ...(has ? p.lines : p.blank)],
  );
  return bumpGuard(s, next, 2);
}

/** 安撫：戒心 −1，整場只有 s.calms 次。 */
export function calm(s: InterviewScene, st: InterviewState): InterviewState {
  // 舊存檔沒有 calms 欄位，當作還沒用過。
  const left = st.calms ?? s.calms;
  if (st.over || left <= 0) return st;
  return bumpGuard(s, add({ ...st, calms: left - 1 }, s.calm), -1);
}

/** 關鍵話題問完才能收工，否則玩家會帶著問不完的案子進第二幕。 */
export function canFinish(s: InterviewScene, st: InterviewState): boolean {
  return st.over || s.topics.filter((t) => t.key).every((t) => st.asked.includes(t.id));
}
