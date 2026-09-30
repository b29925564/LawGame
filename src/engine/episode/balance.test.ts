import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import * as closing from './closing';
import type { ClosingScene, DeskScene, TrialScene } from './schema';
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
