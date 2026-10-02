import type { Line, NegotiationScene, Offer } from './schema';

export interface NegoState {
  confidence: number;
  rounds: number;
  /** 談判信用：被識破一次 −1，之後攤牌效果每次少 20%（企劃書 6.8）。 */
  credit: number;
  played: string[];
  bluffed: string[];
  /** 攤牌或虛張聲勢洩漏出去的論點，庭上衝擊減半。 */
  exposed: string[];
  trust: number;
  log: Line[];
  /** null＝還在談；'walk'＝離席；'deal'＝委託人接受了條件。 */
  outcome: 'walk' | 'deal' | null;
  deal: string | null;
  /** 成交的條件 id，結局依此分支（企劃書 10.9 的 E4）。 */
  dealId?: string;
  /** 和解授權：目前上限、打過幾通電話、非金錢條款是否已獲同意。 */
  cap?: number;
  calls?: number;
  termsOk?: boolean;
  /** 請示留下的旗標，分支看得到。 */
  flags?: string[];
}

export function startNegotiation(s: NegotiationScene): NegoState {
  return {
    confidence: s.confidence,
    rounds: s.rounds,
    credit: 0,
    played: [],
    bluffed: [],
    exposed: [],
    trust: s.client.trust,
    log: [...s.intro],
    outcome: null,
    deal: null,
    cap: s.authority?.cap,
    calls: 0,
    termsOk: false,
    flags: [],
  };
}

/** 這個條件在授權範圍內嗎（沒有授權機制的談判一律可以）。 */
export function authorized(s: NegotiationScene, st: NegoState, o: Offer = offerOf(s, st)): boolean {
  if (!s.authority) return true;
  const cap = st.cap ?? s.authority.cap;
  return (o.amount ?? 0) <= cap && (!o.terms || !!st.termsOk);
}

/** 打電話請示委託人：用掉一回合，上限提高，評價下降。 */
export function call(s: NegotiationScene, st: NegoState): NegoState {
  const a = s.authority;
  if (!a || !canAct(st)) return st;
  const n = (st.calls ?? 0) + 1;
  const next = spend(st);
  return {
    ...next,
    cap: (st.cap ?? a.cap) + a.raise,
    calls: n,
    termsOk: st.termsOk || a.terms,
    flags: [...(st.flags ?? []), `call:${s.id}:${n}`],
    log: [...next.log, ...a.calls[Math.min(n, a.calls.length) - 1]],
  };
}

/** 對方當下開得出來的條件：信心越低，條件越好。 */
export function offerOf(s: NegotiationScene, st: NegoState): Offer {
  return (
    [...s.offers].sort((a, b) => b.min - a.min).find((o) => st.confidence >= o.min) ??
    s.offers[s.offers.length - 1]
  );
}

const spend = (st: NegoState): NegoState => ({ ...st, rounds: st.rounds - 1 });

export function canAct(st: NegoState): boolean {
  return st.outcome === null && st.rounds > 0;
}

/** 攤牌：亮一張確認過的論點，信心下降論點強度，但那個論點就此洩漏。 */
export function reveal(
  s: NegotiationScene,
  st: NegoState,
  id: string,
  strength: number,
  name: string,
): NegoState {
  if (!canAct(st) || st.played.includes(id)) return st;
  // 被識破過的人說話沒那麼有分量：每一點信用損失讓攤牌少 20% 效果。
  const drop = Math.round(strength * Math.max(0.2, 1 - 0.2 * st.credit));
  const next = spend(st);
  return {
    ...next,
    confidence: Math.max(0, next.confidence - Math.max(1, drop)),
    played: [...next.played, id],
    exposed: [...new Set([...next.exposed, id])],
    log: [
      ...next.log,
      { who: '伊恩', text: `我手上有這個：${name}。`, mood: '平', thought: false },
      ...s.reveals,
    ],
  };
}

/**
 * 虛張聲勢：聲稱你有某個還沒確認的論點。
 * 對方核對開示過的證據清單——全都在就相信，缺一張就識破，談判信用 −1。
 */
export function bluff(s: NegotiationScene, st: NegoState, id: string): NegoState {
  const b = s.bluffs.find((x) => x.id === id);
  if (!b || !canAct(st) || st.bluffed.includes(id)) return st;
  const believed = b.needs.every((n) => s.disclosed.includes(n));
  const next = spend(st);
  if (!believed)
    return {
      ...next,
      credit: next.credit + 1,
      bluffed: [...next.bluffed, id],
      log: [...next.log, { who: '伊恩', text: b.label, mood: '平', thought: false }, ...b.caught],
    };
  return {
    ...next,
    confidence: Math.max(0, next.confidence - Math.max(1, Math.round(b.strength / 2))),
    bluffed: [...next.bluffed, id],
    log: [...next.log, { who: '伊恩', text: b.label, mood: '平', thought: false }, ...b.believed],
  };
}

/** 把對方當下的條件轉給委託人。伊森才有最後決定權（職業倫理）。 */
export function advise(s: NegotiationScene, st: NegoState, take: boolean): NegoState {
  if (st.outcome !== null) return st;
  const o = offerOf(s, st);
  if (take && !authorized(s, st, o)) return { ...st, log: [...st.log, ...s.authority!.over] };
  if (take)
    return { ...st, outcome: 'deal', deal: o.label, dealId: o.id, log: [...st.log, ...s.accepted] };
  // 勸他撐下去：信任低的委託人會自己點頭。
  if (st.trust <= 1)
    return { ...st, outcome: 'deal', deal: o.label, dealId: o.id, log: [...st.log, ...s.accepted] };
  return { ...st, trust: st.trust - 1, log: [...st.log, ...o.asks] };
}

export function walk(s: NegotiationScene, st: NegoState): NegoState {
  if (st.outcome !== null) return st;
  return { ...st, outcome: 'walk', log: [...st.log, ...s.walkOut] };
}

export function done(st: NegoState): boolean {
  return st.outcome !== null || st.rounds <= 0;
}
