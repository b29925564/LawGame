import { beforeEach, describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import {
  branchContext,
  carryOver,
  closingArgs,
  courtScene,
  endingOf,
  episodeOf,
  juryAfterTrial,
  negoState,
  optionOpen,
  sceneOf,
  useEpisode,
} from '../game';
import { verdict } from '../jury';
import type { Progress } from '../save';
import type * as closing from './closing';
import * as nego from './negotiation';
import type { ClosingScene, NegotiationScene, TrialScene, VoirDireScene } from './schema';
import { startTrial } from './trial';
import { startVoirDire } from './voirdire';

/**
 * 沒人實際玩到過的判決：分裂票數、陪審團僵局，以及第 2 集調解攤牌後條件降一檔。
 * 刑事（第 1 集）要 12 人全體一致，8 : 4 這種分裂票就是僵局；
 * 民事（第 2 集）6 人中 5 人就成立，5 : 1 是分裂但有效的判決，4 : 2、3 : 3 才是僵局。
 */

type Ep = 'ep1' | 'ep2';
const scenesOf = (ep: Ep) => episodes[ep].scenes;
const indexOf = (ep: Ep, id: string) => scenesOf(ep).findIndex((s) => s.id === id);

/**
 * 直接把進度放到結辯：遴選坐滿候選人名單前 seats 位，最後一場庭審留下指定的心證。
 * value(i) 是第 i 位入席陪審員的心證（越高越偏舉證方）。
 */
function atClosing(
  ep: Ep,
  value: (i: number) => number,
  extra: { cards?: string[]; flags?: string[]; theory?: string } = {},
): Progress {
  const scenes = scenesOf(ep);
  const vd = scenes.find((s): s is VoirDireScene => s.type === 'voirdire')!;
  const seated = vd.candidates.slice(0, vd.seats).map((c) => c.id);
  const ts = [...scenes].reverse().find((s): s is TrialScene => s.type === 'trial')!;
  const base: Progress = {
    episode: ep,
    scene: indexOf(ep, 'closing'),
    step: 0,
    choices: {},
    cards: extra.cards ?? [],
    flags: extra.flags ?? [],
    ethics: [],
    scenes: {
      [vd.id]: { ...startVoirDire(vd), seated },
      ...(extra.theory ? { theory: { chosen: extra.theory, skipped: false } } : {}),
    },
  };
  const court = courtScene(base, ts);
  const st = startTrial(court);
  const jury = Object.fromEntries(court.jurors.map((j, i) => [j.id, value(i)]));
  return { ...base, scenes: { ...base.scenes, [ts.id]: { ...st, jury, opening: jury } } };
}

/** 照玩家的操作結辯：挑滿手上的論點、選基調、講完。 */
function deliverAt(p: Progress, tone = 't-logic'): Progress {
  useEpisode.setState({ mode: 'play', progress: p });
  const g = useEpisode.getState();
  for (const a of closingArgs(p)) g.pickArg(a.id);
  g.setTone(tone);
  g.deliver();
  return useEpisode.getState().progress;
}

const closingOf = (p: Progress) => {
  const cs = episodeOf(p).scenes.find((s): s is ClosingScene => s.type === 'closing')!;
  return { cs, st: p.scenes[cs.id] as closing.ClosingState };
};

/** 票數：過門檻（偏舉證方）的人數、沒過的人數。 */
function tally(p: Progress, jury: Record<string, number>) {
  const rules = juryAfterTrial(p)!.rules;
  const yes = rules.jurors.filter((j) => jury[j.id] >= rules.threshold).length;
  return { yes, no: rules.jurors.length - yes, rules };
}

/** 從判決一路按「繼續」演完這一集；遇到選項就選第一個看得到的。回傳演完時的進度。 */
function playToEnd(): Progress {
  for (let guard = 0; guard < 500; guard++) {
    const p = useEpisode.getState().progress;
    const s = sceneOf(p);
    if (!s) return p;
    // 判決頁本身按「繼續」離開；之後只會是尾聲（對話、電話、字卡），任何需要玩的場景都代表卡住了。
    if (s.type === 'closing') expect(closingOf(p).st.verdict).not.toBeNull();
    else expect(['dialogue', 'phone', 'card'], `判決後不該進到 ${s.id}`).toContain(s.type);
    if (s.type === 'dialogue' || s.type === 'phone') {
      const step = s.steps[p.step];
      if (step?.do === 'choose' && p.choices[`${s.id}:${p.step}`] === undefined) {
        const k = step.options.findIndex((o) => optionOpen(p, o as { when?: never }));
        expect(k, `${s.id} 第 ${p.step} 步沒有可選的選項`).toBeGreaterThanOrEqual(0);
        useEpisode.getState().choose(k);
      }
    }
    useEpisode.getState().advance();
    const q = useEpisode.getState().progress;
    expect(q.scene * 1000 + q.step, `${s.id} 按繼續沒有前進`).toBeGreaterThan(
      p.scene * 1000 + p.step,
    );
  }
  throw new Error('演不完：超過 500 步');
}

beforeEach(() => {
  globalThis.localStorage?.clear();
});

describe('第 1 集（刑事，全體一致）：分裂票就是僵局', () => {
  const p0 = atClosing('ep1', (i) => (i < 8 ? 95 : 15), { cards: ['arg-a', 'arg-c', 'arg-d'] });

  it('沒有 quorum：12 人要全體一致', () => {
    const rules = juryAfterTrial(p0)!.rules;
    expect(rules.jurors).toHaveLength(12);
    expect(rules.quorum).toBeUndefined();
    expect(rules.burden ?? 'criminal').toBe('criminal');
    // 11 : 1 也不是判決。
    const almost = Object.fromEntries(rules.jurors.map((j, i) => [j.id, i < 11 ? 90 : 10]));
    expect(verdict(rules, almost)).toBe('陪審團僵局');
    const none = Object.fromEntries(rules.jurors.map((j, i) => [j.id, i < 1 ? 90 : 10]));
    expect(verdict(rules, none)).toBe('陪審團僵局');
  });

  it('8 : 4 評議三輪仍是 8 : 4，判陪審團僵局', () => {
    const p = deliverAt(p0);
    const { st } = closingOf(p);
    expect(st.verdict).toBe('陪審團僵局');
    expect(st.rounds).toHaveLength(3);
    // 每一輪的表決訊息與心證對得起來，三輪都是 8 : 4，沒有人換邊。
    for (const r of st.rounds) {
      const { yes, no } = tally(p, r.jury);
      expect([yes, no]).toEqual([8, 4]);
      expect(r.moves).toContain(`表決：${yes} 票有罪，${no} 票無罪。`);
      expect(r.moves.some((m) => m.includes('改變了立場'))).toBe(false);
    }
    expect(st.rounds[2].jury).toEqual(st.jury);
    // 刑事不會有判決表金額。
    expect(st.award ?? null).toBeNull();
  });

  it('僵局的結局：預設段落帶票數；論點 A、B 都講過則改成檢方放棄重審', () => {
    const p = deliverAt(p0);
    const { cs } = closingOf(p);
    const lines = endingOf(p, cs);
    expect(lines).toEqual(cs.verdicts['陪審團僵局']);
    expect(lines.some((l) => l.mark?.kind === 'tally')).toBe(true);

    const pAB = deliverAt(
      atClosing('ep1', (i) => (i < 8 ? 95 : 15), { cards: ['arg-a', 'arg-b', 'arg-d'] }),
    );
    expect(closingOf(pAB).st.verdict).toBe('陪審團僵局');
    expect(endingOf(pAB, cs)).toEqual(cs.endings.find((e) => e.id === 'retrial-dropped')!.lines);
  });

  it('僵局之後演得完，接續第 2 集時帶著僵局旗標', () => {
    deliverAt(p0);
    const end = playToEnd();
    expect(sceneOf(end)).toBeNull();
    expect(branchContext(end).verdict).toBe('陪審團僵局');
    useEpisode.getState().nextEpisode();
    const next = useEpisode.getState().progress;
    expect(next).toMatchObject({ episode: 'ep2', scene: 0, scenes: {} });
    expect(next.flags).toContain('ep1:verdict:陪審團僵局');
    expect(carryOver(end, 'ep2').flags).toContain('ep1:verdict:陪審團僵局');
  });
});

describe('第 2 集（民事，6 人中 5 人）：5 : 1 是判決，4 : 2、3 : 3 是僵局', () => {
  it('quorum 是 5，入席 6 人', () => {
    const rules = juryAfterTrial(atClosing('ep2', () => 50))!.rules;
    expect(rules.jurors).toHaveLength(6);
    expect(rules.quorum).toBe(5);
    expect(rules.burden).toBe('civil');
    expect(rules.threshold).toBe(50);
  });

  it('5 : 1 有責：判決表扣過失比例，懲罰性賠償要 5 票', () => {
    const p = deliverAt(
      atClosing('ep2', (i) => (i === 4 ? 10 : 95), {
        cards: ['arg-a', 'arg-b'],
        theory: 'own-choice',
        flags: ['discovery:rq-chat:produced'],
      }),
    );
    const { st, cs } = closingOf(p);
    const { yes, no, rules } = tally(p, st.jury);
    expect([yes, no]).toEqual([5, 1]);
    expect(st.verdict).toBe('有責');
    expect(st.rounds).toHaveLength(3);
    for (const r of st.rounds) {
      const t = tally(p, r.jury);
      expect(r.moves).toContain(`表決：${t.yes} 票有責，${t.no} 票無責。`);
    }
    // 判決表：總額 650 萬，理論的過失 25%，票數浮動 swing × lean。
    const a = st.award!;
    const avg = rules.jurors.reduce((n, j) => n + st.jury[j.id], 0) / rules.jurors.length;
    const lean = Math.max(-1, Math.min(1, (rules.threshold + 20 - avg) / 20));
    const fault = Math.max(0, Math.min(100, Math.round(25 + cs.damages!.swing * lean)));
    expect(a.total).toBe(6_500_000);
    expect(a.base).toBe(25);
    expect(a.fault).toBe(fault);
    expect(a.amount).toBe(Math.round((6_500_000 * (100 - fault)) / 100));
    // 這組票數評議後偏有責很多：過失比例從理論的 25% 往下浮動到 22%。
    expect([a.fault, a.amount]).toEqual([22, 5_070_000]);
    const votes = rules.jurors.filter((j) => st.jury[j.id] >= 65).length;
    expect(a.punitive).toEqual({ found: true, amount: a.amount, votes, need: 5 });
    expect(votes).toBe(5);
    expect(endingOf(p, cs).length).toBeGreaterThan(0);
  });

  it('5 : 1 無責：沒有判決表金額', () => {
    const p = deliverAt(
      atClosing('ep2', (i) => (i === 0 ? 95 : 10), { cards: ['arg-a', 'arg-b'] }),
    );
    const { st, cs } = closingOf(p);
    const { yes, no } = tally(p, st.jury);
    expect([yes, no]).toEqual([1, 5]);
    expect(st.verdict).toBe('無責');
    expect(st.award ?? null).toBeNull();
    expect(endingOf(p, cs)).toEqual(cs.verdicts['無責']);
  });

  it.each([
    ['4 : 2', 4],
    ['3 : 3', 3],
  ])('%s 兩邊都不到 5 票：陪審團僵局，沒有判決表', (_name, k) => {
    const p = deliverAt(atClosing('ep2', (i) => (i < k ? 95 : 10), { cards: ['arg-a', 'arg-b'] }));
    const { st, cs } = closingOf(p);
    const { yes, no } = tally(p, st.jury);
    expect([yes, no]).toEqual([k, 6 - k]);
    expect(st.verdict).toBe('陪審團僵局');
    expect(st.rounds).toHaveLength(3);
    expect(st.award ?? null).toBeNull();
    expect(branchContext(p).punitive).toBe(false);
    const lines = endingOf(p, cs);
    expect(lines).toEqual(cs.verdicts['陪審團僵局']);
    expect(lines.some((l) => l.mark?.kind === 'tally')).toBe(true);
  });

  it.each([
    ['有責 5 : 1', (i: number) => (i === 4 ? 10 : 95)],
    ['無責 5 : 1', (i: number) => (i === 0 ? 95 : 10)],
    ['僵局 4 : 2', (i: number) => (i < 4 ? 95 : 10)],
  ])('%s 之後演得完，結果寫進旗標', (_name, value) => {
    const p = deliverAt(atClosing('ep2', value, { cards: ['arg-a', 'arg-b'] }));
    const v = closingOf(p).st.verdict!;
    const end = playToEnd();
    expect(sceneOf(end)).toBeNull();
    // 第 2 集是最後一集：沒有下一集，但結果照樣寫成旗標。
    useEpisode.getState().nextEpisode();
    expect(useEpisode.getState().progress.episode).toBe('ep2');
    expect(carryOver(end, 'ep1').flags).toContain(`ep2:verdict:${v}`);
  });
});

describe('第 2 集調解：攤牌讓條件降一檔', () => {
  const at = indexOf('ep2', 'mediation');
  const s = scenesOf('ep2')[at] as NegotiationScene;
  const p0: Progress = {
    episode: 'ep2',
    scene: at,
    step: 0,
    choices: {},
    cards: ['arg-a', 'arg-b'],
    flags: [],
    ethics: [],
    scenes: {},
  };

  it('信心 85 開 400 萬；亮論點 A（強度 10）降到 75，條件換成 250 萬那一檔', () => {
    useEpisode.setState({ mode: 'play', progress: p0 });
    const before = negoState(p0, s);
    expect(before.confidence).toBe(85);
    expect(nego.offerOf(s, before).id).toBe('o-full');
    useEpisode.getState().revealArg('arg-a', 10, 'x');
    const p = useEpisode.getState().progress;
    const st = negoState(p, s);
    expect(st.confidence).toBe(75);
    expect(st.rounds).toBe(before.rounds - 1);
    expect(st.exposed).toEqual(['arg-a']);
    const offer = nego.offerOf(s, st);
    expect(offer.id).toBe('o-high');
    const ladder = [...s.offers].sort((a, b) => b.min - a.min).map((o) => o.id);
    expect(ladder.indexOf(offer.id)).toBe(ladder.indexOf('o-full') + 1);
    // 250 萬仍超過 150 萬授權：要先打電話，不能直接成交。
    expect(nego.authorized(s, st, offer)).toBe(false);
    useEpisode.getState().advise(true);
    expect(negoState(useEpisode.getState().progress, s).outcome).toBeNull();
  });

  it('攤牌降檔之後還能談成或離席，都接得到下一場', () => {
    useEpisode.setState({ mode: 'play', progress: p0 });
    const g = useEpisode.getState();
    g.revealArg('arg-a', 10, 'x');
    g.callClient();
    g.callClient();
    let st = negoState(useEpisode.getState().progress, s);
    expect(st.cap).toBe(2_500_000);
    expect(nego.authorized(s, st, nego.offerOf(s, st))).toBe(true);
    useEpisode.getState().advise(true);
    st = negoState(useEpisode.getState().progress, s);
    expect(st).toMatchObject({ outcome: 'deal', dealId: 'o-high' });
    useEpisode.getState().advance();
    // 成交就提前收場：只剩尾聲。
    const after = sceneOf(useEpisode.getState().progress)!;
    expect('epilogue' in after && after.epilogue).toBe(true);
    const end = playToEnd();
    expect(carryOver(end, 'ep1').flags).toEqual(
      expect.arrayContaining(['ep2:outcome:deal', 'ep2:deal:o-high']),
    );

    useEpisode.setState({ mode: 'play', progress: p0 });
    useEpisode.getState().revealArg('arg-a', 10, 'x');
    useEpisode.getState().walkOut();
    useEpisode.getState().advance();
    expect(sceneOf(useEpisode.getState().progress)!.id).toBe(scenesOf('ep2')[at + 1].id);
  });
});
