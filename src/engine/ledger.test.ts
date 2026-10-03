import { describe, expect, it } from 'vitest';
import { ledger, theoryOutlook } from './ledger';

const base = { episode: 'ep2', scene: 0, step: 0, choices: {}, cards: [], scenes: {} };

describe('理論卡的「若判有責」金額區間', () => {
  it('第 2 集三個理論：過失比例加減浮動 5', () => {
    expect(theoryOutlook({ ...base, flags: [] }, 'own-choice')).toMatchObject({
      low: 4_550_000,
      high: 5_200_000,
      punitive: false,
    });
    expect(theoryOutlook({ ...base, flags: [] }, 'shared')).toMatchObject({
      low: 3_575_000,
      high: 4_225_000,
    });
  });

  it('懲罰性賠償會進入評議時一併告訴畫面，倍數一比一', () => {
    const o = theoryOutlook({ ...base, flags: ['discovery:rq-chat:produced'] }, 'warned');
    expect(o).toMatchObject({ punitive: true, ratio: 1 });
  });

  it('沒有金額設定（第 1 集）就沒有區間', () => {
    expect(theoryOutlook({ ...base, episode: 'ep1', flags: [] }, 'ethan')).toBeNull();
  });
});

describe('這一案的帳', () => {
  it('還沒判決時是空的', () => {
    expect(ledger({ ...base, flags: [] })).toEqual([]);
  });
});
