import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { activeEffects, witnessScene } from '../game';
import type { Progress } from '../save';
import * as closing from './closing';
import * as defense from './defense';
import { ADVERSE } from './discovery';
import type { ClosingScene, DefenseScene, DeskScene, TheoryScene, TrialScene } from './schema';
import * as trial from './trial';

const ep = episodes.ep2;
const scene = <T>(id: string) => ep.scenes.find((s) => s.id === id) as T;
const args = ep.scenes
  .filter((s): s is DeskScene => s.type === 'desk')
  .flatMap((d) => d.questions.map((q) => q.argument));
const raw = scene<DefenseScene>('defense-trevor');
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
  /** 案件理論：結辯講它要的論點，並承擔它在陪審團心裡的代價。沒給就講論點 A、B、不算代價。 */
  theory?: string;
  /** 審前留下的旗標（開示交出了什麼、有沒有更正筆錄）：決定 effects 的代價與崔佛那一場的題目。 */
  flags?: string[];
}

const before = (flags: string[] = [], chosen?: string): Progress => ({
  episode: 'ep2',
  scene: 0,
  step: 0,
  choices: {},
  cards: [],
  flags,
  ethics: [],
  scenes: chosen ? { theory: { chosen, skipped: false } } : {},
});

/** 第五幕整段：瑪莉索 → 費雪或唐醫師 → 崔佛 → 結辯（論點 A、B）。 */
function verdict(r: Route) {
  const p = before(r.flags, r.theory);
  const shift = (r.concealed ?? 0) * ADVERSE + activeEffects(p).reduce((n, e) => n + e.jury, 0);
  const witness = witnessScene(p, raw);
  const court = (id: string): TrialScene => {
    const t = scene<TrialScene>(id);
    return { ...t, jurors: t.jurors.map((j) => ({ ...j, start: Math.min(100, j.start + shift) })) };
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
    if (q.id !== 'tq-always' || r.always)
      d = defense.ask(witness, d, rules, q.id, ['app-log', 'errata']);
  d = defense.finish(witness, d, rules);
  const th = scene<TheoryScene>('theory').theories.find((x) => x.id === r.theory);
  const picks = th?.needs ?? ['arg-a', 'arg-b'];
  let cs = closing.startClosing(closing.theoryCost(rules, d.jury, th?.jury));
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

  it('理論的風險不同：每一場都打到最好，三種理論都能贏', () => {
    expect(verdict({ ...best, theory: 'own-choice' })).toBe('無責');
    expect(verdict({ ...best, theory: 'warned' })).toBe('無責');
    expect(verdict({ ...best, theory: 'shared' })).toBe('無責');
  });

  it('打得普通（只對質不異議）：他自己的選擇還撐得住，分攤就判有責', () => {
    expect(verdict({ confront: true, theory: 'own-choice' })).toBe('無責');
    expect(verdict({ confront: true, theory: 'shared' })).toBe('有責');
  });
});

/** 崔佛提案的審前代價：交出群組截圖、更正筆錄。 */
describe('第 2 集審前選擇的代價', () => {
  const chat = 'discovery:rq-chat:produced';
  const fixed = 'trevor-corrected';
  const theories = ['own-choice', 'warned', 'shared'];

  it('交出群組截圖、更正筆錄，或兩個都做：每一場都打到最好，三種理論仍然都能贏', () => {
    for (const flags of [[chat], [fixed], [chat, fixed]])
      for (const theory of theories) {
        expect(verdict({ ...best, theory, flags })).toBe('無責');
        expect(verdict({ ...best, daubert: true, theory, flags })).toBe('無責');
      }
  });

  it('交出群組截圖的代價：「他自己的選擇」只對質不異議原本撐得住，交出之後就判有責', () => {
    expect(verdict({ confront: true, theory: 'own-choice' })).toBe('無責');
    expect(verdict({ confront: true, theory: 'own-choice', flags: [chat] })).toBe('有責');
    for (const theory of theories)
      expect(verdict({ confront: true, theory, flags: [chat, fixed] })).toBe('有責');
  });

  it('更正筆錄不在陪審團那邊扣分（代價在調解與客戶信任）', () => {
    for (const theory of theories)
      for (const r of [best, { confront: true }, { object: true }])
        expect(verdict({ ...r, theory, flags: [fixed] })).toBe(verdict({ ...r, theory }));
  });
});
