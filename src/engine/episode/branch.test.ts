import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { endingLines, matches, type BranchContext } from './branch';
import type { ClosingScene, Episode, TheoryScene } from './schema';
import { validateEpisode } from './validate';
import { closingArgs, deskSceneOf, useEpisode } from '../game';

const ctx = (o: Partial<BranchContext> = {}): BranchContext => ({
  verdict: '無罪',
  theory: 'doubt',
  flags: [],
  ethics: [],
  cards: [],
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
