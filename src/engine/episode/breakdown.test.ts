import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import type { TrialScene } from './schema';
import * as trial from './trial';

// 證人崩的那一句旁白（breakdown）是一個反應，不是每彈劾一次就重播一次：
// 唐醫師兩個主張都被彈劾時，筆錄裡只能有一句（設計師 #225 第三輪：交互詰問結束頁印了兩次）。
describe('彈劾後的反應旁白', () => {
  const s = episodes.ep2.scenes.find((x) => x.id === 'court-doctor') as TrialScene;

  it('兩次彈劾只記一次', () => {
    let st = trial.startTrial(s);
    while (st.stage === 'direct') st = st.window ? trial.letPass(s, st) : trial.nextQuestion(s, st);
    for (const c of s.witness.claims) {
      st = trial.lock(s, st, c.id, 'strong');
      st = trial.setup(s, st, c.id);
      st = trial.confront(s, st, c.id, 3, [], { id: c.argument });
    }
    expect(st.impeachments).toBe(2);
    expect(st.log.filter((l) => l.text === s.witness.breakdown)).toHaveLength(1);
  });
});
