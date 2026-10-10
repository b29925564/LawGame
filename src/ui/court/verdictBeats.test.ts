import { describe, expect, it } from 'vitest';
import { beatsOf, landingAt, type Tokens } from './verdictBeats';

const K: Tokens = {
  lead: 1300,
  hand: 600,
  lift: 300,
  settle: 500,
  cutBlack: 83,
  redactOut: 500,
  redactIn: 167,
  turn: 1500,
  lightMove: 400,
  frame: 1000 / 24,
};
const tick = { u: 1, lifts: 0, any: true };

describe('判決四拍（設定集 10.5 時間碼）', () => {
  it('無罪：勾 → 2.400 切黑，2.483 筆錄，2.983 黑條動，抽到 12/12 在 3.483，字卡 3.966–5.466，窗光 5.549', () => {
    const b = beatsOf('無罪', tick, K);
    expect([b.black, b.record, b.pull, b.pullEnd]).toEqual([2400, 2483, 2983, 3483]);
    expect(b.stop).toBe(12);
    expect(b.card).toEqual([3966, 5466]);
    expect(b.light).toBe(5549);
    expect(b.recover).toBeNull();
  });

  it('有罪：抽完再蓋第 22 行 3.883–4.050，字卡 4.866–6.366，窗光 6.449', () => {
    const b = beatsOf('有罪', tick, K);
    expect(b.pullEnd).toBe(3483);
    expect(b.recover).toEqual([3883, 4050]);
    expect(b.card).toEqual([4866, 6366]);
    expect(b.light).toBe(6449);
  });

  it('僵局：寫「未達一致」四個字，②③④ 往後推 1.8 秒；黑條抽到 6/12 停在 250ms 後', () => {
    const end = { u: 4, lifts: 0, any: true };
    const b = beatsOf('陪審團僵局', end, K);
    expect(b.black).toBe(4200);
    expect(b.stop).toBe(6);
    expect(Math.round(b.pullEnd - b.pull)).toBe(250);
    const tickCase = beatsOf('陪審團僵局', tick, K);
    expect(Math.round(b.card[0] - tickCase.card[0])).toBe(1800);
  });

  it('落點照設定集座標：被告席、桌角、走道由左到右', () => {
    expect(landingAt('無罪')).toBeLessThan(landingAt('有罪'));
    expect(landingAt('有罪')).toBeLessThan(landingAt('陪審團僵局'));
  });
});
