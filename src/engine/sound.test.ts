import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** 假的 Web Audio：只記下 sound.ts 會用到的呼叫，淡出計時器由測試手動結束。 */
const sources: { onended: (() => void) | null; stopped: boolean }[] = [];
const gains: { disconnect: ReturnType<typeof vi.fn> }[] = [];
const param = () => ({
  value: 0,
  setTargetAtTime() {},
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  cancelScheduledValues() {},
});
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  createGain() {
    const g = { gain: param(), connect: (n: unknown) => n, disconnect: vi.fn() };
    gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = {
      buffer: null,
      loop: false,
      onended: null,
      stopped: false,
      connect: (n: unknown) => n,
      start() {},
      stop() {
        s.stopped = true;
      },
    };
    sources.push(s);
    return s;
  }
  createBuffer() {
    return {};
  }
  decodeAudioData() {
    return Promise.resolve({});
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
}
const fetched: string[] = [];
const fetchCount = (name: string) => fetched.filter((u) => u.includes(`/${name}.m4a`)).length;
/** 讓排程好的 then 都跑完。 */
const settle = () => new Promise((r) => setTimeout(r, 0));
/** 音訊時鐘走到淡出結束：已經停掉的來源都觸發 ended。 */
const fadeDone = () => {
  for (const s of sources.splice(0)) if (s.stopped) s.onended?.();
};

beforeAll(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', (url: string) => {
    fetched.push(url);
    return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  });
});
afterAll(() => vi.unstubAllGlobals());

describe('解碼音檔的快取', () => {
  it('只有不在播的音樂、環境音會被釋放', async () => {
    const { evictable } = await import('./sound');
    expect(evictable('mus_court', [])).toBe(true);
    expect(evictable('amb_court_bed', ['mus_court'])).toBe(true);
    expect(evictable('mus_court', ['mus_court', 'amb_court_bed'])).toBe(false);
    expect(evictable('amb_court_murmur', ['amb_court_bed', 'amb_court_murmur'])).toBe(false);
    // 短音效一直留著（court_murmur 是音效，不是環境音）。
    expect(evictable('court_murmur', [])).toBe(false);
    expect(evictable('ui_page_1', [])).toBe(false);
  });

  it('換曲淡出結束後拆掉舊的 GainNode、釋放舊曲；音效不重新下載', async () => {
    const { play, setMusic, setAmbience } = await import('./sound');
    play('gavel');
    setMusic('mus_court');
    setAmbience('amb_court');
    await settle();
    const courtGain = gains.at(-2)!;

    setMusic('mus_court_tense');
    setAmbience('amb_office_day');
    await settle();
    expect(courtGain.disconnect).not.toHaveBeenCalled();
    fadeDone();
    expect(courtGain.disconnect).toHaveBeenCalled();

    // 回到法庭：音樂和兩條環境音都得重新下載解碼。
    setMusic('mus_court');
    setAmbience('amb_court');
    await settle();
    expect(fetchCount('mus_court')).toBe(2);
    expect(fetchCount('amb_court_bed')).toBe(2);
    expect(fetchCount('amb_court_murmur')).toBe(2);

    // 音效還在快取裡。
    play('gavel');
    await settle();
    expect(fetchCount('court_gavel_1')).toBe(1);
  });

  it('淡出途中又換回來的曲子不釋放', async () => {
    const { setMusic } = await import('./sound');
    setMusic('mus_closing');
    await settle();
    fadeDone(); // 之前淡出的都淡完，釋放
    setMusic('mus_court');
    await settle();
    const before = fetchCount('mus_court');
    fadeDone(); // mus_closing 淡完；mus_court 正在播，留著
    setMusic('mus_closing');
    setMusic('mus_court');
    await settle();
    fadeDone();
    expect(fetchCount('mus_court')).toBe(before);
    setMusic(null);
    setMusic('mus_court');
    await settle();
    expect(fetchCount('mus_court')).toBe(before);
  });
});
