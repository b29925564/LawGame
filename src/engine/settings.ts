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
  /** 片頭看過的集（設定集 11.1：第二次播起可以跳過）。key 是集 id（ep1、ep2）。 */
  introSeen: Record<string, boolean>;
  /**
   * 第一次用過就不再出現的操作說明（使用者 11-13：機制只在第一次出現時教，之後靠介面自己說話）。
   * key 見 ui/taught.ts。
   */
  taught: Record<string, boolean>;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

type Values = Omit<Settings, 'set'>;

export const DEFAULTS: Values = {
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
  introSeen: {},
  taught: {},
};

const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const oneOf = <T>(v: unknown, ok: readonly T[], d: T) => (ok.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const flags = (v: unknown): Record<string, boolean> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'boolean'))
    : {};

/**
 * 從瀏覽器讀回來的設定逐欄檢查：型別不對用預設值，數字夾回設定頁允許的範圍。
 * 手改過或舊版結構的設定不能讓畫面丟錯（壞設定會讓每次「新遊戲」都回標題）。
 */
export function cleanSettings(raw: unknown): Values {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULTS;
  return {
    objectionSeconds: oneOf(r.objectionSeconds, [0, 4, 8, 12], d.objectionSeconds),
    showNumbers: bool(r.showNumbers, d.showNumbers),
    textScale: num(r.textScale, 0.9, 1.5, d.textScale),
    sound: bool(r.sound, d.sound),
    master: num(r.master, 0, 1, d.master),
    music: num(r.music, 0, 1, d.music),
    sfx: num(r.sfx, 0, 1, d.sfx),
    ambience: num(r.ambience, 0, 1, d.ambience),
    voAuto: bool(r.voAuto, d.voAuto),
    voScale: oneOf(r.voScale, [1, 1.25, 1.5], d.voScale),
    voBox: bool(r.voBox, d.voBox),
    introSeen: flags(r.introSeen),
    taught: flags(r.taught),
  };
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
    }),
    {
      name: 'lawgame-settings',
      version: 1,
      merge: (persisted, current) => ({ ...current, ...cleanSettings(persisted) }),
    },
  ),
);
