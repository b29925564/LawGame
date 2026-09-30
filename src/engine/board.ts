import type { CaseData, Relation } from './schema';

export interface Attempt {
  cards: string[];
  relation: Relation | null;
}

export interface BoardState {
  hours: number;
  timeline: string[];
  attempts: Record<string, Attempt>;
  confirmed: string[];
  submissions: number;
  wrong: number;
}

export function startBoard(c: CaseData): BoardState {
  return { hours: c.hours, timeline: [], attempts: {}, confirmed: [], submissions: 0, wrong: 0 };
}

/** 擺卡片免費。同一張卡再點一次就拿掉。 */
export function toggleCard(c: CaseData, b: BoardState, qid: string, card: string): BoardState {
  const q = c.questions.find((x) => x.id === qid)!;
  const cur = b.attempts[qid] ?? { cards: [], relation: null };
  const has = cur.cards.includes(card);
  if (!has && cur.cards.length >= q.answer.length) return b;
  const cards = has ? cur.cards.filter((x) => x !== card) : [...cur.cards, card];
  return { ...b, attempts: { ...b.attempts, [qid]: { ...cur, cards } } };
}

export function setRelation(b: BoardState, qid: string, relation: Relation): BoardState {
  const cur = b.attempts[qid] ?? { cards: [], relation: null };
  return { ...b, attempts: { ...b.attempts, [qid]: { ...cur, relation } } };
}

export function canSubmit(c: CaseData, b: BoardState, qid: string): boolean {
  const q = c.questions.find((x) => x.id === qid)!;
  const a = b.attempts[qid];
  return (
    b.hours >= 1 &&
    !b.confirmed.includes(qid) &&
    !!a?.relation &&
    a.cards.length === q.answer.length
  );
}

/** 提交花 1 工時。整條全對才確認，錯了不說錯在哪。 */
export function submit(
  c: CaseData,
  b: BoardState,
  qid: string,
): { board: BoardState; ok: boolean } {
  if (!canSubmit(c, b, qid)) return { board: b, ok: false };
  const q = c.questions.find((x) => x.id === qid)!;
  const a = b.attempts[qid];
  const ok =
    a.relation === q.relation &&
    q.answer.every((id) => a.cards.includes(id)) &&
    a.cards.every((id) => q.answer.includes(id));
  return {
    ok,
    board: {
      ...b,
      hours: b.hours - 1,
      submissions: b.submissions + 1,
      wrong: b.wrong + (ok ? 0 : 1),
      confirmed: ok ? [...b.confirmed, qid] : b.confirmed,
    },
  };
}

export function toggleTimeline(b: BoardState, card: string): BoardState {
  const timeline = b.timeline.includes(card)
    ? b.timeline.filter((x) => x !== card)
    : [...b.timeline, card];
  return { ...b, timeline };
}

/** 時間線的順序完全由玩家決定，所以是搬動，不是排序。 */
export function moveTimeline(b: BoardState, card: string, dir: -1 | 1): BoardState {
  const i = b.timeline.indexOf(card);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= b.timeline.length) return b;
  const timeline = [...b.timeline];
  [timeline[i], timeline[j]] = [timeline[j], timeline[i]];
  return { ...b, timeline };
}

export function confirmedArguments(c: CaseData, b: BoardState) {
  return c.questions.filter((q) => b.confirmed.includes(q.id)).map((q) => q.argument);
}
