import { describe, expect, it, vi } from 'vitest';
import { cleanSettings, DEFAULTS } from './settings';

describe('設定讀回來逐欄檢查', () => {
  it.each([
    ['introSeen 是 null', { introSeen: null }],
    ['taught 是 null', { taught: null }],
    ['taught 是陣列', { taught: ['link'] }],
    ['字級是字串', { textScale: '3' }],
    ['音量是 NaN', { master: Number.NaN }],
    ['異議窗不是選項', { objectionSeconds: 5 }],
    ['字幕字級不是選項', { voScale: 2 }],
    ['開關是字串', { sound: 'yes', voAuto: 1 }],
  ])('%s：回到預設值', (_, bad) => {
    expect(cleanSettings(bad)).toEqual(DEFAULTS);
  });

  it('數字夾回設定頁的範圍', () => {
    const s = cleanSettings({ textScale: 9, master: -1, music: 2 });
    expect(s.textScale).toBe(1.5);
    expect(s.master).toBe(0);
    expect(s.music).toBe(1);
    expect(cleanSettings({ textScale: 0.1 }).textScale).toBe(0.9);
  });

  it('合法的值照留；旗標表裡不是布林的鍵丟掉', () => {
    const ok = {
      ...DEFAULTS,
      objectionSeconds: 8,
      textScale: 1.3,
      voScale: 1.25,
      showNumbers: true,
      introSeen: { ep1: true, ep2: 'x' },
      taught: { link: true },
    };
    expect(cleanSettings(ok)).toEqual({ ...ok, introSeen: { ep1: true } });
  });

  it('不是物件（null、字串）就全用預設值', () => {
    expect(cleanSettings(null)).toEqual(DEFAULTS);
    expect(cleanSettings('x')).toEqual(DEFAULTS);
  });

  it('瀏覽器裡存著壞設定時，讀進來的是合法值', async () => {
    const m = new Map([
      [
        'lawgame-settings',
        JSON.stringify({ state: { introSeen: null, taught: null, textScale: 'x' }, version: 1 }),
      ],
    ]);
    const ls = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    // zustand 的 persist 讀的是 window.localStorage。
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('window', { localStorage: ls });
    vi.resetModules();
    const { useSettings } = await import('./settings');
    expect(useSettings.persist.hasHydrated()).toBe(true);
    const s = useSettings.getState();
    expect(s.introSeen).toEqual({});
    expect(s.taught).toEqual({});
    expect(s.textScale).toBe(1);
    expect(typeof s.set).toBe('function');
    vi.unstubAllGlobals();
  });
});

describe('原型進度讀回來的形狀檢查', () => {
  it('壞掉的原型進度重來，好的照留', async () => {
    const { protoOk, useGame } = await import('./store');
    expect(protoOk(null)).toBe(false);
    expect(protoOk({ phase: 'x', board: {} })).toBe(false);
    expect(protoOk({ phase: 'board', board: null })).toBe(false);
    const { phase, board, cross, feedback } = useGame.getState();
    expect(protoOk({ phase, board, cross, feedback })).toBe(true);
    expect(protoOk({ phase, board: { ...board, timeline: null }, cross, feedback })).toBe(false);
  });
});
