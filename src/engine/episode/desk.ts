import { allAnswered, type Result } from './discovery';
import type { Relation } from '../schema';
import type { DeskScene, Line } from './schema';

export interface MotionAttempt {
  basis: string | null;
  support: string[];
  request: string | null;
  /** 裁定結果；null 代表還沒送出。 */
  ruling: 'granted' | 'denied' | null;
  /** 對方聲請撤銷後，玩家選了哪一個。 */
  twist: number | null;
}

export interface DeskState {
  hours: number;
  /** 時間線上的卡片，順序就是玩家排的順序。 */
  timeline: string[];
  spent: number;
  marked: string[];
  readDocs: string[];
  jobs: string[];
  /** 已經寄達的郵件（含一開始就在收件匣裡的）。 */
  mail: string[];
  openMail: string[];
  /** 連線區正在拼的那一條（推理第一步）。 */
  link: { cards: string[]; relation: Relation | null };
  /** 已經連成的發現。 */
  found: string[];
  /** 連錯的次數；每次扣 1 工時。 */
  badLinks: number;
  linkNote: string | null;
  /** 上一次連錯錯在哪：兩張卡根本沒關係（cards），或卡對了但關係選錯（relation）。 */
  linkMiss?: 'cards' | 'relation' | null;
  /** 各疑問放了哪些發現或論點（推理第二步）。 */
  attempts: Record<string, { cards: string[] }>;
  confirmed: string[];
  submissions: number;
  wrong: number;
  report: Line[];
  feedback: Record<string, string>;
  /** 各疑問提交過、沒通過的組合（排序過的卡片 id）。同樣的組合不能再交一次。舊存檔沒有這欄。 */
  tried?: Record<string, string[][]>;
  motions: Record<string, MotionAttempt>;
  /** 帶到後面幕的旗標，例如動議被駁回會讓開庭第一天的法官耐心 −1。 */
  flags: string[];
  /** 玩家按下結束調查才進下一幕。 */
  wrapped: boolean;
  /** 證據開示：每項請求的結果（見 discovery.ts）。 */
  discovery?: Record<string, Result>;
}

export function startDesk(s: DeskScene): DeskState {
  return {
    hours: s.hours,
    timeline: [],
    spent: 0,
    marked: [],
    readDocs: [],
    jobs: [],
    mail: s.mail.filter((m) => m.afterHours === 0).map((m) => m.id),
    openMail: [],
    link: { cards: [], relation: null },
    found: [],
    badLinks: 0,
    linkNote: null,
    attempts: {},
    confirmed: [],
    submissions: 0,
    wrong: 0,
    report: [],
    feedback: {},
    motions: {},
    flags: [],
    wrapped: false,
  };
}

/** 手上有的卡片：卷宗附的、標記出來的、委託拿回來的、郵件附的、確認的論點。 */
export function heldCards(s: DeskScene, st: DeskState, carried: string[] = []): string[] {
  const held = s.cards.filter((c) => c.held).map((c) => c.id);
  const fromJobs = s.jobs.filter((j) => st.jobs.includes(j.id)).flatMap((j) => j.gives);
  const fromMail = s.mail.filter((m) => st.mail.includes(m.id)).flatMap((m) => m.gives);
  const args = s.questions.filter((q) => st.confirmed.includes(q.id)).map((q) => q.argument.id);
  const fromMotions = motionCards(s, st);
  return [
    ...new Set([
      ...carried,
      ...held,
      ...st.marked,
      ...fromJobs,
      ...fromMail,
      ...fromMotions,
      ...args,
    ]),
  ];
}

/** 花工時；同時把到時間的郵件放進收件匣（證據開示收件匣，企劃書 6.3）。 */
function spend(s: DeskScene, st: DeskState, hours: number): DeskState {
  const spent = st.spent + hours;
  const arrived = s.mail.filter((m) => m.afterHours > 0 && m.afterHours <= spent).map((m) => m.id);
  return { ...st, hours: st.hours - hours, spent, mail: [...new Set([...st.mail, ...arrived])] };
}

/** 讀文件免費。點到劇本標記為關鍵事實的句子才生成卡片，點錯沒有懲罰。 */
export function mark(s: DeskScene, st: DeskState, fact: string): DeskState {
  const known = s.cards.some((c) => c.id === fact);
  if (!known || st.marked.includes(fact)) return st;
  return { ...st, marked: [...st.marked, fact] };
}

export function openDoc(st: DeskState, docId: string): DeskState {
  return st.readDocs.includes(docId) ? st : { ...st, readDocs: [...st.readDocs, docId] };
}

export function openMail(st: DeskState, mailId: string): DeskState {
  return st.openMail.includes(mailId) ? st : { ...st, openMail: [...st.openMail, mailId] };
}

export function toggleTimeline(st: DeskState, card: string): DeskState {
  const timeline = st.timeline.includes(card)
    ? st.timeline.filter((x) => x !== card)
    : [...st.timeline, card];
  return { ...st, timeline };
}

/** 順序由玩家決定，所以是搬動，不是排序。 */
export function moveTimeline(st: DeskState, card: string, dir: -1 | 1): DeskState {
  const i = st.timeline.indexOf(card);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= st.timeline.length) return st;
  const timeline = [...st.timeline];
  [timeline[i], timeline[j]] = [timeline[j], timeline[i]];
  return { ...st, timeline };
}

export function canCommission(
  s: DeskScene,
  st: DeskState,
  jobId: string,
  carried: string[] = [],
): boolean {
  const j = s.jobs.find((x) => x.id === jobId);
  if (!j || st.jobs.includes(j.id) || st.hours < j.cost) return false;
  const held = heldCards(s, st, carried);
  return j.needs.every((n) => held.includes(n));
}

/** 委託：花工時下注，回報以郵件與報告抵達。 */
export function commission(
  s: DeskScene,
  st: DeskState,
  jobId: string,
  carried: string[] = [],
): DeskState {
  if (!canCommission(s, st, jobId, carried)) return st;
  const j = s.jobs.find((x) => x.id === jobId)!;
  return { ...spend(s, st, j.cost), jobs: [...st.jobs, j.id], report: j.report };
}

export function clearReport(st: DeskState): DeskState {
  return { ...st, report: [] };
}

/** 連線區：挑兩張卡。 */
export function toggleLinkCard(st: DeskState, card: string): DeskState {
  const cur = st.link;
  const has = cur.cards.includes(card);
  if (!has && cur.cards.length >= 2) return st;
  const cards = has ? cur.cards.filter((x) => x !== card) : [...cur.cards, card];
  return { ...st, link: { ...cur, cards }, linkNote: null };
}

export function setLinkRelation(st: DeskState, relation: Relation): DeskState {
  return { ...st, link: { ...st.link, relation }, linkNote: null };
}

export function canConnect(st: DeskState): boolean {
  return st.hours >= 1 && st.link.cards.length === 2 && !!st.link.relation;
}

/**
 * 推理第一步（企劃書 6.5）：兩張卡加一種關係，當場知道成不成立。
 * 連對不花工時；連錯扣 1 工時，免得逐一亂試。
 */
export function connect(s: DeskScene, st: DeskState): DeskState {
  if (!canConnect(st)) return st;
  const { cards, relation } = st.link;
  const hit = s.links.find((l) => l.relation === relation && fits(l.cards, l.accept, cards));
  if (hit && st.found.includes(hit.id))
    return {
      ...st,
      link: { cards: [], relation: null },
      linkMiss: null,
      linkNote: '這條已經連過了。',
    };
  if (hit)
    return {
      ...st,
      found: [...st.found, hit.id],
      link: { cards: [], relation: null },
      linkMiss: null,
      linkNote: `連起來了：${hit.text}`,
    };
  const next = spend(s, st, 1);
  const pair = s.links.some((l) => fits(l.cards, l.accept, cards));
  return {
    ...next,
    badLinks: next.badLinks + 1,
    linkMiss: pair ? 'relation' : 'cards',
    linkNote: '這兩張卡連不起來，至少不是這種關係。白花了 1 工時。',
  };
}

/** 已經連成的發現，照連出來的先後。 */
export function findings(s: DeskScene, st: DeskState) {
  return st.found.flatMap((id) => s.links.filter((l) => l.id === id));
}

/**
 * 疑問看不看得到：unlock 列的卡片、發現、論點全部到手才出現，
 * 免得還沒查到的線索先從疑問的標題漏出來。
 */
export function questionOpen(
  s: DeskScene,
  st: DeskState,
  q: DeskScene['questions'][number],
  carried: string[] = [],
): boolean {
  if (!q.unlock.length) return true;
  const have = new Set([...heldCards(s, st, carried), ...st.found]);
  return q.unlock.every((id) => have.has(id));
}

/** 現在看得到的疑問，照劇本順序。 */
export function openQuestions(s: DeskScene, st: DeskState, carried: string[] = []) {
  return s.questions.filter((q) => questionOpen(s, st, q, carried));
}

/** 推理第二步：替疑問挑發現或論點。 */
export function toggleCard(
  s: DeskScene,
  st: DeskState,
  qid: string,
  card: string,
  carried: string[] = [],
): DeskState {
  const q = s.questions.find((x) => x.id === qid);
  if (!q || st.confirmed.includes(qid) || !questionOpen(s, st, q, carried)) return st;
  const cur = st.attempts[qid] ?? { cards: [] };
  const has = cur.cards.includes(card);
  // 格子滿了又挑新的一張：換掉最早挑的那張，不必先取消（還沒提交前隨時可以換）。
  const kept = !has && cur.cards.length >= q.answer.length ? cur.cards.slice(1) : cur.cards;
  const cards = has ? cur.cards.filter((x) => x !== card) : [...kept, card];
  return { ...st, attempts: { ...st.attempts, [qid]: { cards } } };
}

export function canSubmit(
  s: DeskScene,
  st: DeskState,
  qid: string,
  carried: string[] = [],
): boolean {
  const q = s.questions.find((x) => x.id === qid);
  const a = st.attempts[qid];
  return (
    !!q &&
    st.hours >= 1 &&
    !st.confirmed.includes(qid) &&
    questionOpen(s, st, q, carried) &&
    a?.cards.length === q.answer.length &&
    !triedBefore(st, qid)
  );
}

const key = (cards: string[]) => [...cards].sort().join('|');

/** 目前放在答案格的組合，之前已經交過而且沒通過。 */
export function triedBefore(st: DeskState, qid: string): boolean {
  const a = st.attempts[qid];
  if (!a) return false;
  return (st.tried?.[qid] ?? []).some((t) => key(t) === key(a.cards));
}

/** 這個疑問交錯了幾次。 */
export function misses(st: DeskState, qid: string): number {
  return st.tried?.[qid]?.length ?? 0;
}

/** 提交花 1 工時。全對才確認，遊戲不說哪一條放錯（企劃書 6.5）。 */
export function submit(
  s: DeskScene,
  st: DeskState,
  qid: string,
  carried: string[] = [],
): DeskState {
  if (!canSubmit(s, st, qid, carried)) return st;
  const q = s.questions.find((x) => x.id === qid)!;
  const ok = fits(q.answer, q.accept, st.attempts[qid].cards);
  const next = spend(s, st, 1);
  return {
    ...next,
    submissions: next.submissions + 1,
    wrong: next.wrong + (ok ? 0 : 1),
    confirmed: ok ? [...next.confirmed, qid] : next.confirmed,
    tried: ok
      ? next.tried
      : { ...next.tried, [qid]: [...(next.tried?.[qid] ?? []), [...st.attempts[qid].cards]] },
    feedback: {
      ...next.feedback,
      [qid]: ok
        ? '案情會議通過：這條推理成立，產生論點卡。'
        : '案情會議結論：這樣回答站不住。沒有人說得出是哪裡不對。',
    },
  };
}

/**
 * 選的卡能不能一對一填滿答案的每一格。每一格接受正解，或劇本列出的替代卡
 * （同一件事的不同出處，例如伊森的說法與叫車收據）。
 */
export function fits(
  answer: string[],
  accept: Record<string, string[]>,
  picked: string[],
): boolean {
  if (picked.length !== answer.length || new Set(picked).size !== picked.length) return false;
  const ok = (slot: string, card: string) => slot === card || (accept[slot] ?? []).includes(card);
  const go = (i: number, left: string[]): boolean =>
    i === answer.length ||
    left.some(
      (c) =>
        ok(answer[i], c) &&
        go(
          i + 1,
          left.filter((x) => x !== c),
        ),
    );
  return go(0, picked);
}

const attempt = (st: DeskState, id: string): MotionAttempt =>
  st.motions[id] ?? { basis: null, support: [], request: null, ruling: null, twist: null };

export function motionAttempt(st: DeskState, id: string) {
  return attempt(st, id);
}

const setAttempt = (st: DeskState, id: string, a: MotionAttempt): DeskState => ({
  ...st,
  motions: { ...st.motions, [id]: a },
});

export function pickBasis(st: DeskState, id: string, basis: string): DeskState {
  return setAttempt(st, id, { ...attempt(st, id), basis });
}

export function pickRequest(st: DeskState, id: string, request: string): DeskState {
  return setAttempt(st, id, { ...attempt(st, id), request });
}

export function toggleSupport(s: DeskScene, st: DeskState, id: string, card: string): DeskState {
  const m = s.motions.find((x) => x.id === id);
  const a = attempt(st, id);
  if (!m || a.ruling === 'granted') return st;
  const has = a.support.includes(card);
  if (!has && a.support.length >= m.support.length) return st;
  const support = has ? a.support.filter((x) => x !== card) : [...a.support, card];
  return setAttempt(st, id, { ...a, support });
}

export function canFile(s: DeskScene, st: DeskState, id: string, carried: string[] = []): boolean {
  const m = s.motions.find((x) => x.id === id);
  const a = attempt(st, id);
  if (!m || a.ruling === 'granted' || st.hours < m.cost) return false;
  const held = heldCards(s, st, carried);
  return (
    m.needs.every((n) => held.includes(n)) &&
    !!a.basis &&
    !!a.request &&
    a.support.length === m.support.length
  );
}

/**
 * 提出動議（企劃書 6.6）：法律依據、支撐、請求三樣都對才成立。
 * 依據錯了是駁回，並記下旗標，開庭第一天法官耐心 −1（他記得你浪費時間）。
 * 駁回後可以修正再送，工時照扣；旗標已經記下，重送成功也不會抹掉。
 */
export function file(s: DeskScene, st: DeskState, id: string, carried: string[] = []): DeskState {
  if (!canFile(s, st, id, carried)) return st;
  const m = s.motions.find((x) => x.id === id)!;
  const a = attempt(st, id);
  const ok = a.basis === m.basis && a.request === m.request && fits(m.support, m.accept, a.support);
  const next = spend(s, st, m.cost);
  return {
    ...setAttempt(next, id, { ...a, ruling: ok ? 'granted' : 'denied' }),
    report: ok ? m.granted : m.denied,
    flags: [...new Set([...next.flags, ...(ok ? m.flags : ['motion-denied'])])],
  };
}

/** 對方聲請撤銷之後的抉擇：撤回，或出庭答辯。 */
export function resolveTwist(s: DeskScene, st: DeskState, id: string, option: number): DeskState {
  const m = s.motions.find((x) => x.id === id);
  const a = attempt(st, id);
  if (!m?.twist || a.ruling !== 'granted' || a.twist !== null) return st;
  const o = m.twist.options[option];
  if (!o) return st;
  return {
    ...setAttempt(st, id, { ...a, twist: option }),
    report: o.then,
    flags: [...new Set([...st.flags, ...o.flags])],
  };
}

/** 動議核准、對方也聲請了撤銷，而玩家還沒決定要不要硬扛。 */
export function pendingTwist(s: DeskScene, st: DeskState) {
  return s.motions.find(
    (m) => m.twist && attempt(st, m.id).ruling === 'granted' && attempt(st, m.id).twist === null,
  );
}

/** 動議拿到的卡片：核准就到手，但被撤回的那條路會收走。 */
export function motionCards(s: DeskScene, st: DeskState): string[] {
  return s.motions.flatMap((m) => {
    const a = attempt(st, m.id);
    if (a.ruling !== 'granted') return [];
    if (!m.twist) return m.gives;
    return a.twist === null ? [] : m.twist.options[a.twist].gives;
  });
}

/** 工時用完就直接進下一幕，帶著手上有的東西（企劃書 6.13）。 */
export function done(_s: DeskScene, st: DeskState): boolean {
  return st.wrapped || st.hours <= 0;
}

/** 過關的推理鏈確認之後，才能收工進下一幕。 */
export function canWrap(s: DeskScene, st: DeskState, carried: string[] = []): boolean {
  return st.confirmed.includes(s.goal) && allAnswered(s, st, carried);
}

export function wrap(st: DeskState): DeskState {
  return { ...st, wrapped: true };
}
