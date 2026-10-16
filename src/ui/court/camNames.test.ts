import { describe, expect, it } from 'vitest';
import { benchNames } from './camNames';

describe('benchNames', () => {
  it('中文介面用中文背牆；時段找不到退回第二天下午', () => {
    expect(benchNames('d1-am', 5, false)).toEqual(['bench-d1-am-p5', 'bench-d2-pm-p5']);
    expect(benchNames(undefined, 3, false)).toEqual(['bench-d2-pm-p3']);
  });
  it('英文介面先找 -en，同一時段找不到才退回中文版，再退回別的時段', () => {
    expect(benchNames('verdict', 0, true)).toEqual([
      'bench-verdict-p0-en',
      'bench-verdict-p0',
      'bench-d2-pm-p0-en',
      'bench-d2-pm-p0',
    ]);
  });
  it('耐心夾在 0–5', () => {
    expect(benchNames('d3-ov', -2, false)[0]).toBe('bench-d3-ov-p0');
    expect(benchNames('d3-ov', 9, false)[0]).toBe('bench-d3-ov-p5');
  });
});
