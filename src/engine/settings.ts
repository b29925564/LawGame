import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 輔助選項（企劃書 6.14）。全部存在瀏覽器裡，和存檔分開。 */
export interface Settings {
  /** 異議窗秒數；0 代表回合制（不計時）。 */
  objectionSeconds: number;
  showNumbers: boolean;
  /** 字級倍率。 */
  textScale: number;
  /** 聲音總開關。 */
  sound: boolean;
  /** 音量（0–1）：總音量、音樂、音效、環境音。 */
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  /** 畫外字幕：出完字停留後自動前進。 */
  voAuto: boolean;
  /** 畫外字幕字級：1／1.25／1.5。 */
  voScale: number;
  /** 畫外字幕底框（字幕帶太亮時更好讀）。 */
  voBox: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      objectionSeconds: 0,
      showNumbers: false,
      textScale: 1,
      sound: true,
      master: 0.8,
      music: 0.6,
      sfx: 0.8,
      ambience: 0.5,
      voAuto: true,
      voScale: 1,
      voBox: false,
      set: (patch) => set(patch),
    }),
    { name: 'lawgame-settings', version: 1 },
  ),
);
