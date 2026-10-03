import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { punitiveBonus, trialRisk } from '../game';
import * as branch from './branch';
import * as closing from './closing';
import type { ClosingScene, TrialScene } from './schema';

const scene = <T>(id: string) => episodes.ep2.scenes.find((s) => s.id === id) as T;
const close = scene<ClosingScene>('closing');
const court = scene<TrialScene>('court-marisol');
const rules = { jurors: court.jurors, threshold: court.threshold, quorum: court.quorum };
const all = (v: number) => Object.fromEntries(court.jurors.map((j) => [j.id, v]));

describe('判決表', () => {
  it('票數剛過門檻，死者過失比例往上浮；判得很重則往下', () => {
    const close50 = closing.award(close, rules, all(50), 40, null)!;
    const heavy = closing.award(close, rules, all(90), 40, null)!;
    expect(close50.fault).toBe(45);
    expect(heavy.fault).toBe(35);
    expect(close50.amount).toBe(3575000);
    expect(heavy.amount).toBe(4225000);
    expect(close50.total).toBe(6500000);
  });

  it('判賠金額就是總額扣掉比例，不另外取整（650 萬 × 65% = 422.5 萬）', () => {
    const a = closing.award(close, rules, all(90), 40, null)!;
    expect(a.amount).toBe((a.total * (100 - a.fault)) / 100);
  });

  it('理論寫了 faultWhy，判決表帶著這句理由', () => {
    expect(closing.award(close, rules, all(90), 40, null, '他知道自己有病。')!.why).toBe(
      '他知道自己有病。',
    );
    expect(closing.award(close, rules, all(90), 40, null)!.why).toBeUndefined();
  });

  it('沒有進入懲罰性賠償評議時，punitive 是 null', () => {
    expect(closing.award(close, rules, all(90), 10, null)!.punitive).toBeNull();
  });

  it('懲罰性賠償要過 65 的人數達到法定人數才成立，金額與判賠一比一', () => {
    const jury = { ...all(60), [court.jurors[0].id]: 70, [court.jurors[1].id]: 70 };
    const no = closing.award(close, rules, jury, 10, 0)!;
    expect(no.punitive).toEqual({ found: false, amount: 0, votes: 2, need: court.quorum });
    const yes = closing.award(close, rules, jury, 10, 8)!;
    expect(yes.punitive?.found).toBe(true);
    expect(yes.punitive?.amount).toBe(yes.amount);
    // 補償性賠償已經是數百萬，懲罰性賠償最多一比一；分攤理論被打爛時也不會比起訴請求的 1,200 萬多。
    const shared = closing.award(close, rules, all(100), 40, 8)!;
    expect(shared.amount + shared.punitive!.amount).toBeLessThanOrEqual(12_000_000);
  });

  it('沒設定 damages 的結辯沒有判決表', () => {
    const ep1 = episodes.ep1.scenes.find((s) => s.type === 'closing') as ClosingScene;
    expect(closing.award(ep1, rules, all(90), 0, 0)).toBeNull();
    expect(closing.exposure(ep1, [10])).toBeNull();
  });

  it('調解室的風險區間：最高過失比例再浮動一次到全額', () => {
    expect(closing.exposure(close, [25, 10, 40])).toEqual({ low: 3575000, high: 6500000 });
  });
});

describe('when.punitive', () => {
  const base: branch.BranchContext = { flags: [], cards: [] } as unknown as branch.BranchContext;
  it('懲罰性賠償成立才走 punitive: true，沒評議或不成立都算 false', () => {
    expect(branch.matches({ punitive: true }, { ...base, punitive: true })).toBe(true);
    expect(branch.matches({ punitive: true }, { ...base, punitive: false })).toBe(false);
    expect(branch.matches({ punitive: true }, { ...base, punitive: null })).toBe(false);
    expect(branch.matches({ punitive: false }, { ...base, punitive: null })).toBe(true);
  });
});

describe('第 2 集：營運群組決定懲罰性賠償會不會評議', () => {
  const base = { episode: 'ep2', scene: 0, step: 0, choices: {}, cards: [], scenes: {} };
  it('沒進證據不評議；照實交出不加成；硬藏被揭穿加 8', () => {
    expect(punitiveBonus({ ...base, flags: [] }, close)).toBeNull();
    expect(punitiveBonus({ ...base, flags: ['discovery:rq-chat:produced'] }, close)).toBe(0);
    expect(punitiveBonus({ ...base, flags: ['discovery:rq-chat:concealed'] }, close)).toBe(8);
  });
  it('調解室看得到風險區間，以及懲罰性賠償會不會另計', () => {
    expect(trialRisk({ ...base, flags: [] })?.punitive).toBe(false);
    const r = trialRisk({ ...base, flags: ['discovery:rq-chat:produced'] });
    expect(r?.punitive).toBe(true);
    expect(r?.high).toBe(6500000);
  });
});
