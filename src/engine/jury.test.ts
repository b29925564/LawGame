import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import type { ClosingScene, Episode, TrialScene } from './episode/schema';
import { validateEpisode } from './episode/validate';
import { deliberate, STILL, termsOf, verdict, type JuryRules } from './jury';

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

  it('票數沒動的那一輪不重複陪審長那句，三輪的描述都不一樣', () => {
    const rounds = deliberate(civil(5), jury([90, 90, 90, 10, 10, 10]));
    const text = rounds.map((r) => r.moves.join(''));
    expect(new Set(text).size).toBe(3);
    expect(rounds[1].moves[0]).toBe(STILL[0]);
    expect(rounds[2].moves[0]).toBe(STILL[1]);
  });

  it('每一輪評議都寫出票數，看得到票怎麼移動', () => {
    const rounds = deliberate(civil(5), jury([62, 55, 52, 46, 44, 30]));
    const tallies = rounds.map((r) => r.moves.at(-1));
    expect(tallies).toEqual([
      '表決：3 票有責，3 票無責。',
      '表決：4 票有責，2 票無責。',
      '表決：5 票有責，1 票無責。',
    ]);
  });

  it('被多數推過線、又被陪審長拉回來的人沒有換邊，不寫「被說服」（體驗評測 v88）', () => {
    // 陪審長 j0 偏無責；多數有責，j5 從 46 被推到 51，陪審長再拉回 49。
    const rules = civil(5);
    const start = jury([30, 60, 60, 60, 60, 46]);
    const rounds = deliberate(rules, start);
    let prev = start;
    for (const r of rounds) {
      const flipped = rules.jurors.filter((j) => prev[j.id] >= 50 !== r.jury[j.id] >= 50);
      const said = r.moves.filter((m) => m.includes('改變了立場'));
      expect(said).toHaveLength(flipped.length);
      if (!flipped.length && r !== rounds[0]) expect(r.moves[0]).toMatch(/沒有|沒有再動/);
      prev = r.jury;
    }
    expect(rounds[0].moves.join('')).not.toContain('陪審員5被多數說服');
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

describe('民事 6 人陪審', () => {
  it('人數可以少於 12，但要和遴選的 seats 一致', async () => {
    const { episodes } = await import('../content');
    const { validateEpisode } = await import('./episode/validate');
    const ep = structuredClone(episodes.ep1) as import('./episode/schema').Episode;
    const t = ep.scenes.find((x) => x.type === 'trial')!;
    if (t.type !== 'trial') throw new Error('no trial');
    t.jurors = t.jurors.slice(0, 6);
    expect(validateEpisode(ep).some((e) => e.includes('寫了 6 位陪審員'))).toBe(true);
    const vd = ep.scenes.find((x) => x.type === 'voirdire');
    if (vd?.type === 'voirdire') vd.seats = 6;
    for (const x of ep.scenes) if (x.type === 'trial') x.jurors = x.jurors.slice(0, 6);
    expect(validateEpisode(ep).filter((e) => e.includes('陪審員'))).toEqual([]);
  });
});
