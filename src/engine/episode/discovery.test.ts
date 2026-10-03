import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { allFlags, branchContext, courtScene, useEpisode } from '../game';
import { canWrap, startDesk, type DeskState } from './desk';
import * as discovery from './discovery';
import type { DeskScene, Episode, TrialScene } from './schema';
import { validateEpisode } from './validate';

const say = (text: string) => [{ who: '法官', text, mood: '平' as const, thought: false }];
const withRequests = (s: DeskScene): DeskScene => {
  const [a, b, c] = s.cards.map((x) => x.id);
  return {
    ...s,
    discovery: [
      {
        id: 'contract',
        text: '承攬合約',
        cards: [a],
        unlock: [],
        privilege: 'none',
        overbroad: false,
        exposes: [],
        lines: {},
      },
      {
        id: 'opinion',
        text: '法務意見',
        cards: [b],
        unlock: [],
        privilege: 'valid',
        overbroad: false,
        exposes: [],
        lines: {},
      },
      {
        id: 'change',
        text: '變更單',
        cards: [c],
        unlock: [],
        privilege: 'weak',
        overbroad: true,
        exposes: [],
        lines: {},
      },
      {
        id: 'chat',
        text: '營運群組',
        cards: [a],
        unlock: [],
        privilege: 'none',
        overbroad: false,
        exposes: [],
        lines: { concealed: say('……好。') },
      },
    ],
  };
};
const desk = () =>
  withRequests(structuredClone(episodes.ep1.scenes.find((s) => s.type === 'desk') as DeskScene));

describe('開示', () => {
  it('三種回應依請求的性質得出結果', () => {
    const [contract, opinion, change, chat] = desk().discovery;
    expect(discovery.resultOf(contract, 'produce')).toBe('produced');
    expect(discovery.resultOf(opinion, 'privilege')).toBe('withheld');
    expect(discovery.resultOf(change, 'privilege')).toBe('strained');
    expect(discovery.resultOf(chat, 'privilege')).toBe('concealed');
    expect(discovery.resultOf(change, 'overbroad')).toBe('narrowed');
    expect(discovery.resultOf(chat, 'overbroad')).toBe('compelled');
  });

  it('回應就定案，留下旗標與台詞，交出的文件算給對方', () => {
    const s = desk();
    let st = startDesk(s);
    st = discovery.respond(s, st, 'chat', 'privilege');
    expect(st.flags).toContain('discovery:chat:concealed');
    expect(st.report).toEqual(say('……好。'));
    expect(discovery.respond(s, st, 'chat', 'produce')).toBe(st);
    st = discovery.respond(s, st, 'contract', 'produce');
    st = discovery.respond(s, st, 'change', 'overbroad');
    expect(discovery.handedOver(s, st)).toEqual([s.discovery[0].cards[0]]);
    expect(discovery.patienceCost(st)).toBe(2);
  });

  it('全部回應完才能結束調查', () => {
    const s = desk();
    let st: DeskState = { ...startDesk(s), confirmed: [s.goal] };
    expect(canWrap(s, st)).toBe(false);
    for (const r of s.discovery) st = discovery.respond(s, st, r.id, 'produce');
    expect(canWrap(s, st)).toBe(true);
  });

  it('硬藏記進倫理帳本，旗標分支看得到，開庭時法官少耐心', () => {
    const ep = episodes.ep1 as Episode;
    const at = ep.scenes.findIndex((s) => s.type === 'desk');
    const orig = ep.scenes[at];
    ep.scenes[at] = withRequests(orig as DeskScene);
    try {
      const base = { episode: 'ep1', step: 0, choices: {}, cards: [], scenes: {}, flags: [] };
      useEpisode.setState({ progress: { ...base, scene: at, ethics: [] } });
      useEpisode.getState().respondDiscovery('chat', 'privilege');
      const p = useEpisode.getState().progress;
      expect(p.ethics).toEqual([discovery.CONCEALED]);
      expect(allFlags(p)).toContain('discovery:chat:concealed');
      expect(branchContext(p).flags).toContain('discovery:chat:concealed');
      const trial = ep.scenes.find((s) => s.type === 'trial') as TrialScene;
      expect(courtScene(p, trial).patience).toBe(Math.max(1, trial.patience - 2));
      // 硬藏被揭穿：不利推定，陪審團一開始就更偏向對方。
      courtScene(p, trial).jurors.forEach((j, i) =>
        expect(j.start).toBe(Math.min(100, trial.jurors[i].start + discovery.ADVERSE)),
      );
    } finally {
      ep.scenes[at] = orig;
    }
  });

  it('unlock 的東西到手前，請求看不到、不能回應，也不擋結束調查', () => {
    const s = desk();
    const key = s.cards.find((c) => !c.held)!.id;
    s.discovery[1].unlock = [key];
    let st: DeskState = { ...startDesk(s), confirmed: [s.goal] };
    expect(discovery.openRequests(s, st).map((r) => r.id)).not.toContain('opinion');
    expect(discovery.respond(s, st, 'opinion', 'privilege')).toBe(st);
    for (const r of discovery.openRequests(s, st)) st = discovery.respond(s, st, r.id, 'produce');
    expect(canWrap(s, st)).toBe(true);
    // 前面幕帶進來的也算到手，出現之後就要回應。
    expect(discovery.unanswered(s, st, [key])).toBe(1);
    expect(canWrap(s, st, [key])).toBe(false);
    st = { ...st, marked: [key] };
    expect(discovery.respond(s, st, 'opinion', 'privilege').discovery?.opinion).toBe('withheld');
  });

  it('驗證：出現條件要拿得到', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const at = ep.scenes.findIndex((s) => s.type === 'desk');
    const s = withRequests(ep.scenes[at] as DeskScene);
    s.discovery[0].unlock = ['no-such-card'];
    ep.scenes[at] = s;
    expect(validateEpisode(ep)).toContain('開示請求 contract 的出現條件 no-such-card 玩家拿不到');
  });

  it('驗證：請求 id 不重複，文件要存在', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const at = ep.scenes.findIndex((s) => s.type === 'desk');
    const s = withRequests(ep.scenes[at] as DeskScene);
    s.discovery[1].id = 'contract';
    s.discovery[2].cards = ['no-such-card'];
    ep.scenes[at] = s;
    const errors = validateEpisode(ep);
    expect(errors).toContain(`桌面 ${s.id} 的開示請求 id 重複：contract`);
    expect(errors).toContain('開示請求 change 涵蓋了不存在的卡片 no-such-card');
  });
});
