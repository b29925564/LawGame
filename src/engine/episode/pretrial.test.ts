import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import * as depo from './deposition';
import * as nego from './negotiation';
import type { DepositionScene, NegotiationScene } from './schema';

const scene = <T>(id: string) => episodes.ep1.scenes.find((s) => s.id === id) as T;
const rachel = scene<DepositionScene>('depo-rachel');
const plea = scene<NegotiationScene>('plea-morrow');

describe('證詞錄取', () => {
  it('定錨的問題把說法變成宣誓陳述，額度用掉一個', () => {
    let st = depo.startDeposition(rachel);
    st = depo.ask(rachel, st, 'd-heard');
    expect(st.left).toBe(rachel.budget - 1);
    expect(st.anchored).toContain('rachel-2250');
    expect(st.log.some((l) => l.text.includes('十點五十分'))).toBe(true);
    // 同一個問題問不了第二次。
    expect(depo.ask(rachel, st, 'd-heard')).toBe(st);
  });

  it('底牌話題問了就洩漏方向，無害的問題不會', () => {
    let st = depo.ask(rachel, depo.startDeposition(rachel), 'd-online');
    expect(st.exposed).toEqual([]);
    st = depo.ask(rachel, st, 'd-watch');
    expect(st.exposed).toContain('arg-b');
  });

  it('對造律師異議，證人照樣要回答', () => {
    const st = depo.ask(rachel, depo.startDeposition(rachel), 'd-who');
    expect(st.log.some((l) => l.who === '對造律師')).toBe(true);
    expect(st.gained).toContain('meeting-name');
  });

  it('問題比額度多，額度用完就結束；也可以提早收手', () => {
    const all = rachel.topics.flatMap((t) => t.questions);
    expect(all.length).toBeGreaterThan(rachel.budget);
    let st = depo.startDeposition(rachel);
    for (const q of all) st = depo.ask(rachel, st, q.id);
    expect(st.left).toBe(0);
    expect(depo.done(st)).toBe(true);
    expect(depo.done(depo.finish(depo.startDeposition(rachel)))).toBe(true);
  });
});

describe('認罪協商', () => {
  it('信心越低，莫羅開的條件越好', () => {
    const st = nego.startNegotiation(plea);
    expect(nego.offerOf(plea, st).label).toContain('十五年');
    expect(nego.offerOf(plea, { ...st, confidence: 55 }).label).toContain('三年');
    expect(nego.offerOf(plea, { ...st, confidence: 10 }).label).toContain('緩刑');
  });

  it('攤牌讓信心下降，但那個論點就此洩漏', () => {
    const st = nego.reveal(plea, nego.startNegotiation(plea), 'arg-b', 25, '論點 B');
    expect(st.confidence).toBe(plea.confidence - 25);
    expect(st.exposed).toContain('arg-b');
    expect(st.rounds).toBe(plea.rounds - 1);
  });

  it('虛張聲勢：需要的證據你手上都有她就信，缺一張就被識破，之後攤牌打折', () => {
    const held = ['autopsy', 'watch-photo'];
    const ok = nego.bluff(plea, nego.startNegotiation(plea), 'b-time', held);
    expect(ok.confidence).toBe(plea.confidence - 10);
    expect(ok.credit).toBe(0);

    const caught = nego.bluff(plea, nego.startNegotiation(plea), 'b-witness', held);
    expect(caught.confidence).toBe(plea.confidence);
    expect(caught.credit).toBe(1);
    const after = nego.reveal(plea, caught, 'arg-b', 25, '論點 B');
    expect(plea.confidence - after.confidence).toBeLessThan(25);
  });

  it('同一句虛張聲勢，拿到證據前後結果不同', () => {
    const before = nego.bluff(plea, nego.startNegotiation(plea), 'b-witness', []);
    const after = nego.bluff(plea, nego.startNegotiation(plea), 'b-witness', ['meeting-name']);
    expect(before.credit).toBe(1);
    expect(after.credit).toBe(0);
    expect(after.confidence).toBeLessThan(plea.confidence);
  });

  it('決定權在伊森手上：勸他撐下去會磨掉信任，信任見底他就自己點頭', () => {
    let st = nego.startNegotiation(plea);
    st = nego.advise(plea, st, false);
    expect(st.outcome).toBeNull();
    expect(st.trust).toBe(plea.client.trust - 1);
    st = nego.advise(plea, st, false);
    expect(st.outcome).toBeNull();
    st = nego.advise(plea, st, false);
    expect(st.outcome).toBe('deal');
  });

  it('接受就是一個正式結局，離席也結束這一幕', () => {
    const deal = nego.advise(plea, nego.startNegotiation(plea), true);
    expect(deal.outcome).toBe('deal');
    expect(deal.deal).toContain('十五年');
    expect(nego.done(deal)).toBe(true);
    expect(nego.walk(plea, nego.startNegotiation(plea)).outcome).toBe('walk');
  });
});

describe('和解授權', () => {
  const say = (text: string) => [{ who: '亞瑟', text, mood: '平' as const, thought: false }];
  const civil = (): NegotiationScene => ({
    ...structuredClone(plea),
    offers: plea.offers.map((o, i) => ({
      ...o,
      amount: 3_000_000 - i * 1_000_000,
      terms: i === 0,
    })),
    authority: {
      cap: 1_500_000,
      raise: 1_000_000,
      terms: true,
      calls: [say('一'), say('二'), say('三')],
      over: say('超過了'),
    },
  });

  it('超過上限不能接受，請示一次用掉一回合、上限提高、留下旗標', () => {
    const s = civil();
    let st = nego.startNegotiation(s);
    const o = nego.offerOf(s, st);
    expect(nego.authorized(s, st, o)).toBe(false);
    const tried = nego.advise(s, st, true);
    expect(tried.outcome).toBeNull();
    expect(tried.log.at(-1)?.text).toBe('超過了');
    st = nego.call(s, st);
    expect(st.rounds).toBe(s.rounds - 1);
    expect(st.cap).toBe(2_500_000);
    expect(st.termsOk).toBe(true);
    expect(st.flags).toEqual([`call:${s.id}:1`]);
    st = nego.call(s, st);
    st = nego.call(s, st);
    expect(st.log.at(-1)?.text).toBe('三');
    expect(st.flags).toContain(`call:${s.id}:3`);
    // 寫好的回應用完（委託人說別再打來），就不能再打。
    expect(nego.canCall(s, st)).toBe(false);
    expect(nego.call(s, st)).toBe(st);
    expect(nego.advise(s, st, true).outcome).toBe('deal');
  });

  it('沒有授權設定的談判照舊', () => {
    const st = nego.startNegotiation(plea);
    expect(nego.authorized(plea, st)).toBe(true);
    expect(nego.call(plea, st)).toBe(st);
  });
});

describe('對方主導的證詞錄取', () => {
  const theirs = (): DepositionScene => ({
    ...structuredClone(rachel),
    side: 'theirs',
    examiner: '奧卡福',
    topics: [],
    script: [
      {
        id: 't-name',
        q: '請說名字。',
        a: '普莉亞。',
        objection: null,
        gives: [],
        missed: { gives: [], flags: [] },
      },
      {
        id: 't-lead',
        q: '妳同意吧？',
        a: '同意。',
        objection: '誘導',
        gives: [],
        missed: { gives: [], flags: [] },
      },
      {
        id: 't-memo',
        q: '法務說了什麼？',
        a: '說風險可控。',
        objection: '特權',
        gives: ['memo'],
        missed: { gives: [], flags: [] },
      },
      {
        id: 't-log',
        q: '他死後還被扣分？',
        a: '對。',
        objection: null,
        gives: ['d11'],
        missed: { gives: [], flags: [] },
      },
    ],
  });

  it('依序問；對的異議留紀錄，特權不回答，亂異議記一筆，沒異議就放棄', () => {
    const s = theirs();
    let st = depo.startDeposition(s);
    expect(depo.ask(s, st, 'd-heard')).toBe(st);
    expect(depo.current(s, st)?.id).toBe('t-name');
    st = depo.defend(s, st, '無關');
    expect(st.wrong).toBe(1);
    st = depo.defend(s, st, null);
    expect(st.flags).toEqual([`depo:${s.id}:t-lead:waived`]);
    st = depo.defend(s, st, '特權');
    expect(st.flags).toContain(`depo:${s.id}:t-memo:preserved`);
    expect(st.gained).not.toContain('memo');
    expect(st.log.at(-1)?.text).toBe('我指示證人不要回答。');
    expect(st.over).toBe(false);
    st = depo.defend(s, st, null);
    expect(st.gained).toEqual(['d11']);
    expect(st.over).toBe(true);
    expect(depo.defend(s, st, null)).toBe(st);
  });
});

describe('談判的最後一回合', () => {
  it('回合用完還沒結束：可以接受最後的條件；勸他撐下去就是離席', () => {
    let st = nego.startNegotiation(plea);
    st = { ...st, rounds: 0 };
    expect(nego.done(st)).toBe(false);
    expect(nego.canAct(st)).toBe(false);
    expect(nego.advise(plea, st, true).outcome).toBe('deal');
    expect(nego.advise(plea, { ...st, trust: 5 }, false).outcome).toBe('walk');
  });
});
