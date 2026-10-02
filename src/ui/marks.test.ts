import { describe, expect, it } from 'vitest';
import { AnnounceQueue } from './announce';
import { claimHand, topHand, useHandStore } from './hand';

function setup() {
  const said: string[] = [];
  let pending: (() => void) | null = null;
  const q = new AnnounceQueue((t) => said.push(t), {
    set: (fn) => (pending = fn),
    clear: () => (pending = null),
  });
  const tick = () => {
    const fn = pending;
    pending = null;
    fn?.();
  };
  return { q, said, tick };
}

describe('播報佇列', () => {
  it('同一批的記號合成一行', () => {
    const { q, said, tick } = setup();
    q.mark({ from: 'a', text: '標記了每天', word: '每天' });
    q.mark({ from: 'b', text: '標記了 22:24', word: '22:24' });
    q.mark({ from: 'c', text: '標記了 22:47', word: '22:47' });
    expect(said).toEqual([]);
    tick();
    expect(said).toEqual(['以安標記了 3 處：每天、22:24、22:47']);
  });

  it('同一元件重複觸發只播最後一次', () => {
    const { q, said, tick } = setup();
    q.mark({ from: 'a', text: '一' });
    q.mark({ from: 'a', text: '二' });
    tick();
    expect(said).toEqual(['二']);
  });

  it('畫外字幕優先，其他記號等字幕結束', () => {
    const { q, said, tick } = setup();
    q.voice('他死在裡面。');
    q.mark({ from: 'a', text: '已排除' });
    tick();
    expect(said).toEqual(['以安沒有說出口：他死在裡面。']);
    q.voiceEnd();
    expect(said).toEqual(['以安沒有說出口：他死在裡面。', '已排除']);
  });
});

describe('一格一黃', () => {
  it('優先序高的手勝出，放掉後低的回來', () => {
    const hl = claimHand('highlight');
    expect(topHand(useHandStore.getState().claims)).toBe('highlight');
    const sync = claimHand('sync');
    expect(topHand(useHandStore.getState().claims)).toBe('sync');
    sync();
    sync();
    expect(topHand(useHandStore.getState().claims)).toBe('highlight');
    hl();
    expect(topHand(useHandStore.getState().claims)).toBeUndefined();
  });
});
