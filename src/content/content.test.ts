import { describe, expect, it } from 'vitest';
import { validateEpisode } from '../engine/episode/validate';
import { validateCase } from '../engine/validate';
import { cases, episodes } from './index';

describe('劇本驗證器', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateCase(c)).toEqual([]);
    });
  }
  for (const [name, e] of Object.entries(episodes)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateEpisode(e)).toEqual([]);
    });
  }
});
