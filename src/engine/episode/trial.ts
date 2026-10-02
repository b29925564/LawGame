import { applyImpact, shiftAll, startJury, type Jury } from '../jury';
import type { Tag } from '../schema';
import type { TrialScene } from './schema';

export type Lock = 'none' | 'weak' | 'strong';
export type Objection = '誘導' | '傳聞' | '推測' | '無關' | '已問已答' | '缺乏基礎';
export const OBJECTIONS: Objection[] = ['誘導', '傳聞', '推測', '無關', '已問已答', '缺乏基礎'];

export interface LogLine {
  who: string;
  text: string;
  struck?: boolean;
}

export interface ClaimState {
  lock: Lock;
  setup: boolean;
  result: 'none' | 'impeached' | 'softened';
}

export interface TrialState {
  stage: 'direct' | 'cross' | 'done';
  /** 直接詰問問到第幾題；window 為真時異議窗開著，證人還沒回答。 */
  i: number;
  window: boolean;
  patience: number;
  jury: Jury;
  deltas: Jury;
  claims: Record<string, ClaimState>;
  asked: number[];
  impeachments: number;
  /** 這場兌現的開場承諾。 */
  kept: string[];
  struck: number;
  rebuked: boolean;
  /** 證人當庭援引緘默權（企劃書 10.9 的 E1）：檢方撤回起訴，這一集就此結束。 */
  pleaded?: boolean;
  /** 證人援引緘默權，但辯方的理論不是指向她：檢方不撤訴，她的證詞整段刪除，審判繼續。 */
  stricken?: boolean;
  /** 開庭時的心證；刪除證詞時退回主詰問造成的影響要用。 */
  opening?: Jury;
  /** 前幾場延續下來、還沒回彈掉的辯方成果（負值＝往無罪）。 */
  credit?: Jury;
  /** 檢方主詰問結束時的心證；交互詰問拆掉多少，就從這裡比。 */
  directEnd?: Jury;
  log: LogLine[];
}

export const JUDGE = '法官';
export const YOU = '盧卡斯';
export const DA = '莫羅檢察官';

/** 隔天開庭，前一場辯方拆掉的懷疑回彈這麼多（記憶淡化）；其餘延續下去。 */
export const CARRY = 0.5;

/**
 * 延續前一場庭審：陪審團記得辯方在交互詰問拆掉了什麼。
 * 只延續交互詰問的成果（主詰問每場都會重新把心證推高，那一段不重複算），
 * 前幾場的成果累加，每過一天回彈一半。前面什麼都沒拆，就從起點開始。
 */
export function creditOf(previous: TrialState, all = false): Jury {
  // 民事：原告一天一天把案子堆起來，陪審團記得整天的印象（主詰問也算），同樣每天回彈一半。
  const from = (all ? previous.opening : previous.directEnd) ?? previous.jury;
  const before = previous.credit ?? {};
  return Object.fromEntries(
    Object.keys(previous.jury).map((id) => [
      id,
      ((before[id] ?? 0) + (previous.jury[id] - (from[id] ?? previous.jury[id]))) * (1 - CARRY),
    ]),
  );
}

export function carryJury(s: TrialScene, previous: TrialState): Jury {
  const credit = creditOf(previous, s.burden === 'civil');
  return Object.fromEntries(
    Object.entries(startJury(s)).map(([id, v]) => [
      id,
      Math.max(0, Math.min(100, Math.round(v + (credit[id] ?? 0)))),
    ]),
  );
}

/** anchored＝證詞錄取時已經在宣誓下講死的說法，開庭時等於鎖定已經完成。 */
export function startTrial(
  s: TrialScene,
  anchored: string[] = [],
  previous?: TrialState,
): TrialState {
  const jury = previous ? carryJury(s, previous) : startJury(s);
  return {
    stage: 'direct',
    i: 0,
    window: false,
    patience: s.patience,
    jury,
    opening: jury,
    credit: previous ? creditOf(previous, s.burden === 'civil') : {},
    deltas: {},
    claims: Object.fromEntries(
      s.witness.claims.map((c) => [
        c.id,
        {
          lock: c.anchor && anchored.includes(c.anchor) ? 'strong' : 'none',
          setup: false,
          result: 'none',
        } as ClaimState,
      ]),
    ),
    asked: [],
    impeachments: 0,
    kept: [],
    struck: 0,
    rebuked: false,
    log: [],
  };
}

const say = (st: TrialState, ...lines: LogLine[]): TrialState => ({
  ...st,
  log: [...st.log, ...lines].slice(-10),
});

/** 扣法官耐心；歸零＝公開訓斥，全體有罪傾向 +5，剩下的詰問取消（企劃書 6.11）。 */
function losePatience(s: TrialScene, st: TrialState, why: string): TrialState {
  let next = say({ ...st, patience: st.patience - 1, deltas: {} }, { who: JUDGE, text: why });
  if (next.patience <= 0) {
    const r = shiftAll(s, next.jury, 5);
    next = say(
      { ...next, jury: r.jury, deltas: r.deltas, rebuked: true, stage: 'done' },
      { who: JUDGE, text: '律師，我警告過妳了。詰問到此為止，本庭不容許這樣浪費陪審團的時間。' },
    );
  }
  return next;
}

/** 檢方問下一題，異議窗打開，證人還沒回答。 */
export function nextQuestion(s: TrialScene, st: TrialState): TrialState {
  if (st.stage !== 'direct' || st.window) return st;
  const q = s.witness.direct[st.i];
  if (!q) return toCross(s, st);
  return say({ ...st, window: true, deltas: {} }, { who: s.examiner ?? DA, text: q.q });
}

/** 不異議：證詞留在陪審團腦中，往有罪方向推。 */
export function letPass(s: TrialScene, st: TrialState): TrialState {
  if (!st.window) return st;
  const q = s.witness.direct[st.i];
  const r = applyImpact(s, st.jury, -q.impact, q.tags as Tag[]);
  return say(
    { ...st, window: false, i: st.i + 1, jury: r.jury, deltas: r.deltas },
    { who: s.witness.name, text: q.a },
  );
}

/** 異議：理由對了那句證詞從陪審團視角刪除；錯了法官耐心 −1（企劃書 6.9.5）。 */
export function object(s: TrialScene, st: TrialState, reason: Objection): TrialState {
  if (!st.window) return st;
  const q = s.witness.direct[st.i];
  if (q.objection === reason) {
    return say(
      { ...st, window: false, i: st.i + 1, struck: st.struck + 1, deltas: {} },
      { who: YOU, text: `異議，${reason}。` },
      { who: JUDGE, text: q.sustained ?? '異議成立。陪審團請不要理會這個問題。' },
      { who: s.witness.name, text: q.a, struck: true },
    );
  }
  const next = losePatience(
    s,
    say(st, { who: YOU, text: `異議，${reason}。` }),
    '異議駁回。律師，這個問題沒有問題。',
  );
  if (next.rebuked) return next;
  const r = applyImpact(s, next.jury, -q.impact, q.tags as Tag[]);
  return say(
    { ...next, window: false, i: next.i + 1, jury: r.jury, deltas: r.deltas },
    { who: s.witness.name, text: q.a },
  );
}

export function toCross(s: TrialScene, st: TrialState): TrialState {
  if (st.stage !== 'direct') return st;
  return say(
    { ...st, stage: 'cross', window: false, deltas: {}, directEnd: st.jury },
    { who: JUDGE, text: `辯方可以詰問${s.witness.name}。` },
  );
}

/** 鎖定：措辭精確才鎖得死，含糊的問法會留給他轉圜空間。 */
export function lock(
  s: TrialScene,
  st: TrialState,
  claimId: string,
  how: 'strong' | 'weak',
): TrialState {
  const c = s.witness.claims.find((x) => x.id === claimId);
  const cur = st.claims[claimId];
  if (!c || st.stage !== 'cross' || !cur || cur.lock !== 'none') return st;
  const q = how === 'strong' ? c.lock.strong : c.lock.weak;
  return say(
    { ...st, claims: { ...st.claims, [claimId]: { ...cur, lock: how } }, deltas: {} },
    { who: YOU, text: q.q },
    { who: s.witness.name, text: q.a },
  );
}

/** 鋪陳：先確立反證的可信度，否則出示時會被異議「缺乏證據基礎」。 */
export function setup(s: TrialScene, st: TrialState, claimId: string): TrialState {
  const c = s.witness.claims.find((x) => x.id === claimId);
  const cur = st.claims[claimId];
  if (!c || st.stage !== 'cross' || !cur || cur.setup) return st;
  return say(
    { ...st, claims: { ...st.claims, [claimId]: { ...cur, setup: true } }, deltas: {} },
    { who: YOU, text: c.setup.q },
    { who: s.witness.name, text: c.setup.a },
  );
}

/** 對質：沒鋪陳就被擋下；鎖得夠死才是彈劾成功，衝擊 ×1.5。 */
export function confront(
  s: TrialScene,
  st: TrialState,
  claimId: string,
  strength: number,
  tags: Tag[],
  /** 出示的是哪個論點、有沒有洩漏過、手上有哪些卡片可以破解她的反擊。 */
  arg: {
    id?: string;
    exposed?: boolean;
    cards?: string[];
    /** 出示這個論點會兌現的開場承諾 id，以及兌現時全體往辯方移多少。 */
    promise?: { id: string; kept: number };
    /** 玩家選的案件理論；決定緘默權是撤訴還是刪除證詞。 */
    theory?: string | null;
  } = {},
): TrialState {
  const c = s.witness.claims.find((x) => x.id === claimId);
  const cur = st.claims[claimId];
  if (!c || st.stage !== 'cross' || !cur || cur.result !== 'none') return st;
  if (!cur.setup)
    return losePatience(
      s,
      say(st, { who: s.examiner ?? DA, text: '異議，缺乏證據基礎。這份資料還沒有被本庭採納。' }),
      '異議成立。律師，先建立基礎。',
    );
  if (cur.lock === 'none') return say(st, { who: JUDGE, text: '律師，證人還沒有就這一點作證。' });

  const strong = cur.lock === 'strong';
  // 底牌反擊（企劃書 6.8）：論點洩漏過，檢方早就備好說法，破解不了就衝擊減半。
  const counter = c.counter && arg.exposed && c.counter.argument === arg.id ? c.counter : null;
  const broke = !arg.exposed ? true : counter ? (arg.cards ?? []).includes(counter.needs) : false;
  const rebuttal: LogLine[] = counter
    ? [
        { who: s.examiner ?? DA, text: counter.text },
        { who: YOU, text: broke ? counter.broken : counter.failed },
      ]
    : [];
  const r = applyImpact(s, st.jury, strength, tags, (strong ? 1.5 : 0.5) * (broke ? 1 : 0.5));
  const impeached = strong && broke;
  let next = say(
    {
      ...st,
      jury: r.jury,
      deltas: r.deltas,
      impeachments: st.impeachments + (impeached ? 1 : 0),
      claims: { ...st.claims, [claimId]: { ...cur, result: impeached ? 'impeached' : 'softened' } },
    },
    ...rebuttal,
    { who: s.witness.name, text: impeached ? c.confront.strong : c.confront.weak },
  );
  if (impeached) next = say(next, { who: '旁白', text: s.witness.breakdown });
  // 開場承諾兌現（企劃書 6.9.3）：陪審員記得你說過的話，全體往辯方移。
  const p = arg.promise;
  if (impeached && p && !(next.kept ?? []).includes(p.id)) {
    const k = shiftAll(s, next.jury, -p.kept);
    const deltas: Jury = {};
    for (const id of Object.keys(k.jury)) deltas[id] = k.jury[id] - st.jury[id];
    next = say(
      { ...next, jury: k.jury, deltas, kept: [...(next.kept ?? []), p.id] },
      { who: '旁白', text: '開場時你許下的承諾，兌現了。陪審團記得。' },
    );
  }
  // 彈劾夠多次又出示了那個論點，她就當庭援引緘默權，詰問到此為止。
  // 辯方理論指向她，檢方撐不下去、撤回起訴（E1）；否則法官刪除她的證詞，審判繼續。
  const f = s.fifth;
  if (f && arg.id === f.argument && next.impeachments >= f.needs) {
    const lines = f.lines.map((l) => ({ who: l.who, text: l.text }));
    if (!f.theory || arg.theory === f.theory)
      next = say({ ...next, stage: 'done', pleaded: true }, ...lines);
    else next = strike(s, next, lines);
  }
  return next;
}

export const STRUCK_DEFAULT =
  '陪審團請注意：本席裁定，證人的證詞全部刪除。各位評議時不得列入考慮。';

/**
 * 證人當著陪審團援引緘默權，就算證詞刪除，陪審員也忘不掉：
 * 心證退回她上證人席之前，再往無罪多移這麼多。
 */
export const FIFTH_LEAN = 10;

/** 刪除證詞：她這一場造成的心證全部撤銷（退回開庭時），加上緘默權留下的懷疑。 */
function strike(s: TrialScene, st: TrialState, lines: LogLine[]): TrialState {
  const from = st.opening ?? startJury(s);
  const jury = Object.fromEntries(
    Object.entries(st.jury).map(([id, v]) => [
      id,
      Math.max(0, Math.min(v, Math.round((from[id] ?? v) - FIFTH_LEAN))),
    ]),
  );
  const deltas: Jury = {};
  for (const id of Object.keys(jury)) deltas[id] = jury[id] - st.jury[id];
  const judge = s.fifth?.struck?.length
    ? s.fifth.struck.map((l) => ({ who: l.who, text: l.text }))
    : [{ who: JUDGE, text: STRUCK_DEFAULT }];
  return say({ ...st, stage: 'done', stricken: true, jury, deltas }, ...lines, ...judge);
}

/** 糾纏：重複問同一件事，法官耐心 −1，重視情感的陪審員反感。 */
export function badger(s: TrialScene, st: TrialState, i: number): TrialState {
  const q = s.witness.irrelevant[i];
  if (!q || st.stage !== 'cross') return st;
  const repeat = st.asked.includes(i);
  const next = say(
    { ...st, asked: [...st.asked, i], deltas: {} },
    { who: YOU, text: q.q },
    {
      who: s.witness.name,
      text: q.a,
    },
  );
  if (!repeat) return next;
  const r = shiftAll(s, next.jury, 2, '情感');
  const after = losePatience(s, next, '異議成立。律師，這個問題證人已經回答過了。');
  return after.rebuked ? after : { ...after, jury: r.jury, deltas: r.deltas };
}

export function finish(st: TrialState): TrialState {
  return { ...st, stage: 'done', deltas: {} };
}
