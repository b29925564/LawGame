import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaults, lucas } from './cast';

describe('立繪包', () => {
  it('讀 yaml 的 default 一行', () => {
    const yaml = readFileSync(new URL('./cast/lucas/lucas.yaml', import.meta.url), 'utf8');
    expect(defaults(yaml)).toMatchObject({ plain: 'v01', tense: 'v02', warm: 'v01' });
  });

  it('每個 mood 三種尺寸都有圖；還沒生的硬用緊代打', () => {
    for (const mood of ['平', '緊', '暖', '硬', '慌', '默', undefined])
      for (const size of [144, 512, 1024] as const) expect(lucas(mood, size)).toBeTruthy();
    expect(lucas('硬', 144)).toBe(lucas('緊', 144));
    expect(lucas('慌', 1024)).toMatch(/panic/);
    expect(lucas('默', 512)).toMatch(/silent/);
  });
});
