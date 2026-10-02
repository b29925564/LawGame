import { describe, expect, it } from 'vitest';
import { validateEpisode } from '../engine/episode/validate';
import { validateCase } from '../engine/validate';
import { cases, episodes } from './index';

describe('劇本驗證器', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateCase(c)).toEqual([]);
    });
  }
  for (const [name, e] of Object.entries(episodes)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateEpisode(e)).toEqual([]);
    });
  }
});

describe('心聲的新寫法', () => {
  const e = episodes[Object.keys(episodes)[0] as keyof typeof episodes];
  const withLine = (line: object) => ({
    ...e,
    scenes: [{ type: 'dialogue', id: 'x', act: '', steps: [{ do: 'say', ...line }] }, ...e.scenes],
  });
  const errs = (line: object) =>
    validateEpisode(withLine(line) as typeof e).filter((m) => m.startsWith('場景 x'));

  it('擋下「（心裡）」', () => {
    expect(errs({ who: '盧卡斯（心裡）', text: '嗯。' })).toHaveLength(1);
    expect(errs({ who: '盧卡斯', text: '（心裡）嗯。' })).toHaveLength(1);
  });
  it('beats 只能用在畫外字幕，記號和字幕不能混用', () => {
    expect(errs({ who: '盧卡斯', text: '', beats: [{ text: 'a' }] })).toHaveLength(1);
    expect(errs({ who: '盧卡斯', text: '', voice: 'off', mark: { kind: 'sticky' } })).toHaveLength(
      1,
    );
    expect(errs({ who: '盧卡斯', text: 'a', voice: 'off', beats: [{ text: 'a' }] })).toEqual([]);
  });
});
