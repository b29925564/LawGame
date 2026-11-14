import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaults, faces, lucas, lucasFace } from './cast';

describe('立繪包', () => {
  it('讀 yaml 的 default 一行', () => {
    const yaml = readFileSync(new URL('./cast/lucas/lucas.yaml', import.meta.url), 'utf8');
    expect(defaults(yaml)).toMatchObject({ plain: 'v01', tense: 'tense-light v01', hard: 'v01' });
  });

  it('每個 mood 三種尺寸都有圖；變體名稱照 yaml 找檔', () => {
    for (const mood of ['平', '緊', '暖', '硬', '慌', '默', undefined])
      for (const size of [144, 512, 628, 1256] as const) expect(lucas(mood, size)).toBeTruthy();
    expect(lucas('硬', 144)).toMatch(/hard/);
    expect(lucas('緊', 1256)).toMatch(/tense-light/);
    expect(lucas('慌', 1256)).toMatch(/panic/);
    expect(lucas('默', 512)).toMatch(/silent/);
  });

  it('每張預設圖都量過臉的中心，頭像照臉置中（不是照頭部輪廓的 45.6%）', () => {
    const yaml = readFileSync(new URL('./cast/lucas/lucas.yaml', import.meta.url), 'utf8');
    const fx = faces(yaml);
    for (const [expr, v] of Object.entries(defaults(yaml))) {
      const key = v.includes(' ') ? v : `${expr} ${v}`;
      expect(fx[key], key).toBeGreaterThan(33.4); // 放大 1.5 倍時，再偏左圖的左緣就會露出來
      expect(fx[key], key).toBeLessThan(66.6);
    }
    for (const mood of ['平', '緊', '暖', '硬', '慌', '默', undefined])
      expect((lucasFace(mood) as Record<string, string>)['--face-x']).not.toBe('0.456');
    expect(lucasFace('緊')).toEqual({ '--face-x': '0.355' });
  });
});
