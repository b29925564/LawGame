import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSave, writeSave } from '../save';
import { useEpisode } from '../game';

/** 測試環境沒有 localStorage，用記憶體版代替。 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('自動存檔與讀檔', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  const midScene = () => {
    useEpisode.getState().newGame('ep1');
    const p = useEpisode.getState().progress;
    const progress = { ...p, step: 2, choices: { 'x:1': 0 }, cards: ['some-card'] };
    useEpisode.setState({ progress });
    return progress;
  };

  it('遊玩中回標題，自動存檔記下這一場進行到一半的進度', () => {
    const progress = midScene();
    useEpisode.getState().toTitle();
    expect(useEpisode.getState().mode).toBe('title');
    expect(readSave('auto')?.progress).toEqual(progress);
  });

  it('從原型模式回標題不寫自動存檔', () => {
    midScene();
    useEpisode.setState({ mode: 'proto' });
    useEpisode.getState().toTitle();
    expect(readSave('auto')).toBeNull();
  });

  it('每次讀檔 loadId 都加一，讀檔失敗不變', () => {
    const progress = midScene();
    writeSave(1, 'x', progress);
    const before = useEpisode.getState().loadId;
    expect(useEpisode.getState().load(1)).toBe(true);
    expect(useEpisode.getState().load(1)).toBe(true);
    expect(useEpisode.getState().loadId).toBe(before + 2);
    expect(useEpisode.getState().load(2)).toBe(false);
    expect(useEpisode.getState().loadId).toBe(before + 2);
  });
});
