import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import type { TrialScene } from './episode/schema';
import * as trial from './episode/trial';
import type { Progress } from './save';
import { PRESSURE, RELEASE, ambienceOf, cuesBetween, pressured, soundscape } from './soundscape';

const ep1 = episodes.ep1;
const at = (id: string) => ep1.scenes.findIndex((s) => s.id === id);
const court = ep1.scenes.find((s) => s.id === 'court-rachel') as TrialScene;
const progress = (scene: number, scenes: Progress['scenes'] = {}, step = 0): Progress => ({
  episode: 'ep1',
  scene,
  step,
  choices: {},
  cards: [],
  flags: [],
  ethics: [],
  scenes,
});
const lean = (st: trial.TrialState, v: number): trial.TrialState => ({
  ...st,
  jury: Object.fromEntries(Object.keys(st.jury).map((k) => [k, v])),
});

describe('依場景放什麼', () => {
  it('標題畫面與手機冷開場安靜', () => {
    expect(soundscape('title', progress(at('court-rachel')))).toEqual({
      music: null,
      ambience: null,
      duck: false,
    });
    expect(soundscape('play', progress(0)).music).toBeNull();
  });

  it('只有法庭有音樂；事務所只有環境音', () => {
    const desk = ep1.scenes.findIndex((s) => s.type === 'desk');
    expect(soundscape('play', progress(desk))).toEqual({
      music: null,
      ambience: 'amb_office_day',
      duck: false,
    });
    expect(soundscape('play', progress(at('court-rachel')))).toMatchObject({
      music: 'mus_court',
      ambience: 'amb_court',
    });
  });

  it('結辯放一次結辯曲、環境音壓低；判決出來音樂全抽', () => {
    const i = ep1.scenes.findIndex((s) => s.type === 'closing');
    const id = ep1.scenes[i].id;
    expect(soundscape('play', progress(i))).toEqual({
      music: 'mus_closing',
      ambience: 'amb_court',
      duck: true,
    });
    const after = progress(i, { [id]: { verdict: '無罪' } as never });
    expect(soundscape('play', after)).toEqual({ music: null, ambience: 'amb_court', duck: false });
  });

  it('對白依 place 的關鍵字對環境音', () => {
    expect(ambienceOf('盧卡斯的公寓　深夜')).toBe('amb_office_night');
    expect(ambienceOf('惠特洛克・海爾　影印室　晚上 22:10')).toBe('amb_office_night');
    expect(ambienceOf('卡爾德郡高等法院　第三法庭')).toBe('amb_court');
    expect(ambienceOf('卡爾德郡高等法院　第三法庭外走廊　隔天上午')).toBeNull();
    expect(ambienceOf('惠特洛克・海爾　會議室 A')).toBe('amb_office_day');
    expect(ambienceOf('看守所　會見室')).toBeNull();
  });
});

describe('庭審施壓切換', () => {
  const st = trial.startTrial(court);

  it('異議窗開著就切到施壓曲，關上就回來', () => {
    expect(pressured(court, { ...st, window: true })).toBe(true);
    expect(pressured(court, { ...st, window: false })).toBe(false);
  });

  it('交互詰問：鋪陳好還沒對質算施壓', () => {
    const cross = trial.toCross(court, st);
    const id = court.witness.claims[0].id;
    const ready = {
      ...cross,
      claims: { ...cross.claims, [id]: { ...cross.claims[id], setup: true } },
    };
    expect(pressured(court, lean(ready, 0))).toBe(true);
  });

  it('心證明顯偏向對方才施壓，而且要回落到較低處才解除（不會來回切）', () => {
    const cross = trial.toCross(court, st);
    const t = court.threshold;
    expect(pressured(court, lean(cross, t + PRESSURE))).toBe(true);
    expect(pressured(court, lean(cross, t + PRESSURE - 1))).toBe(false);
    expect(pressured(court, lean(cross, t + PRESSURE - 1), true)).toBe(true);
    expect(pressured(court, lean(cross, t + RELEASE - 1), true)).toBe(false);
  });

  it('這一場結束就不再施壓', () => {
    expect(pressured(court, { ...st, stage: 'done', window: true })).toBe(false);
  });
});

describe('狀態變化帶出的音效', () => {
  const i = at('court-rachel');
  const st = trial.toCross(court, trial.startTrial(court));

  it('彈劾成功：陪審席低語；法官叫停：法槌兩下', () => {
    const a = progress(i, { [court.id]: st });
    expect(cuesBetween(a, progress(i, { [court.id]: { ...st, impeachments: 1 } }))).toEqual([
      'murmur',
    ]);
    expect(cuesBetween(a, progress(i, { [court.id]: { ...st, rebuked: true } }))).toEqual([
      'gavel2',
    ]);
    expect(cuesBetween(a, a)).toEqual([]);
  });

  it('證據板：連線成功釘圖釘，拿到新卡蓋章', () => {
    const d = ep1.scenes.findIndex((s) => s.type === 'desk');
    const id = ep1.scenes[d].id;
    const a = progress(d, { [id]: { found: [] } as never });
    expect(cuesBetween(a, progress(d, { [id]: { found: ['l1'] } as never }))).toEqual(['pin']);
    expect(cuesBetween(a, { ...a, cards: ['x'] })).toEqual(['found']);
  });

  it('手機：走到通知那一步就震一下', () => {
    const p = ep1.scenes.findIndex((s) => s.type === 'phone');
    const s = ep1.scenes[p];
    if (s.type !== 'phone') throw new Error('no phone');
    const n = s.steps.findIndex((x) => x.do === 'notify');
    expect(n).toBeGreaterThan(0);
    expect(cuesBetween(progress(p, {}, n - 1), progress(p, {}, n))).toEqual(['notify']);
  });
});
