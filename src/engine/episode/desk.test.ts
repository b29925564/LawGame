import { describe, expect, it } from 'vitest';
import { fits } from './desk';

describe('替代卡', () => {
  it('說得通的替代卡也算對，但同一格不能重複填', () => {
    const alt = { a: ['a2'] };
    expect(fits(['a', 'b'], alt, ['b', 'a2'])).toBe(true);
    expect(fits(['a', 'b'], alt, ['a', 'a2'])).toBe(false);
    expect(fits(['a', 'b'], alt, ['b', 'c'])).toBe(false);
  });
});
