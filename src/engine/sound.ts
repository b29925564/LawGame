import { useSettings } from './settings';

/**
 * 聲音：三條匯流排（音樂、音效、環境音）接到總音量。音檔在 src/audio/（授權見 LICENSES.md），
 * 第一次用到才下載解碼；還沒載好、或瀏覽器沒有 AudioContext 時，音效退回即時合成，音樂與環境音就安靜。
 * 哪個場景放什麼由 soundscape.ts 決定，這裡只管播。
 */
export type Cue =
  | 'type'
  | 'notify'
  | 'gavel'
  | 'gavel2'
  | 'object'
  | 'mark'
  | 'page'
  | 'folder'
  | 'pin'
  | 'found'
  | 'murmur';

export type Music = 'mus_court' | 'mus_court_tense' | 'mus_closing';
export type Ambience = 'amb_office_day' | 'amb_office_night' | 'amb_court';
type Bus = 'music' | 'sfx' | 'ambience';

const files = import.meta.glob<string>('../audio/*.m4a', {
  eager: true,
  query: '?url',
  import: 'default',
});
const urlOf = (name: string) => files[`../audio/${name}.m4a`];

/** 每個音效用哪些檔（多個就隨機輪流）；沒有檔的退回合成。 */
const samples: Partial<Record<Cue, string[]>> = {
  notify: ['ui_phone_buzz'],
  gavel: ['court_gavel_1'],
  gavel2: ['court_gavel_2'],
  object: ['court_rise'],
  mark: ['ui_mark_1', 'ui_mark_2'],
  page: ['ui_page_1', 'ui_page_2'],
  folder: ['ui_folder'],
  pin: ['ui_pin'],
  found: ['ui_found'],
  murmur: ['court_murmur'],
};

/** 環境音可以是幾條一起循環（法庭：底噪＋人聲，長度不同，疊起來聽不出重複）。 */
const beds: Record<Ambience, string[]> = {
  amb_office_day: ['amb_office_day'],
  amb_office_night: ['amb_office_night'],
  amb_court: ['amb_court_bed', 'amb_court_murmur'],
};

/** 只播一次的曲子；其他都循環。 */
const ONCE: Music[] = ['mus_closing'];
/** 音樂切換的交叉淡入秒數（兩首調性速度不同，只能切換，不能疊）。 */
export const FADE = 2;
/** 結辯時環境音壓低到這個比例。 */
const DUCK = 0.35;

const synth: Record<Cue, { freq: number; to: number; secs: number; type: OscillatorType }> = {
  type: { freq: 420, to: 380, secs: 0.04, type: 'square' },
  notify: { freq: 880, to: 1180, secs: 0.16, type: 'sine' },
  gavel: { freq: 180, to: 60, secs: 0.22, type: 'triangle' },
  gavel2: { freq: 180, to: 60, secs: 0.22, type: 'triangle' },
  object: { freq: 300, to: 520, secs: 0.12, type: 'sawtooth' },
  mark: { freq: 660, to: 700, secs: 0.07, type: 'sine' },
  page: { freq: 520, to: 480, secs: 0.05, type: 'sine' },
  folder: { freq: 240, to: 200, secs: 0.08, type: 'triangle' },
  pin: { freq: 900, to: 860, secs: 0.05, type: 'sine' },
  found: { freq: 520, to: 780, secs: 0.14, type: 'sine' },
  murmur: { freq: 200, to: 180, secs: 0.3, type: 'sine' },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buses: Partial<Record<Bus, GainNode>> = {};
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const turn: Partial<Record<Cue, number>> = {};

interface Playing {
  key: string;
  /** 這一組用到的音檔。 */
  names: string[];
  gain: GainNode;
  sources: AudioBufferSourceNode[];
}
let music: Playing | null = null;
let ambience: Playing | null = null;
let ducked = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const b of ['music', 'sfx', 'ambience'] as Bus[]) {
      buses[b] = ctx.createGain();
      buses[b]!.connect(master);
    }
    applyVolumes();
    useSettings.subscribe(applyVolumes);
    // 切到別的分頁就停，回來再接著放。
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx?.suspend();
      else void ctx?.resume();
    });
    return ctx;
  } catch {
    return null;
  }
}

/** 總開關與四個滑桿；改了立刻生效。 */
function applyVolumes() {
  if (!ctx || !master) return;
  const s = useSettings.getState();
  const now = ctx.currentTime;
  master.gain.setTargetAtTime(s.sound ? s.master : 0, now, 0.05);
  buses.music?.gain.setTargetAtTime(s.music, now, 0.05);
  buses.sfx?.gain.setTargetAtTime(s.sfx, now, 0.05);
  buses.ambience?.gain.setTargetAtTime(s.ambience * (ducked ? DUCK : 1), now, 0.3);
}

function load(name: string): Promise<AudioBuffer | null> {
  const url = urlOf(name);
  const c = context();
  if (!url || !c) return Promise.resolve(null);
  let p = buffers.get(name);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

/**
 * 瀏覽器要一次使用者手勢才肯出聲：標題畫面第一個按鈕呼叫一次。
 * 順便先把常用的短音效載好，第一下就不會退回合成。
 */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  void c.resume();
  for (const names of Object.values(samples)) for (const n of names) void load(n);
  // 音樂與環境音跟著遊戲狀態走；動態載入避免 sound ↔ game 互相引用。
  void import('./soundscape').then((m) => m.start());
}

function blip(c: AudioContext, cue: Cue) {
  const v = synth[cue];
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = v.type;
  osc.frequency.setValueAtTime(v.freq, now);
  osc.frequency.exponentialRampToValueAtTime(v.to, now + v.secs);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + v.secs);
  osc.connect(gain).connect(buses.sfx ?? c.destination);
  osc.start(now);
  osc.stop(now + v.secs);
}

/** 播一個音效。失敗就安靜地不出聲，不影響遊戲。 */
export function play(cue: Cue) {
  if (!useSettings.getState().sound) return;
  const c = context();
  if (!c) return;
  try {
    void c.resume();
    const names = samples[cue];
    if (!names) return blip(c, cue);
    const i = turn[cue] ?? Math.floor(Math.random() * names.length);
    turn[cue] = (i + 1) % names.length;
    const name = names[i];
    const started = performance.now();
    void load(name).then((buf) => {
      // 還沒載好（或載不到）就用合成音頂著；載太久才到的就不補播，免得跟畫面對不上。
      if (!buf) return blip(c, cue);
      if (performance.now() - started > 400) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(buses.sfx!);
      src.start();
    });
  } catch {
    /* 沒有音效不影響遊戲。 */
  }
}

/** 正在播（或剛要求要播）的音樂與環境音檔名。 */
function playingNames(): string[] {
  return [...(music?.names ?? []), ...(ambience?.names ?? [])];
}

/**
 * 淡出結束後要不要把解碼好的音檔丟掉：音樂、環境音很大（全部約 59 MB），不在播就釋放，
 * 下次用到再下載解碼；短音效一直留著（上線前審查 P2）。
 */
export function evictable(name: string, playing: string[]): boolean {
  return (name.startsWith('mus_') || name.startsWith('amb_')) && !playing.includes(name);
}

/** 淡掉並停掉一組正在播的聲音；淡完拆掉它的 GainNode，用不到的音檔也釋放。 */
function fadeOut(c: AudioContext, p: Playing | null, secs = FADE) {
  if (!p) return;
  const now = c.currentTime;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(p.gain.gain.value, now);
  p.gain.gain.linearRampToValueAtTime(0, now + secs);
  for (const s of p.sources)
    try {
      s.stop(now + secs + 0.05);
    } catch {
      /* 已經播完的單次曲子。 */
    }
  // 用一段無聲的來源當計時器：跟著音訊時鐘走，分頁暫停時淡出也跟著暫停，不會提早拆掉。
  const timer = c.createBufferSource();
  timer.buffer = c.createBuffer(1, 1, c.sampleRate);
  timer.loop = true;
  timer.connect(p.gain);
  timer.onended = () => {
    p.gain.disconnect();
    const keep = playingNames();
    for (const n of p.names) if (evictable(n, keep)) buffers.delete(n);
  };
  timer.start(now);
  timer.stop(now + secs + 0.1);
}

/** 換成另一組（同一組就不動）；names 依序全部一起開始。 */
function swap(
  bus: Bus,
  current: Playing | null,
  key: string | null,
  names: string[],
  loop: boolean,
  done: (p: Playing | null) => void,
) {
  const c = context();
  if (!c || (current?.key ?? null) === key) return;
  fadeOut(c, current);
  if (!key) return done(null);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(buses[bus]!);
  const next: Playing = { key, names, gain, sources: [] };
  done(next);
  void Promise.all(names.map(load)).then((bufs) => {
    // 載好之前又換了場景，就不播了。
    if ((bus === 'music' ? music : ambience) !== next) return;
    const now = c.currentTime;
    for (const buf of bufs) {
      if (!buf) continue;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.connect(gain);
      src.start(now);
      next.sources.push(src);
    }
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE);
  });
}

/** 音樂：null＝不放。只播一次的曲子放完就停在那裡，直到換成別首。 */
export function setMusic(key: Music | null) {
  swap('music', music, key, key ? [key] : [], !key || !ONCE.includes(key), (p) => (music = p));
}

/** 環境音：null＝不放；duck＝壓低（結辯時讓位給音樂）。 */
export function setAmbience(key: Ambience | null, duck = false) {
  swap('ambience', ambience, key, key ? beds[key] : [], true, (p) => (ambience = p));
  if (duck !== ducked) {
    ducked = duck;
    applyVolumes();
  }
}
