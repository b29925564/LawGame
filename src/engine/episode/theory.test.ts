import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { shiftAll } from '../jury';
import * as closing from './closing';
import type { ClosingScene, DeskScene, OpeningScene, TheoryScene, TrialScene } from './schema';
import * as theory from './theory';
import * as trial from './trial';
import { validateEpisode } from './validate';

const scene = <T>(id: string) => episodes.ep1.scenes.find((s) => s.id === id) as T;
const ts = scene<TheoryScene>('theory');
const os = scene<OpeningScene>('opening');
const court = scene<TrialScene>('court-rachel');
const close = scene<ClosingScene>('closing');
const args = scene<DeskScene>('investigate').questions.map((q) => q.argument);
const rules = { jurors: court.jurors, threshold: court.threshold };
const rachel = ts.theories.find((t) => t.id === 'rachel')!;
const doubt = ts.theories.find((t) => t.id === 'doubt')!;

describe('案件理論', () => {
  it('論點湊齊才選得了，選了就不能換', () => {
    let st = theory.startTheory();
    expect(theory.choose(ts, st, 'rachel', ['arg-a', 'arg-b'])).toBe(st);
    st = theory.choose(ts, st, 'doubt', ['arg-a', 'arg-b']);
    expect(st.chosen).toBe('doubt');
    expect(theory.choose(ts, st, 'rachel', rachel.needs)).toBe(st);
  });

  it('只有一個理論都選不了的時候才能不帶理論開庭', () => {
    const st = theory.startTheory();
    expect(theory.skip(ts, st, ['arg-a', 'arg-b'])).toBe(st);
    expect(theory.done(theory.skip(ts, st, []))).toBe(true);
  });

  it('開場最多許三個承諾，只能從選定理論裡挑', () => {
    let st = theory.startOpening();
    st = theory.togglePromise(os, rachel, st, 'doubt-called');
    expect(st.promises).toEqual([]);
    for (const p of rachel.promises) st = theory.togglePromise(os, rachel, st, p.id);
    expect(st.promises).toHaveLength(Math.min(os.picks, rachel.promises.length));
    st = theory.togglePromise(os, rachel, st, 'rachel-time');
    expect(st.promises).not.toContain('rachel-time');
  });

  it('每個承諾都綁一個庭上彈劾得了的論點（驗證器）', () => {
    expect(validateEpisode(episodes.ep1)).toEqual([]);
    const bad = structuredClone(episodes.ep1);
    const t = (bad.scenes.find((s) => s.id === 'theory') as TheoryScene).theories[0];
    t.promises[0].argument = 'arg-watch';
    expect(validateEpisode(bad).join('\n')).toContain(doubt.promises[0].id);
  });
});

describe('承諾兌現與反噬', () => {
  const arg = (id: string) => args.find((a) => a.id === id)!;
  const cross = (promise?: { id: string; kept: number }) => {
    let st = trial.startTrial(court, ['rachel-2250', 'rachel-meeting']);
    for (let i = 0; i < court.witness.direct.length; i++) {
      st = trial.nextQuestion(court, st);
      st = trial.letPass(court, st);
    }
    st = trial.toCross(court, st);
    const c = court.witness.claims.find((x) => x.argument === 'arg-b')!;
    if (st.claims[c.id].lock === 'none') st = trial.lock(court, st, c.id, 'strong');
    st = trial.setup(court, st, c.id);
    const a = arg('arg-b');
    return trial.confront(court, st, c.id, a.strength, a.tags, { id: a.id, promise });
  };

  it('彈劾成功並出示承諾的論點：全體再往辯方移', () => {
    const plain = cross();
    const kept = cross({ id: 'rachel-time', kept: os.kept });
    expect(kept.kept).toEqual(['rachel-time']);
    for (const j of court.jurors) expect(kept.jury[j.id]).toBeLessThanOrEqual(plain.jury[j.id]);
    expect(Object.values(kept.jury).reduce((a, b) => a + b, 0)).toBeLessThan(
      Object.values(plain.jury).reduce((a, b) => a + b, 0),
    );
  });

  it('同一個承諾只兌現一次', () => {
    const once = cross({ id: 'rachel-time', kept: os.kept });
    expect(once.kept).toHaveLength(1);
  });

  it('沒兌現的承諾，結辯前全體往有罪方向', () => {
    const jury = Object.fromEntries(court.jurors.map((j) => [j.id, 50]));
    const broken = shiftAll(rules, jury, os.broken * 2).jury;
    const cs = closing.startClosing(broken, ['a', 'b']);
    expect(cs.broken).toHaveLength(2);
    expect(Object.values(cs.jury).every((v) => v === 50 + os.broken * 2)).toBe(true);
    expect(close.picks).toBeGreaterThan(0);
  });
});
