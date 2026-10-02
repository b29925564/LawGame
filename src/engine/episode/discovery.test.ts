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
        privilege: 'none',
        overbroad: false,
        lines: {},
      },
      {
        id: 'opinion',
        text: '法務意見',
        cards: [b],
        privilege: 'valid',
        overbroad: false,
        lines: {},
      },
      { id: 'change', text: '變更單', cards: [c], privilege: 'weak', overbroad: true, lines: {} },
      {
        id: 'chat',
        text: '營運群組',
        cards: [a],
        privilege: 'none',
        overbroad: false,
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
    } finally {
      ep.scenes[at] = orig;
    }
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
