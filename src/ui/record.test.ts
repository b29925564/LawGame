import { describe, expect, it } from 'vitest';
import { kindsOf, layout, ROWS_PER_PAGE, textWidth, wrap, type RecordEntry } from './record';

describe('筆錄排版', () => {
  it('中文一字 1em、拉丁字 0.6em', () => {
    expect(textWidth('證人')).toBe(2);
    expect(textWidth('22:34')).toBeCloseTo(3);
  });

  it('中文照寬度切，標點不放行首', () => {
    expect(wrap('一二三四五六', 3)).toEqual(['一二三', '四五六']);
    // 「。」放不下時掛在上一行尾，不單獨開一行。
    expect(wrap('一二三。四五', 3)).toEqual(['一二三。', '四五']);
    // 開頭的括號跟下一個字走。
    expect(wrap('一二「三四', 3)).toEqual(['一二', '「三四']);
  });

  it('英文遇空白才斷，太長的詞硬切', () => {
    expect(wrap('Where were you that night', 4)).toEqual(['Where', 'were', 'you', 'that', 'night']);
    expect(wrap('Where were you', 6, 3)).toEqual(['Where', 'were you']);
    expect(wrap('abcdefghijkl', 3)).toEqual(['abcde', 'fghij', 'kl']);
  });

  it('第一行扣掉標記，續行從行首開始', () => {
    expect(wrap('一二三四五六七', 5, 3)).toEqual(['一二三', '四五六七']);
  });

  it('25 行一頁，頁行號接續', () => {
    const e: RecordEntry = { kind: 'a', tag: '答', text: '一'.repeat(40) };
    const rows = layout(Array(10).fill(e), 10);
    expect(rows.length).toBeGreaterThan(ROWS_PER_PAGE);
    const r = rows[ROWS_PER_PAGE];
    expect([r.page, r.line]).toEqual([2, 1]);
    expect(rows[0].indent).toBe(2);
    expect(rows[1].indent).toBe(0);
  });

  it('證人說的是答、接著證人回答的律師發言是問、法官與異議列名字', () => {
    const log = [
      { who: '法官' },
      { who: '莫羅' },
      { who: '瑞秋' },
      { who: '盧卡斯' },
      { who: '法官' },
      { who: '瑞秋' },
      { who: '旁白' },
    ];
    expect(kindsOf(log, '瑞秋', { judge: '法官', narrator: '旁白' })).toEqual([
      'say',
      'q',
      'a',
      'say',
      'say',
      'a',
      'note',
    ]);
  });
});
