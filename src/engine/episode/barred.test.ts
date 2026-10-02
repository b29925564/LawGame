import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { courtScene } from '../game';
import type { TrialScene } from './schema';
import * as trial from './trial';

const raw = episodes.ep1.scenes.find((s) => s.id === 'court-kowalski') as TrialScene;
const base = { episode: 'ep1', scene: 0, step: 0, choices: {}, cards: [] as string[], scenes: {} };
const at = (cards: string[], s: TrialScene) => courtScene({ ...base, cards }, s);

/** 把 d6 改成：排除裁定成立時檢方照問，或乾脆不問。 */
const withD6 = (patch: Partial<TrialScene['witness']['direct'][number]>): TrialScene => ({
  ...raw,
  witness: {
    ...raw.witness,
    direct: raw.witness.direct.map((q) => (q.id === 'd6' ? { ...q, ...patch } : q)),
  },
});

describe('主詰問題目的條件與排除裁定', () => {
  it('when 不符的題目不問', () => {
    const s = withD6({ when: { notCards: ['statement-excluded'] } });
    expect(at([], s).witness.direct.some((q) => q.id === 'd6')).toBe(true);
    expect(at(['statement-excluded'], s).witness.direct.some((q) => q.id === 'd6')).toBe(false);
  });

  it('違反排除裁定的題目，正確異議變成「違反裁定」，異議清單也多這一項', () => {
    const s = withD6({ barred: { when: { cards: ['statement-excluded'] } } });
    const open = at([], s);
    expect(open.witness.direct.find((q) => q.id === 'd6')!.objection).toBeNull();
    expect(trial.objectionsFor(open)).not.toContain('違反裁定');

    const ruled = at(['statement-excluded'], s);
    expect(ruled.witness.direct.find((q) => q.id === 'd6')!.objection).toBe('違反裁定');
    expect(trial.objectionsFor(ruled)).toContain('違反裁定');

    // 玩家異議成立：證詞刪除、心證不動。
    let st = trial.startTrial(ruled, []);
    const i = ruled.witness.direct.findIndex((q) => q.id === 'd6');
    for (let k = 0; k <= i; k++) {
      st = trial.nextQuestion(ruled, st);
      if (k < i) st = trial.letPass(ruled, st);
    }
    const before = st.jury;
    st = trial.object(ruled, st, '違反裁定');
    expect(st.jury).toEqual(before);
    expect(st.log.at(-2)?.text).toBe(trial.BARRED);
    expect(st.log.at(-1)?.struck).toBe(true);
  });
});
