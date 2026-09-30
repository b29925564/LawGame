import { useSettings } from './settings';

/**
 * 音效全部即時合成，不放音檔：垂直切片階段不必處理素材授權，
 * 之後換成 CC0 素材時只要改這一個模組（製作流程第 4 節）。
 */
export type Cue = 'type' | 'notify' | 'gavel' | 'object' | 'mark';

let ctx: AudioContext | null = null;

const voices: Record<Cue, { freq: number; to: number; secs: number; type: OscillatorType }> = {
  type: { freq: 420, to: 380, secs: 0.04, type: 'square' },
  notify: { freq: 880, to: 1180, secs: 0.16, type: 'sine' },
  gavel: { freq: 180, to: 60, secs: 0.22, type: 'triangle' },
  object: { freq: 300, to: 520, secs: 0.12, type: 'sawtooth' },
  mark: { freq: 660, to: 700, secs: 0.07, type: 'sine' },
};

/** 瀏覽器可能擋掉音訊，或根本沒有 AudioContext；失敗就安靜地不出聲。 */
export function play(cue: Cue) {
  if (!useSettings.getState().sound) return;
  try {
    const AC =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    void ctx.resume();
    const v = voices[cue];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, now);
    osc.frequency.exponentialRampToValueAtTime(v.to, now + v.secs);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + v.secs);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + v.secs);
  } catch {
    /* 沒有音效不影響遊戲。 */
  }
}
