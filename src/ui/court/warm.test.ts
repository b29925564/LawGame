import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { entryUrls, shotUrls } from './CourtCamera';

const trials = Object.values(episodes).flatMap((ep) => ep.scenes.filter((s) => s.type === 'trial'));

describe('進場預熱', () => {
  it('劇本有審判場', () => {
    expect(trials.length).toBeGreaterThan(0);
  });
  for (const en of [false, true])
    it(`預熱的網址 = 進場時 CourtCamera 要的網址（${en ? 'en' : 'zh'}，每一場審判）`, () => {
      for (const s of trials) {
        const need = shotUrls(s.id, 'default', s.patience, en).urls;
        const warm = entryUrls(s.id, s.patience, en);
        expect(warm).toEqual([...need.witness, ...need.bench]);
        // 證人席與法官席各至少有底圖；英文要吃到 -en 那一組。
        expect(need.witness.length).toBeGreaterThan(0);
        expect(need.bench.length).toBeGreaterThan(0);
        if (en) expect(need.bench.some((u) => /-en[.-]/.test(u))).toBe(true);
      }
    });
});
