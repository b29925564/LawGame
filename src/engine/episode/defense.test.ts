import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { useEpisode, sceneOf } from '../game';
import * as defense from './defense';
import { migrate } from '../save';
import type { DefenseScene, DialogueScene, TrialScene } from './schema';
import { validateEpisode } from './validate';

const court = episodes.ep1.scenes.find((s) => s.id === 'court-rachel') as TrialScene;
const rules = { jurors: court.jurors, threshold: court.threshold };
const start = () => defense.startDefense(Object.fromEntries(court.jurors.map((j) => [j.id, 70])));
const total = (j: Record<string, number>) => Object.values(j).reduce((a, b) => a + b, 0);

const brooks: DefenseScene = {
  type: 'defense',
  id: 'defense-brooks',
  act: '第四幕',
  day: '第二天',
  witness: { name: '布魯克斯', role: '法醫' },
  intro: [],
  prep: {
    hours: 2,
    options: [
      {
        id: 'none',
        label: '不準備',
        detail: '',
        multiplier: 0.8,
        rehearsed: 1,
        coached: false,
        ethics: [],
        flags: [],
      },
      {
        id: 'honest',
        label: '正常準備',
        detail: '',
        multiplier: 1,
        rehearsed: 1,
        coached: false,
        ethics: [],
        flags: [],
      },
      {
        id: 'coach',
        label: '告訴他該怎麼說',
        detail: '',
        multiplier: 1,
        rehearsed: 1.5,
        coached: true,
        ethics: ['coached-witness'],
        flags: ['coached'],
      },
    ],
  },
  asks: 2,
  questions: [
    {
      id: 'q-first',
      seq: 0,
      q: '妳怎麼推估死亡時間？',
      a: 'a',
      impact: 10,
      tags: ['權威'],
      rehearsed: false,
    },
    {
      id: 'q-hr',
      seq: 1,
      q: '心率資料可靠嗎？',
      a: 'a',
      impact: 10,
      tags: ['權威'],
      rehearsed: true,
    },
    {
      id: 'q-char',
      seq: 2,
      q: '妳一向守法嗎？',
      a: 'a',
      impact: 4,
      tags: ['情感'],
      rehearsed: false,
      door: { q: '妳十年前的紀錄呢？', a: 'a', penalty: 5 },
    },
  ],
  leak: { q: '有人教過妳嗎？', a: '……我們談過。', penalty: 8 },
  outro: [],
};

describe('辯方證人', () => {
  it('準備方式決定衝擊倍率：沒準備的證人較弱', () => {
    const run = (prep: string) => {
      let st = defense.prepare(brooks, start(), prep);
      st = defense.ask(brooks, st, rules, 'q-first');
      return total(st.jury);
    };
    expect(run('none')).toBeGreaterThan(run('honest'));
  });

  it('倒著問衝擊減半，最多只能問 asks 題', () => {
    let a = defense.prepare(brooks, start(), 'honest');
    a = defense.ask(brooks, a, rules, 'q-hr');
    a = defense.ask(brooks, a, rules, 'q-first');
    let b = defense.prepare(brooks, start(), 'honest');
    b = defense.ask(brooks, b, rules, 'q-first');
    b = defense.ask(brooks, b, rules, 'q-hr');
    expect(total(b.jury)).toBeLessThan(total(a.jury));
    expect(defense.canAsk(brooks, b, 'q-char')).toBe(false);
  });

  it('教過的證人：問了教過的措辭，反詰問被問「有人教你嗎」', () => {
    let st = defense.prepare(brooks, start(), 'coach');
    st = defense.ask(brooks, st, rules, 'q-hr');
    st = defense.finish(brooks, st, rules);
    expect(st.leaked).toBe(true);
    expect(st.log.some((l) => l.text.includes('有人教過妳嗎'))).toBe(true);
  });

  it('教過但沒問教過的措辭：不露餡', () => {
    let st = defense.prepare(brooks, start(), 'coach');
    st = defense.ask(brooks, st, rules, 'q-first');
    expect(defense.finish(brooks, st, rules).leaked).toBe(false);
  });

  it('開門的問題在反詰問被翻出來，往有罪移', () => {
    const base = (ask: string) => {
      let st = defense.prepare(brooks, start(), 'honest');
      st = defense.ask(brooks, st, rules, ask);
      return defense.finish(brooks, st, rules);
    };
    expect(base('q-char').log.some((l) => l.text.includes('十年前'))).toBe(true);
    expect(base('q-first').log.some((l) => l.text.includes('十年前'))).toBe(false);
  });

  it('驗證器：要接在庭審之後，教證人要有被教的問題', () => {
    const ep = structuredClone(episodes.ep1);
    const at = ep.scenes.findIndex((s) => s.id === 'closing');
    ep.scenes.splice(at, 0, structuredClone(brooks));
    expect(validateEpisode(ep)).toEqual([]);
    const early = structuredClone(episodes.ep1);
    early.scenes.splice(1, 0, structuredClone(brooks));
    expect(validateEpisode(early).join('\n')).toContain('前面沒有庭審');
    const dull = structuredClone(ep);
    (dull.scenes[at] as DefenseScene).questions.forEach((q) => (q.rehearsed = false));
    expect(validateEpisode(dull).join('\n')).toContain('rehearsed');
  });
});

describe('對話旗標與倫理紀錄', () => {
  it('選項記下旗標與倫理紀錄，存在進度裡', () => {
    const e = episodes.ep1;
    const i = e.scenes.findIndex(
      (s) => s.type === 'dialogue' && s.steps.some((x) => x.do === 'choose'),
    );
    const scene = e.scenes[i] as DialogueScene;
    const step = scene.steps.findIndex((x) => x.do === 'choose');
    const c = scene.steps[step];
    if (c.do !== 'choose') throw new Error('no choose');
    const before = structuredClone(c.options[0]);
    c.options[0].flags = ['gave-draft-to-hale'];
    c.options[0].ethics = ['leaked-draft'];
    try {
      useEpisode.setState({ progress: { ...useEpisode.getState().progress, scene: i, step } });
      expect(sceneOf(useEpisode.getState().progress)?.id).toBe(scene.id);
      useEpisode.getState().choose(0);
      const p = useEpisode.getState().progress;
      expect(p.flags).toContain('gave-draft-to-hale');
      expect(p.ethics).toEqual(['leaked-draft']);
    } finally {
      c.options[0] = before;
    }
  });

  it('第 4 版存檔補上空的旗標與倫理紀錄', () => {
    const f = migrate({
      version: 4,
      savedAt: 1,
      label: 'x',
      progress: { episode: 'ep1', scene: 0, step: 0, choices: {}, cards: [], scenes: {} },
    });
    expect(f?.progress.flags).toEqual([]);
    expect(f?.progress.ethics).toEqual([]);
  });
});
