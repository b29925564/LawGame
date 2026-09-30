import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 輔助選項（企劃書 6.14）。全部存在瀏覽器裡，和存檔分開。 */
export interface Settings {
  /** 異議窗秒數；0 代表回合制（不計時）。 */
  objectionSeconds: number;
  showNumbers: boolean;
  /** 字級倍率。 */
  textScale: number;
  sound: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      objectionSeconds: 0,
      showNumbers: false,
      textScale: 1,
      sound: true,
      set: (patch) => set(patch),
    }),
    { name: 'lawgame-settings', version: 1 },
  ),
);
