import { describe, expect, it } from 'vitest';
import { hidden, opacities } from './courtLight';

describe('法庭光層混光', () => {
  it('門檻 70：40 以下只有底圖，門檻上只到第三層，80 以上全亮', () => {
    expect(opacities(30, 70)).toEqual([1, 0, 0, 0]);
    expect(opacities(70, 70)).toEqual([1, 1, 1, 0]);
    expect(opacities(95, 70)).toEqual([1, 1, 1, 1]);
    expect(opacities(75, 70)[3]).toBeCloseTo(0.5);
  });

  it('民事門檻 50 整組往下平移 20', () => {
    expect(opacities(50, 50)).toEqual(opacities(70, 70));
  });

  it('被上面不透明層蓋住的層不合成，同時最多兩張', () => {
    const op = opacities(62, 70);
    expect(hidden(op)).toEqual([true, false, false, false]);
    expect(hidden(op).filter((h) => !h).length).toBeLessThanOrEqual(3);
    expect(op.filter((o, i) => o > 0 && !hidden(op)[i]).length).toBeLessThanOrEqual(2);
  });
});
