import { describe, expect, it } from 'vitest';
import { cssOf, msOf, objectionBeat, type Tok } from './beat';

const K: Record<Tok, number> = {
  ui: 180,
  rm: 100,
  'cut-black': 83,
  'bench-hold': 700,
  stamp: 90,
  'redact-in': 300,
  'redact-out': 500,
  'sub-unit': 140,
  'judge-read': 0,
};

describe('異議那一拍：法官的裁定讀完才切回證人（關卡二 v92 #A）', () => {
  for (const sustained of [true, false])
    it(`${sustained ? '成立' : '駁回'}：切回證人的時間隨「裁定讀完還差多久」往後移，之後的時間點一起移`, () => {
      const t = objectionBeat(sustained, { objection: 1, judge: 1, rest: 1 });
      const at = (extra: number) => (tok: Tok) => (tok === 'judge-read' ? extra : K[tok]);
      for (const when of ['back', 'rest', 'end'] as const)
        expect(msOf(t[when], at(1500)) - msOf(t[when], at(0))).toBe(1500);
      // 裁定本身（法官開口）不受影響。
      expect(msOf(t.judge, at(1500))).toBe(msOf(t.judge, at(0)));
    });

  it('量到之前（--dur-judge-read 沒設）是 0s，不會讓整個時間點失效', () => {
    const t = objectionBeat(true, { objection: 1, judge: 1, rest: 1 });
    expect(cssOf(t.back)).toContain('var(--dur-judge-read, 0s)');
  });
});
