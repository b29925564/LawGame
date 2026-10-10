/**
 * 存檔（企劃書 v2.0 第 6.15 節）：每一場結束自動存檔，另有 3 格手動存檔。
 * 存檔帶版本號；結構改變時把 SAVE_VERSION 加一，並在 migrations 補上舊版到新版的轉換與測試，
 * 否則玩家更新後存檔會損毀（製作流程第 8 節，A 類錯誤）。
 */

export interface Progress {
  episode: string;
  scene: number;
  step: number;
  /** 玩家做過的選擇，鍵是「場景 id:步數」。 */
  choices: Record<string, number>;
  /** 帶著走的卡片與論點（跨場景）。 */
  cards: string[];
  /** 對話選項記下的旗標（跨場景、跨集）。舊存檔沒有這個欄位。 */
  flags?: string[];
  /** 倫理紀錄（企劃書 6.12）：玩家看不到的帳本，記下越過的每一條線。 */
  ethics?: string[];
  /** 各場景的進行狀態，鍵是場景 id。 */
  scenes: Record<string, unknown>;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  label: string;
  progress: Progress;
}

export const SAVE_VERSION = 5;
export const SLOTS = [1, 2, 3] as const;
export type Slot = 'auto' | (typeof SLOTS)[number];

/** migrations[n] 把第 n 版的存檔轉成第 n + 1 版。 */
const migrations: Record<number, (d: SaveFile) => SaveFile> = {
  // v4 還沒有旗標與倫理紀錄，補上空陣列。
  4: (d) => ({ ...d, version: 5, progress: { ...d.progress, flags: [], ethics: [] } }),
  // v3 的推理鏈是一步到位（卡片＋關係）；v4 拆成「連線」與「回答疑問」兩步。
  // 已確認的疑問保留，還沒提交的草稿清空（舊草稿放的是卡片，新版要放發現）。
  3: (d) => ({
    ...d,
    version: 4,
    progress: {
      ...d.progress,
      scenes: Object.fromEntries(
        Object.entries(d.progress.scenes ?? {}).map(([k, v]) => [
          k,
          v && typeof v === 'object' && 'hours' in v
            ? {
                ...v,
                attempts: {},
                link: { cards: [], relation: null },
                found: [],
                badLinks: 0,
                linkNote: null,
              }
            : v,
        ]),
      ),
    },
  }),
  // v1 的存檔只有場景與步數，補上卡片與各場景狀態的預設值。
  // v2 的桌面狀態還沒有時間線，補上空陣列。
  2: (d) => ({
    ...d,
    version: 3,
    progress: {
      ...d.progress,
      scenes: Object.fromEntries(
        Object.entries(d.progress.scenes ?? {}).map(([k, v]) => [
          k,
          v && typeof v === 'object' && 'hours' in v ? { timeline: [], ...v } : v,
        ]),
      ),
    },
  }),
  1: (d) => ({
    ...d,
    version: 2,
    progress: { ...d.progress, cards: d.progress.cards ?? [], scenes: d.progress.scenes ?? {} },
  }),
};

export function migrate(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== 'object') return null;
  let d = raw as SaveFile;
  if (typeof d.version !== 'number' || d.version > SAVE_VERSION) return null;
  while (d.version < SAVE_VERSION) {
    const step = migrations[d.version];
    if (!step) return null;
    d = step(d);
  }
  const p = d.progress;
  if (!p || typeof p.episode !== 'string' || typeof p.scene !== 'number') return null;
  return d;
}

const key = (slot: Slot) => `lawgame-ep-${slot}`;

/** 瀏覽器可能封鎖儲存空間（無痕模式），讀寫失敗時遊戲照常進行，只是沒有存檔。 */
export function readSave(slot: Slot, storage: Storage | undefined = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(key(slot));
    const file = raw ? migrate(JSON.parse(raw)) : null;
    // 舊版集尾存檔的標籤是「第 1 集・第 1 集」。
    if (file) file.label = file.label.replace(/^(第 (\d+) 集)・第 \2 集$/, '$1・本集完');
    return file;
  } catch {
    return null;
  }
}

export function writeSave(
  slot: Slot,
  label: string,
  progress: Progress,
  storage: Storage | undefined = globalThis.localStorage,
): boolean {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), label, progress };
  try {
    storage?.setItem(key(slot), JSON.stringify(file));
    return !!storage;
  } catch {
    return false;
  }
}
