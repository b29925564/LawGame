import { describe, expect, it } from 'vitest';
import { hasPrint } from './prints';

describe('實物照片（設計師 P4-6 第三版）', () => {
  it('兩支錶都有照片，其他卡照舊畫閃光燈版式', () => {
    expect(hasPrint('watch-photo')).toBe(true);
    expect(hasPrint('watch-listed')).toBe(true);
    expect(hasPrint('autopsy')).toBe(false);
  });
});
