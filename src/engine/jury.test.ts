import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import type { ClosingScene, Episode, TrialScene } from './episode/schema';
import { validateEpisode } from './episode/validate';
import { deliberate, termsOf, verdict, type JuryRules } from './jury';

const six = (start: number[]): JuryRules['jurors'] =>
  start.map((v, i) => ({
    id: `j${i}`,
    label: `陪審員${i}`,
    leans: ['邏輯'],
    start: v,
    foreperson: i === 0,
  }));
const jury = (vals: number[]) => Object.fromEntries(vals.map((v, i) => [`j${i}`, v]));

describe('民事門檻（優勢證據）', () => {
  const civil = (quorum?: number): JuryRules => ({
    jurors: six([50, 50, 50, 50, 50, 50]),
    threshold: 50,
    burden: 'civil',
    quorum,
  });

  it('過線的人數達到法定人數，原告勝（有責）；沒過線的達到，辯方勝（無責）', () => {
    expect(verdict(civil(5), jury([60, 55, 51, 50, 70, 10]))).toBe('有責');
    expect(verdict(civil(5), jury([49, 40, 30, 20, 10, 80]))).toBe('無責');
    expect(verdict(civil(5), jury([60, 60, 60, 40, 40, 40]))).toBe('陪審團僵局');
  });

  it('不填法定人數＝全體一致；刑事照舊', () => {
    expect(verdict(civil(), jury([60, 55, 51, 50, 70, 10]))).toBe('陪審團僵局');
    const criminal: JuryRules = { jurors: six([0, 0, 0, 0, 0, 0]), threshold: 70 };
    expect(verdict(criminal, jury([70, 80, 90, 70, 75, 99]))).toBe('有罪');
    expect(verdict(criminal, jury([69, 0, 0, 0, 0, 0]))).toBe('無罪');
  });

  it('評議與介面用詞跟著門檻走', () => {
    expect(termsOf(civil())).toMatchObject({ lean: '有責傾向', yes: '有責', no: '無責' });
    expect(termsOf({})).toMatchObject({ yes: '有罪', no: '無罪' });
    const moves = deliberate(civil(5), jury([60, 60, 60, 60, 60, 60])).flatMap((r) => r.moves);
    expect(moves.some((m) => m.includes('主張有責'))).toBe(true);
  });

  it('驗證器：民事的結辯要寫有責／無責，判決人數要過半而且不多於陪審員', () => {
    const e = structuredClone(episodes.ep1) as Episode;
    for (const s of e.scenes) if (s.type === 'trial') (s as TrialScene).burden = 'civil';
    const t = e.scenes.find((s) => s.type === 'trial') as TrialScene;
    t.quorum = 2;
    const errs = validateEpisode(e).join('\n');
    expect(errs).toContain('少了判決「有責」的結局');
    expect(errs).toContain('寫了這一集不會出現的判決「有罪」');
    expect(errs).toContain('沒有過半');
    const c = e.scenes.find((s) => s.type === 'closing') as ClosingScene;
    expect(c).toBeTruthy();
  });

  it('第 1 集（刑事）照舊通過', () => {
    expect(validateEpisode(episodes.ep1)).toEqual([]);
  });
});
