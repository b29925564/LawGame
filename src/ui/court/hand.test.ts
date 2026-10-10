import { describe, expect, it } from 'vitest';
import { inkUnits, pen } from './hand';

describe('陪審長的手寫', () => {
  it('漢字一字一拍，拉丁字母與數字三個一拍，空白不算', () => {
    expect(inkUnits('無罪')).toBe(2);
    expect(inkUnits('杜根')).toBe(2);
    expect(inkUnits('Dugan')).toBe(1.67);
    expect(inkUnits('Not guilty')).toBe(3);
    expect(inkUnits('$7,930,000')).toBe(3.33);
  });

  it('筆照呼叫順序接下去', () => {
    const p = pen();
    expect(p(1)).toEqual({ '--u': 1, '--at': 0, '--k': 0 });
    expect(p(2)).toEqual({ '--u': 2, '--at': 1, '--k': 1 });
    expect(p(0.5)).toEqual({ '--u': 0.5, '--at': 3, '--k': 2 });
    expect(p.end()).toEqual({ u: 3.5, lifts: 2, any: true });
  });

  it('只寫一個勾：最後一筆在 1.3 + 0.6 秒寫完', () => {
    const p = pen();
    expect(p.end()).toEqual({ u: 0, lifts: 0, any: false });
    p(1);
    expect(p.end()).toEqual({ u: 1, lifts: 0, any: true });
  });
});
