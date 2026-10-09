import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { currentRow, docketOf } from './Dossier';

describe('案卷登錄表（P2-6）', () => {
  const ep1 = episodes.ep1;
  const rows = docketOf(ep1);

  it('每張寫了 docket 的幕卡一行，序號從 1 起不跳號', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.no)).toEqual(rows.map((_, i) => i + 1));
    for (const r of rows) expect(ep1.scenes[r.at].type).toBe('card');
  });

  it('目前那一行是走過的最後一張登錄卡；還沒走到第一張時每一行都還沒發生', () => {
    expect(currentRow(rows, 0)).toBe(-1);
    expect(currentRow(rows, rows[0].at)).toBe(0);
    expect(currentRow(rows, rows[1].at - 1)).toBe(0);
    expect(currentRow(rows, rows[2].at)).toBe(2);
    expect(currentRow(rows, ep1.scenes.length - 1)).toBe(rows.length - 1);
  });
});
