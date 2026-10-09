import { describe, expect, it } from 'vitest';
import {
  kindsOf,
  layout,
  measureFor,
  ROWS_PER_PAGE,
  rulingsOf,
  textWidth,
  wrap,
  type RecordEntry,
} from './record';

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

  it('裁定章放不下時，最後一個詞換行，章跟著它（章不蓋在字上）', () => {
    // 英文：最後一個詞往下掉。
    expect(wrap('Objection, hearsay.', 14, 14, false, 5)).toEqual(['Objection,', 'hearsay.']);
    // 放得下就不動。
    expect(wrap('Objection, hearsay.', 14, 14, false, 2)).toEqual(['Objection, hearsay.']);
    // 中文：最後一個字連同後面的標點一起掉；前面的開頭括號跟著走。
    expect(wrap('異議，傳聞。', 6, 6, true, 2)).toEqual(['異議，傳', '聞。']);
    expect(wrap('異議，「傳聞」。', 8, 8, true, 3)).toEqual(['異議，「傳', '聞」。']);
    expect(wrap('一二「三」。', 6, 6, true, 2)).toEqual(['一二', '「三」。']);
    // layout 照每句的裁定留寬。
    const rows = layout(
      [{ kind: 'say', tag: 'X:', text: 'Objection, hearsay.', ruling: '成立' }],
      20,
      false,
      () => 6,
    );
    expect(rows.map((r) => r.text)).toEqual(['Objection,', 'hearsay.']);
    expect(rows[0].space).toBe(true);
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

  it('行寬照語言固定：中文 24 字、英文 44 個字元', () => {
    expect(measureFor(true)).toBe(24);
    expect(wrap('x'.repeat(44) + ' y', measureFor(false))).toEqual(['x'.repeat(44), 'y']);
    expect(wrap('一'.repeat(25), measureFor(true))).toEqual(['一'.repeat(24), '一']);
  });

  it('異議：回答被刪＝成立；法官駁回、證人照答＝駁回，那句黑條抽走', () => {
    const who = { lawyer: '盧卡斯', judge: '法官', witness: '瑞秋' };
    const sustained = [
      { who: '莫羅', text: '問' },
      { who: '盧卡斯', text: '異議，誘導。' },
      { who: '法官', text: '異議成立。' },
      { who: '瑞秋', text: '答', struck: true },
    ];
    expect(rulingsOf(sustained, who)[1]).toEqual({ ruling: '成立' });
    const overruled = [
      { who: '莫羅', text: '問' },
      { who: '盧卡斯', text: '異議，傳聞。' },
      { who: '法官', text: '異議駁回。律師，這個問題沒有問題。' },
      { who: '瑞秋', text: '答' },
    ];
    const r = rulingsOf(overruled, who);
    expect(r[1]).toEqual({ ruling: '駁回' });
    expect(r[3]).toEqual({ unbar: true });
    // 法官叫停（耐心用完）：沒有回答，只有章。
    expect(rulingsOf(overruled.slice(0, 3), who)[1]).toEqual({ ruling: '駁回' });
  });
});
