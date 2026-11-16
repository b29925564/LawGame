import { describe, expect, it } from 'vitest';
import { lightFrames, MOVE_FRAMES } from './verdictLight';

describe('判決窗光 ④ 的畫面', () => {
  it('無罪只有 16:40 那一格；有罪、僵局是 16:40 加 10 格移動', () => {
    expect(lightFrames('無罪')).toHaveLength(1);
    expect(lightFrames('有罪')).toHaveLength(1 + MOVE_FRAMES);
    expect(lightFrames('陪審團僵局')).toHaveLength(1 + MOVE_FRAMES);
  });
  it('三種結果都從同一格（光在被告席）開始，最後一格各不相同', () => {
    const [a, b, c] = (['無罪', '有罪', '陪審團僵局'] as const).map(lightFrames);
    expect(b[0]).toBe(a[0]);
    expect(c[0]).toBe(a[0]);
    expect(new Set([a.at(-1), b.at(-1), c.at(-1)]).size).toBe(3);
  });
});
