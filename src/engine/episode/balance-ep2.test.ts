import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import * as closing from './closing';
import * as defense from './defense';
import { ADVERSE } from './discovery';
import type { ClosingScene, DefenseScene, DeskScene, TrialScene } from './schema';
import * as trial from './trial';

const ep = episodes.ep2;
const scene = <T>(id: string) => ep.scenes.find((s) => s.id === id) as T;
const args = ep.scenes
  .filter((s): s is DeskScene => s.type === 'desk')
  .flatMap((d) => d.questions.map((q) => q.argument));
const witness = scene<DefenseScene>('defense-trevor');
const close = scene<ClosingScene>('closing');

interface Route {
  daubert?: boolean;
  object?: boolean;
  confront?: boolean;
  coach?: boolean;
  /** 問了被教過的那一題（「一直都是這樣嗎」），反詰問就會翻出變更單、問出是誰教的。 */
  always?: boolean;
  /** 開示時硬藏了幾項（不利推定）。 */
  concealed?: number;
}

/** 第五幕整段：瑪莉索 → 費雪或唐醫師 → 崔佛 → 結辯（論點 A、B）。 */
function verdict(r: Route) {
  const shift = (r.concealed ?? 0) * ADVERSE;
  const court = (id: string): TrialScene => {
    const t = scene<TrialScene>(id);
    return { ...t, jurors: t.jurors.map((j) => ({ ...j, start: j.start + shift })) };
  };
  const days = ['court-marisol', r.daubert ? 'court-doctor' : 'court-fisher'].map(court);
  let st: trial.TrialState | undefined;
  for (const t of days) {
    st = trial.startTrial(t, [], st);
    for (let i = 0; i < t.witness.direct.length; i++) {
      st = trial.nextQuestion(t, st);
      const q = t.witness.direct[st.i];
      st =
        r.object && q.objection
          ? trial.object(t, st, q.objection as trial.Objection)
          : trial.letPass(t, st);
    }
    st = trial.toCross(t, st);
    if (r.confront)
      for (const c of t.witness.claims) {
        const a = args.find((x) => x.id === c.argument)!;
        st = trial.lock(t, st, c.id, 'strong');
        st = trial.setup(t, st, c.id);
        st = trial.confront(t, st, c.id, a.strength, a.tags, { id: a.id });
      }
  }
  const last = days[1];
  const rules = {
    jurors: last.jurors,
    threshold: last.threshold,
    burden: last.burden,
    quorum: last.quorum,
  };
  let d = defense.prepare(
    witness,
    defense.startDefense(st!.jury),
    r.coach ? 'trevor-coach' : 'trevor-honest',
  );
  for (const q of witness.questions)
    if (q.id !== 'tq-always' || r.always) d = defense.ask(witness, d, rules, q.id, ['app-log']);
  d = defense.finish(witness, d, rules);
  const picks = ['arg-a', 'arg-b'];
  let cs = closing.startClosing(d.jury);
  for (const p of picks) cs = closing.togglePick(close, cs, p);
  cs = closing.setTone(close, cs, 't-logic');
  return closing.deliver(
    close,
    cs,
    rules,
    args.filter((a) => picks.includes(a.id)),
  ).verdict;
}

const best = { object: true, confront: true };

/** 民事是優勢證據：打得好可以贏，但被抓到輔導證人、硬藏文件，就撐不住。 */
describe('第 2 集的庭審平衡', () => {
  it('異議全對、三場都對質、崔佛老實作證：無責', () => {
    expect(verdict(best)).toBe('無責');
    expect(verdict({ ...best, daubert: true })).toBe('無責');
  });

  it('同樣打得好，但輔導過的崔佛在反詰問露餡：有責', () => {
    expect(verdict({ ...best, coach: true, always: true })).toBe('有責');
  });

  it('輔導了但沒問到教過的那一題，沒露餡：仍然無責（這就是誘惑）', () => {
    expect(verdict({ ...best, coach: true })).toBe('無責');
  });

  it('只異議不對質，或什麼都不做：有責', () => {
    expect(verdict({ object: true })).toBe('有責');
    expect(verdict({})).toBe('有責');
  });

  it('只對質不異議：維加太太多了兩項主張可以對質，勉強能贏；只異議不行', () => {
    expect(verdict({ confront: true })).toBe('無責');
  });

  it('硬藏一項被揭穿（不利推定）又輔導露餡：有責', () => {
    expect(verdict({ ...best, concealed: 1, coach: true, always: true })).toBe('有責');
  });
});
