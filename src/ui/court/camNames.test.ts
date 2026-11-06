import { describe, expect, it } from 'vitest';
import { benchNames, verdictSlot } from './camNames';

describe('benchNames', () => {
  it('中文介面用中文背牆；時段找不到退回第二天下午', () => {
    expect(benchNames('d1-am', 5, false)).toEqual(['bench-d1-am-p5', 'bench-d2-pm-p5']);
    expect(benchNames(undefined, 3, false)).toEqual(['bench-d2-pm-p3']);
  });
  it('英文介面先找 -en，同一時段找不到才退回中文版，再退回別的時段', () => {
    expect(benchNames('verdict-e1-164845', 0, true)).toEqual([
      'bench-verdict-e1-164845-p0-en',
      'bench-verdict-e1-164845-p0',
      'bench-d2-pm-p0-en',
      'bench-d2-pm-p0',
    ]);
  });
  it('耐心夾在 0–5', () => {
    expect(benchNames('d3-ov', -2, false)[0]).toBe('bench-d3-ov-p0');
    expect(benchNames('d3-ov', 9, false)[0]).toBe('bench-d3-ov-p5');
  });
});

describe('verdictSlot', () => {
  it('掛鐘跟著結果走：兩集各三組時刻', () => {
    expect(verdictSlot('ep1', '無罪')).toBe('verdict-e1-1640');
    expect(verdictSlot('ep1', '有罪')).toBe('verdict-e1-164845');
    expect(verdictSlot('ep1', '陪審團僵局')).toBe('verdict-e1-1701');
    expect(verdictSlot('ep2', '無責')).toBe('verdict-e2-1610');
    expect(verdictSlot('ep2', '有責')).toBe('verdict-e2-1640');
    expect(verdictSlot('ep2', '陪審團僵局')).toBe('verdict-e2-1734');
  });
  it('每一格的 36 個檔都在（耐心 0–5 × 中英 × 底圖／rim／front）', async () => {
    const { readdirSync } = await import('node:fs');
    const files = new Set(readdirSync(new URL('./cam/', import.meta.url)));
    const missing: string[] = [];
    for (const ep of ['ep1', 'ep2'])
      for (const o of ['無罪', '有罪', '無責', '有責', '陪審團僵局'] as const)
        for (let p = 0; p <= 5; p++)
          for (const lang of ['', '-en'])
            for (const layer of ['', '-rim', '-front']) {
              const f = `bench-${verdictSlot(ep, o)}-p${p}${lang}${layer}.webp`;
              if (!files.has(f)) missing.push(f);
            }
    expect(missing).toEqual([]);
    // 舊的判決格（百葉全開那一版）不能留著被找到。
    expect([...files].filter((f) => /^bench-verdict-p\d/.test(f))).toEqual([]);
  });
});
