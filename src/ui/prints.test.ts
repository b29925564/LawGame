import { describe, expect, it } from 'vitest';
import { hasPrint, redactZone } from './prints';

describe('實物照片（設計師 P4-6 第三版）', () => {
  it('兩支錶都有照片，其他卡照舊畫閃光燈版式', () => {
    expect(hasPrint('watch-photo')).toBe(true);
    expect(hasPrint('watch-listed')).toBe(true);
    expect(hasPrint('autopsy')).toBe(false);
  });
});

describe('31 樓警方照片（設計師 P2-6b 第三、四版）', () => {
  it('三張都有沖印，全景那張有遮蔽範圍，其他兩張沒有', () => {
    for (const id of ['scene-overall', 'scene-blood', 'scene-trophy'])
      expect(hasPrint(id)).toBe(true);
    expect(redactZone('scene-overall')).toEqual([0.4625, 0.4875, 1, 1]);
    expect(redactZone('scene-blood')).toBeUndefined();
  });
});
