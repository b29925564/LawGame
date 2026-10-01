import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { endingLines, matches, type BranchContext } from './branch';
import type { ClosingScene, DialogueScene, Episode, TheoryScene } from './schema';
import { validateEpisode } from './validate';
import {
  branchContext,
  closingArgs,
  deskSceneOf,
  optionOpen,
  presentedArgs,
  sceneChoices,
  useEpisode,
} from '../game';

const ctx = (o: Partial<BranchContext> = {}): BranchContext => ({
  verdict: '無罪',
  outcome: null,
  deal: null,
  theory: 'doubt',
  flags: [],
  ethics: [],
  cards: [],
  presented: [],
  ...o,
});
const closing = () =>
  structuredClone(episodes.ep1.scenes.find((s) => s.type === 'closing') as ClosingScene);
const say = (text: string) => [{ who: '艾莉絲', text, mood: '平' as const, thought: false }];

describe('分支條件', () => {
  it('每一項都要成立，沒寫的不限制', () => {
    expect(matches(undefined, ctx())).toBe(true);
    expect(matches({ verdict: ['無罪'], theory: ['doubt'] }, ctx())).toBe(true);
    expect(matches({ theory: ['sophie'] }, ctx())).toBe(false);
    expect(matches({ flags: ['a', 'b'] }, ctx({ flags: ['a'] }))).toBe(false);
    expect(matches({ notFlags: ['a'] }, ctx({ flags: ['a'] }))).toBe(false);
    expect(matches({ ethics: ['coach', 'lie'] }, ctx({ ethics: ['lie'] }))).toBe(true);
    expect(matches({ verdict: ['有罪'] }, ctx({ verdict: null }))).toBe(false);
  });

  it('第一個符合的結局取代判決預設段落', () => {
    const s = closing();
    s.endings = [
      { id: 'scapegoat', when: { verdict: ['無罪'], theory: ['sophie'] }, lines: say('代罪') },
      { id: 'any-win', when: { verdict: ['無罪'] }, lines: say('贏了') },
    ];
    expect(endingLines(s, ctx({ theory: 'sophie' }))[0].text).toBe('代罪');
    expect(endingLines(s, ctx())[0].text).toBe('贏了');
    expect(endingLines(s, ctx({ verdict: '有罪' }))).toEqual(s.verdicts['有罪']);
    expect(endingLines(s, ctx({ verdict: null }))).toEqual([]);
  });

  it('驗證：理論要存在、結局 id 不重複、判決條件只能在結辯之後', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const s = ep.scenes.find((x) => x.type === 'closing') as ClosingScene;
    s.endings = [
      { id: 'x', when: { theory: ['nope'] }, lines: say('a') },
      { id: 'x', when: {}, lines: say('b') },
    ];
    const first = ep.scenes[0];
    if (
      'when' in first ||
      first.type === 'card' ||
      first.type === 'phone' ||
      first.type === 'dialogue'
    )
      (first as { when?: object }).when = { verdict: ['無罪'] };
    const errs = validateEpisode(ep).join('\n');
    expect(errs).toContain('不存在的理論：nope');
    expect(errs).toContain('結局 id 重複：x');
    expect(errs).toContain('在結辯之前');
  });
});

describe('尾聲跳場', () => {
  it('條件不符的場景整場跳過，符合的照演', () => {
    const scenes = episodes.ep1.scenes;
    const at = scenes.findIndex(
      (s, i) =>
        s.type === 'card' && ['card', 'dialogue', 'phone'].includes(scenes[i + 1]?.type ?? ''),
    );
    expect(at).toBeGreaterThanOrEqual(0);
    const next = scenes[at + 1] as { when?: object };
    const base = { episode: 'ep1', step: 0, choices: {}, cards: [], scenes: {}, ethics: [] };
    try {
      next.when = { flags: ['secret'] };
      useEpisode.setState({ progress: { ...base, scene: at, flags: [] } });
      useEpisode.getState().advance();
      expect(useEpisode.getState().progress.scene).toBe(at + 2);
      useEpisode.setState({ progress: { ...base, scene: at, flags: ['secret'] } });
      useEpisode.getState().advance();
      expect(useEpisode.getState().progress.scene).toBe(at + 1);
    } finally {
      delete next.when;
    }
  });
});

describe('結辯論點', () => {
  it('只用於聲請的程序論點不會出現在結辯選單', () => {
    const qs = deskSceneOf({
      episode: 'ep1',
      scene: 0,
      step: 0,
      choices: {},
      cards: [],
      scenes: {},
    })!.questions;
    const [a, b] = qs.filter((q) => !q.argument.motionOnly);
    const p = {
      episode: 'ep1',
      scene: 0,
      step: 0,
      choices: {},
      cards: [a.argument.id, b.argument.id],
      scenes: {},
    };
    const was = a.argument.motionOnly;
    try {
      a.argument.motionOnly = true;
      expect(closingArgs(p).map((x) => x.id)).toEqual([b.argument.id]);
    } finally {
      a.argument.motionOnly = was;
    }
  });
});

describe('潔德線：持有論點的分支與明知故犯', () => {
  it('cards 條件：全部都在手上才符合', () => {
    expect(matches({ cards: ['arg-i'] }, ctx({ cards: ['arg-i', 'arg-a'] }))).toBe(true);
    expect(matches({ cards: ['arg-i', 'arg-b'] }, ctx({ cards: ['arg-i'] }))).toBe(false);
  });

  it('手上已有推翻它的論點仍選這個理論，記進倫理帳本', () => {
    const scenes = episodes.ep1.scenes;
    const at = scenes.findIndex((s) => s.type === 'theory');
    const ts = scenes[at] as TheoryScene;
    const sophie = ts.theories.find((t) => t.id === 'sophie')!;
    const base = {
      episode: 'ep1',
      scene: at,
      step: 0,
      choices: {},
      scenes: {},
      flags: [],
      ethics: [],
    };
    try {
      sophie.ethicsIf = { has: ['arg-a'], ethics: ['knowing', 'knowing'] };
      useEpisode.setState({ progress: { ...base, cards: [...sophie.needs, 'arg-a'] } });
      useEpisode.getState().chooseTheory('sophie');
      expect(useEpisode.getState().progress.ethics).toEqual(['knowing', 'knowing']);
      useEpisode.setState({ progress: { ...base, cards: [...sophie.needs] } });
      useEpisode.getState().chooseTheory('sophie');
      expect(useEpisode.getState().progress.ethics).toEqual([]);
    } finally {
      delete sophie.ethicsIf;
    }
  });

  it('驗證：引用不存在的卡片會被擋', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const ts = ep.scenes.find((s) => s.type === 'theory') as TheoryScene;
    ts.theories[0].ethicsIf = { has: ['nope-card'], ethics: ['x'] };
    const s = ep.scenes.find((x) => x.type === 'closing') as ClosingScene;
    s.endings = [{ id: 'e', when: { cards: ['ghost'] }, lines: say('a') }];
    const errs = validateEpisode(ep).join('\n');
    expect(errs).toContain('不存在的卡片：nope-card');
    expect(errs).toContain('不存在的卡片：ghost');
  });
});

describe('提前收場：協商成交（E4）與撤回起訴（E1）', () => {
  const scenes = episodes.ep1.scenes;
  const nego = scenes.findIndex((s) => s.type === 'negotiation');
  const court = scenes.findIndex((s) => s.id === 'court-rachel');
  const base = { episode: 'ep1', step: 0, choices: {}, cards: [], flags: [], ethics: [] };
  const at = (id: string) => scenes.findIndex((s) => s.id === id);
  /** 暫時拿掉劇本裡 E1／E4 的尾聲，模擬還沒寫的情況。 */
  const withoutEarlyEnd = (run: () => void) => {
    const marked = scenes.filter(
      (s) => 'epilogue' in s && s.epilogue && 'when' in s && s.when?.outcome,
    ) as { epilogue: boolean }[];
    try {
      for (const s of marked) s.epilogue = false;
      run();
    } finally {
      for (const s of marked) s.epilogue = true;
    }
  };

  it('協商成交後跳過庭審，直接到這個條件的尾聲', () => {
    const offer = (scenes[nego] as { offers: { id: string }[] }).offers[0].id;
    const st = { outcome: 'deal', deal: 'x', dealId: offer };
    const p = { ...base, scene: nego, scenes: { [scenes[nego].id]: st } };
    useEpisode.setState({ progress: p });
    useEpisode.getState().advance();
    expect(useEpisode.getState().progress.scene).toBe(at(`epilogue-deal-${offer.slice(2)}`));
    expect(matches({ outcome: ['deal'], deal: [offer] }, branchContext(p))).toBe(true);
    expect(matches({ outcome: ['dismissed'] }, branchContext(p))).toBe(false);
  });

  it('證人援引緘默權後撤回起訴：跳過辯方證人與結辯', () => {
    const p = { ...base, scene: court, scenes: { 'court-rachel': { pleaded: true } } };
    useEpisode.setState({ progress: p });
    useEpisode.getState().advance();
    expect(useEpisode.getState().progress.scene).toBe(at('epilogue-dismissed'));
    expect(branchContext(p).outcome).toBe('dismissed');
  });

  it('劇本還沒寫對應的尾聲：照常走到判決', () =>
    withoutEarlyEnd(() => {
      const p = { ...base, scene: court, scenes: { 'court-rachel': { pleaded: true } } };
      useEpisode.setState({ progress: p });
      useEpisode.getState().advance();
      expect(useEpisode.getState().progress.scene).toBe(court + 1);
    }));

  it('沒有提前收場就照常往下走', () => {
    useEpisode.setState({ progress: { ...base, scene: court, scenes: {} } });
    useEpisode.getState().advance();
    expect(useEpisode.getState().progress.scene).toBe(court + 1);
  });

  it('驗證：引用不存在的協商條件會被擋', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const s = ep.scenes.find((x) => x.type === 'closing') as ClosingScene;
    s.endings = [{ id: 'e', when: { deal: ['no-offer'] }, lines: say('a') }];
    expect(validateEpisode(ep).join('\n')).toContain('不存在的協商條件：no-offer');
  });
});

describe('對話選項的條件', () => {
  it('條件不符的選項不出現，也選不了', () => {
    const scenes = episodes.ep1.scenes;
    const at = scenes.findIndex(
      (s) => s.type === 'dialogue' && s.steps.some((x) => x.do === 'choose'),
    );
    const s = scenes[at] as DialogueScene;
    const step = s.steps.findIndex((x) => x.do === 'choose');
    const opt = (s.steps[step] as Extract<DialogueScene['steps'][number], { do: 'choose' }>)
      .options[0];
    const base = {
      episode: 'ep1',
      scene: at,
      step,
      choices: {},
      scenes: {},
      flags: [],
      ethics: [],
    };
    try {
      opt.when = { cards: ['parking-log'] };
      expect(optionOpen({ ...base, cards: [] }, opt)).toBe(false);
      useEpisode.setState({ progress: { ...base, cards: [] } });
      useEpisode.getState().choose(0);
      expect(sceneChoices(useEpisode.getState().progress)[step]).toBeUndefined();
      useEpisode.setState({ progress: { ...base, cards: ['parking-log'] } });
      useEpisode.getState().choose(0);
      expect(sceneChoices(useEpisode.getState().progress)[step]).toBe(0);
    } finally {
      delete opt.when;
    }
  });

  it('驗證：選項全部有條件會被擋', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const s = ep.scenes.find(
      (x) => x.type === 'dialogue' && x.steps.some((y) => y.do === 'choose'),
    ) as DialogueScene;
    const step = s.steps.find((x) => x.do === 'choose')!;
    if (step.do === 'choose') for (const o of step.options) o.when = { flags: ['x'] };
    expect(validateEpisode(ep).join('\n')).toContain('選項全部有條件');
  });
});

describe('重審交代與可選的辯方證人', () => {
  const base = { episode: 'ep1', scene: 0, step: 0, choices: {}, cards: [], ethics: [] };

  it('presented 條件：庭上出示過或結辯用過的論點全部都要有', () => {
    expect(matches({ presented: ['arg-a', 'arg-b'] }, ctx({ presented: ['arg-a', 'arg-b'] }))).toBe(
      true,
    );
    expect(matches({ presented: ['arg-a', 'arg-b'] }, ctx({ presented: ['arg-a'] }))).toBe(false);
  });

  it('對質過的說法、逼出緘默權的論點、結辯講過的論點都算出示過', () => {
    const scenes = episodes.ep1.scenes;
    const court = scenes.find((s) => s.id === 'court-rachel')!;
    if (court.type !== 'trial') throw new Error('court-rachel');
    const close = scenes.find((s) => s.type === 'closing')!;
    const claim = court.witness.claims[0];
    const p = {
      ...base,
      scenes: {
        [court.id]: {
          claims: { [claim.id]: { lock: 'strong', setup: true, result: 'softened' } },
          stricken: true,
        },
        [close.id]: { picked: ['arg-h'], spoken: {} },
      },
    } as never;
    expect(presentedArgs(p).sort()).toEqual(
      [claim.argument, court.fifth!.argument, 'arg-h'].sort(),
    );
    // 結辯還沒講出口，挑了不算。
    const unsaid = {
      ...base,
      scenes: { [close.id]: { picked: ['arg-h'], spoken: null } },
    } as never;
    expect(presentedArgs(unsaid)).toEqual([]);
  });

  it('辯方證人場景可以帶 when，不符就跳過', () => {
    // 伊森作證要先在第三幕答應他（ethan-testifies）。
    const scenes = episodes.ep1.scenes;
    const at = scenes.findIndex((s) => s.id === 'defense-ethan');
    const p = { ...base, scenes: {}, scene: at - 1, step: 0 };
    useEpisode.setState({ progress: { ...p, flags: [] } });
    useEpisode.getState().advance();
    expect(useEpisode.getState().progress.scene).toBe(at + 1);
    useEpisode.setState({ progress: { ...p, flags: ['ethan-testifies'] } });
    useEpisode.getState().advance();
    expect(useEpisode.getState().progress.scene).toBe(at);
  });
});
