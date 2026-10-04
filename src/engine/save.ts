/**
 * 存檔（企劃書 v2.0 第 6.15 節）：每一場結束自動存檔，另有 3 格手動存檔。
 * 存檔帶版本號；結構改變時把 SAVE_VERSION 加一，並在 migrations 補上舊版到新版的轉換與測試，
 * 否則玩家更新後存檔會損毀（製作流程第 8 節，A 類錯誤）。
 */

import { episodes } from '../content';
import { startClosing } from './episode/closing';
import { startDefense } from './episode/defense';
import { startDeposition } from './episode/deposition';
import { startDesk } from './episode/desk';
import { startInterview } from './episode/interview';
import { startNegotiation } from './episode/negotiation';
import type { Episode, Scene } from './episode/schema';
import { startOpening, startTheory } from './episode/theory';
import { startTrial } from './episode/trial';
import { startVoirDire } from './episode/voirdire';

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
  /** 存檔當下的場景 id：劇本增刪場景後，靠它找回原本的場景（舊存檔沒有）。 */
  sceneId?: string;
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
  return check(d);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isStrs = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** 場景的起始狀態，只拿來比對欄位形狀；需要前情的場景用空的陪審團代替。 */
function fresh(s: Scene): unknown {
  switch (s.type) {
    case 'interview':
      return startInterview(s);
    case 'desk':
      return startDesk(s);
    case 'trial':
      return startTrial(s);
    case 'deposition':
      return startDeposition(s);
    case 'voirdire':
      return startVoirDire(s);
    case 'theory':
      return startTheory();
    case 'opening':
      return startOpening();
    case 'defense':
      return startDefense({});
    case 'closing':
      return startClosing({});
    case 'negotiation':
      return startNegotiation(s);
    default:
      return null;
  }
}

/** 起始狀態是陣列的欄位，存檔裡有的話也必須是陣列（舊存檔可能少欄位，少了不算壞）。 */
function shapeOk(s: Scene, st: Record<string, unknown>): boolean {
  let init: unknown;
  try {
    init = fresh(s);
  } catch {
    return true;
  }
  if (!isObj(init)) return true;
  return Object.entries(init).every(
    ([k, v]) => !Array.isArray(v) || st[k] === undefined || Array.isArray(st[k]),
  );
}

/**
 * 遷移後的存檔逐欄檢查，壞掉的當作沒有存檔，免得讀進來整個畫面當掉。
 * 同時用 sceneId 找回場景、把步數夾回範圍內、丟掉超出選項的選擇。
 */
function check(d: SaveFile): SaveFile | null {
  const p = d.progress as unknown;
  if (typeof d.label !== 'string' || !Number.isFinite(d.savedAt) || !isObj(p)) return null;
  if (d.sceneId !== undefined && typeof d.sceneId !== 'string') return null;
  if (typeof p.episode !== 'string' || !Object.hasOwn(episodes, p.episode)) return null;
  const ep: Episode = episodes[p.episode as keyof typeof episodes];
  if (!isIndex(p.scene) || !isIndex(p.step) || !isStrs(p.cards)) return null;
  const flags = p.flags === undefined ? [] : p.flags;
  const ethics = p.ethics === undefined ? [] : p.ethics;
  if (!isStrs(flags) || !isStrs(ethics)) return null;
  const { choices, scenes } = p;
  if (!isObj(choices) || !Object.values(choices).every(isIndex)) return null;
  if (!isObj(scenes) || !Object.values(scenes).every(isObj)) return null;
  const byId = new Map(ep.scenes.map((s, i) => [s.id, i]));
  // 劇本增刪場景後索引會偏：以 sceneId 為準，找不到才退回原索引。
  let scene = p.scene;
  if (d.sceneId && ep.scenes[scene]?.id !== d.sceneId) scene = byId.get(d.sceneId) ?? scene;
  // 等於場景數＝這一集已經演完。
  if (scene > ep.scenes.length) return null;
  for (const [id, st] of Object.entries(scenes as Record<string, Record<string, unknown>>)) {
    const s = ep.scenes[byId.get(id) ?? -1];
    if (s && !shapeOk(s, st)) return null;
  }
  const cur = ep.scenes[scene];
  const step = cur && 'steps' in cur ? Math.min(p.step, cur.steps.length - 1) : p.step;
  const kept = Object.entries(choices as Record<string, number>).filter(([k, v]) => {
    const [id, i] = k.split(':');
    const s = ep.scenes[byId.get(id) ?? -1];
    if (!s) return true;
    const st = 'steps' in s ? s.steps[Number(i)] : undefined;
    return st?.do === 'choose' && v < st.options.length;
  });
  return {
    ...d,
    progress: {
      ...(p as unknown as Progress),
      scene,
      step,
      flags,
      ethics,
      choices: Object.fromEntries(kept),
    },
  };
}

const key = (slot: Slot) => `lawgame-ep-${slot}`;

/** 瀏覽器可能封鎖儲存空間（無痕模式），讀寫失敗時遊戲照常進行，只是沒有存檔。 */
export function readSave(slot: Slot, storage: Storage | undefined = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(key(slot));
    return raw ? migrate(JSON.parse(raw)) : null;
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
  const sceneId = episodes[progress.episode as keyof typeof episodes]?.scenes[progress.scene]?.id;
  const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), label, sceneId, progress };
  try {
    storage?.setItem(key(slot), JSON.stringify(file));
    return !!storage;
  } catch {
    return false;
  }
}
