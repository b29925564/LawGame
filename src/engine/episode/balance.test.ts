import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import * as closing from './closing';
import * as defense from './defense';
import { shiftAll } from '../jury';
import type { ClosingScene, DefenseScene, DeskScene, TrialScene } from './schema';
import * as trial from './trial';

const scene = <T>(id: string) => episodes.ep1.scenes.find((s) => s.id === id) as T;
const close = scene<ClosingScene>('closing');
const court = scene<TrialScene>('court-rachel');
const args = scene<DeskScene>('investigate').questions.map((q) => q.argument);
const rules = { jurors: court.jurors, threshold: court.threshold };
const arg = (id: string) => args.find((a) => a.id === id)!;

/** 檢方問完、辯方彈劾 n 次之後的陪審團。異議全部放過＝最壞情況。 */
function play(impeachments: number) {
  let st = trial.startTrial(court, ['rachel-2250', 'rachel-meeting']);
  for (let i = 0; i < court.witness.direct.length; i++) {
    st = trial.nextQuestion(court, st);
    st = trial.letPass(court, st);
  }
  st = trial.toCross(court, st);
  for (const c of court.witness.claims.slice(0, impeachments)) {
    if (st.claims[c.id].lock === 'none') st = trial.lock(court, st, c.id, 'strong');
    st = trial.setup(court, st, c.id);
    const a = arg(c.argument);
    st = trial.confront(court, st, c.id, a.strength, a.tags, { id: a.id });
  }
  return st.jury;
}

const finish = (jury: Record<string, number>, tone = 't-logic') => {
  let cs = closing.startClosing(jury);
  for (const p of ['arg-a', 'arg-d', 'arg-b']) cs = closing.togglePick(close, cs, p);
  return closing.deliver(close, closing.setTone(close, cs, tone), rules, args).verdict;
};

/** 數值平衡（企劃書 6.10）：庭審不該一次就打完，也不該把陪審團推到頂。 */
describe('第 1 集的庭審平衡', () => {
  it('檢方詰問完，陪審團偏有罪但沒有頂到 100', () => {
    const jury = Object.values(play(0));
    expect(Math.min(...jury)).toBeGreaterThan(court.threshold);
    expect(Math.max(...jury)).toBeLessThan(100);
  });

  it('什麼都沒拆就結辯：有罪', () => {
    expect(finish(play(0))).toBe('有罪');
  });

  it('彈劾一次會拉開陪審員之間的差距，但還不到全體無罪的程度', () => {
    const jury = Object.values(play(1));
    expect(Math.max(...jury) - Math.min(...jury)).toBeGreaterThan(20);
  });

  it('三次彈劾成功：無罪', () => {
    expect(finish(play(3))).toBe('無罪');
  });
});

const brooks = scene<DefenseScene>('defense-brooks-ep1');

/**
 * 整集路線（測試員 2026-10-01 跑的路線）：瑞秋庭審 → 布魯克斯 → 承諾反噬 → 結辯。
 * 布魯克斯三題全問、能問的都問；結辯挑手上前三個論點。
 */
const trials = ['court-kowalski', 'court-sophie', 'court-rachel'].map((id) =>
  scene<TrialScene>(id),
);

/** impeach：要在哪幾場庭審彈劾（true＝三場都彈劾）。心證跨場延續、隔天回彈一半。 */
function route(held: string[], impeach: boolean | string[], broken: number, theory: boolean) {
  const have = args.filter((a) => held.includes(a.id));
  const hits = (id: string) => impeach === true || (Array.isArray(impeach) && impeach.includes(id));
  let st: trial.TrialState | undefined;
  for (const t of trials) {
    const go = hits(t.id);
    st = trial.startTrial(t, go ? ['rachel-2250', 'rachel-meeting'] : [], st);
    for (let i = 0; i < t.witness.direct.length; i++) {
      st = trial.nextQuestion(t, st);
      st = trial.letPass(t, st);
    }
    st = trial.toCross(t, st);
    if (go)
      for (const c of t.witness.claims) {
        const a = have.find((x) => x.id === c.argument);
        if (!a || st.stage === 'done') continue;
        if (st.claims[c.id].lock === 'none') st = trial.lock(t, st, c.id, 'strong');
        st = trial.setup(t, st, c.id);
        st = trial.confront(t, st, c.id, a.strength, a.tags, { id: a.id });
      }
  }
  st = st!;
  let d = defense.prepare(brooks, defense.startDefense(st.jury), 'prep-honest');
  for (const q of brooks.questions) d = defense.ask(brooks, d, rules, q.id, held);
  d = defense.finish(brooks, d, rules);
  let cs = closing.startClosing(shiftAll(rules, d.jury, 8 * broken).jury);
  for (const a of have.slice(0, 3)) cs = closing.togglePick(close, cs, a.id);
  cs = closing.setTone(close, cs, 't-logic');
  return closing.deliver(close, cs, rules, have, [], theory).verdict;
}

const full = ['arg-a', 'arg-b', 'arg-c', 'arg-d', 'watch-photo', 'heart-rate'];

describe('第 1 集整集路線：準備好壞決定判決', () => {
  it('四個論點、彈劾成功、有理論：無罪', () => {
    expect(route(full, true, 0, true)).toBe('無罪');
  });

  it('少了瑞秋會面的論點，彈劾剩兩次：仍然無罪', () => {
    expect(
      route(
        full.filter((x) => x !== 'arg-c'),
        true,
        0,
        true,
      ),
    ).toBe('無罪');
  });

  it('傳票被駁回沒拿到心率、沒有理論、庭上只能彈劾一點：有罪', () => {
    expect(route(['arg-a', 'arg-watch', 'watch-photo'], true, 0, false)).toBe('有罪');
  });

  it('論點齊全但庭上不彈劾、三個承諾全跳票：有罪', () => {
    expect(route(full, false, 3, true)).toBe('有罪');
  });

  it('論點齊全但庭上不彈劾、沒許承諾：贏不了（最多僵局）', () => {
    expect(route(full, false, 0, true)).not.toBe('無罪');
  });

  it('前兩場拆了柯瓦斯基和蘇菲、瑞秋那場沒拆：前面的成果延續下來，仍然無罪', () => {
    expect(route(full.concat('arg-h'), ['court-kowalski', 'court-sophie'], 0, true)).toBe('無罪');
  });

  it('只拆柯瓦斯基，後兩場都沒拆：兩天回彈下來，贏不了', () => {
    expect(route(full.concat('arg-h'), ['court-kowalski'], 0, true)).not.toBe('無罪');
  });

  it('前兩場的彈劾會延續：同樣不拆瑞秋，前面有拆比完全沒拆好', () => {
    const order = ['無罪', '陪審團僵局', '有罪'];
    const some = route(full.concat('arg-h'), ['court-kowalski', 'court-sophie'], 0, true);
    const none = route(full.concat('arg-h'), [], 0, true);
    expect(order.indexOf(some!)).toBeLessThanOrEqual(order.indexOf(none!));
  });

  it('隔天開庭：只延續交互詰問拆掉的部分，而且回彈一半', () => {
    const at = (d: number) => Object.fromEntries(court.jurors.map((j) => [j.id, j.start + d]));
    const prev = { ...trial.startTrial(court), directEnd: at(40), jury: at(20) };
    const carried = trial.carryJury(court, prev);
    for (const j of court.jurors) expect(carried[j.id]).toBe(j.start - 10);
  });

  it('布魯克斯沒有證據撐著就問不出手錶與心率', () => {
    const d = defense.prepare(brooks, defense.startDefense({}), 'prep-honest');
    expect(defense.canAsk(brooks, d, 'bq-hr', ['watch-photo'])).toBe(false);
    expect(defense.canAsk(brooks, d, 'bq-hr', ['heart-rate'])).toBe(true);
    expect(defense.canAsk(brooks, d, 'bq-window', [])).toBe(true);
  });
});

describe('結辯的空格與理論', () => {
  const jury = Object.fromEntries(court.jurors.map((j) => [j.id, 60]));
  const sum = (j: Record<string, number>) => Object.values(j).reduce((a, b) => a + b, 0);
  const speak = (picks: string[], theory: boolean) => {
    let cs = closing.startClosing(jury);
    for (const p of picks) cs = closing.togglePick(close, cs, p);
    cs = closing.setTone(close, cs, 't-logic');
    const have = args.filter((a) => picks.includes(a.id));
    return sum(closing.deliver(close, cs, rules, have, [], theory).spoken!);
  };

  it('論點不夠，空格往有罪反噬', () => {
    const one = speak(['arg-a'], true);
    const base = sum(jury);
    expect(one).toBeGreaterThan(base - 40);
    expect(speak([], true)).toBe(
      sum(Object.fromEntries(court.jurors.map((j) => [j.id, 60 + 3 * closing.EMPTY_SLOT]))),
    );
  });

  it('沒有理論，同樣的論點說服力較弱', () => {
    expect(speak(['arg-a', 'arg-b', 'arg-d'], false)).toBeGreaterThan(
      speak(['arg-a', 'arg-b', 'arg-d'], true),
    );
  });
});
