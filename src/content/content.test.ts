import { describe, expect, it } from 'vitest';
import { validateCase } from '../engine/validate';
import { cases } from './index';

describe('劇本驗證器', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateCase(c)).toEqual([]);
    });
  }
});
