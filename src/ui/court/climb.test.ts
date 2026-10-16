import { describe, expect, it } from 'vitest';
import { climbWeight, easeOf, P_FROM, P_TO, SOFT } from './climb';

describe('climb', () => {
  it('p 從頭走到尾：全舊（0）到全新（1），任何像素都一樣', () => {
    for (const m of [0, 0.3, 0.7, 1]) {
      expect(climbWeight(m, P_FROM)).toBeCloseTo(m === 0 ? 0 : 0, 6);
      expect(climbWeight(m, P_TO)).toBe(1);
    }
  });
  it('影子掃到的地方才換：m 小的先換、m 大的後換', () => {
    const p = 0.5;
    expect(climbWeight(0.2, p)).toBe(1);
    expect(climbWeight(0.8, p)).toBe(0);
    expect(climbWeight(p, p)).toBeCloseTo(0.5, 6);
    expect(climbWeight(p + SOFT / 4, p)).toBeCloseTo(0.25, 6);
  });
  it('--ease-light：端點、單調、中段比線性快', () => {
    const f = easeOf('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    let last = 0;
    for (let i = 1; i <= 20; i++) {
      const v = f(i / 20);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(f(0.5)).toBeGreaterThan(0.5);
  });
  it('讀不出權杖就當線性', () => {
    expect(easeOf('')(0.3)).toBe(0.3);
  });
});
