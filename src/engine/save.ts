/**
 * 存檔（企劃書 v2.0 第 6.15 節）：每一場結束自動存檔，另有 3 格手動存檔。
 * 存檔帶版本號；結構改變時把 SAVE_VERSION 加一，並在 migrations 補上舊版到新版的轉換與測試，
 * 否則玩家更新後存檔會損毀（製作流程第 8 節，A 類錯誤）。
 */

import { episodes, isEpisodeId } from '../content';
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
  /** 存檔當下的場景 id：劇本增刪場景後，靠它找回原本的場景（舊存檔沒有，選填所以不必升版）。 */
  sceneId?: string;
  /**
   * 每一筆選擇當時選的那句選項原文（鍵同 progress.choices）。劇本在選擇步前插台詞、或在選項中間插新選項，
   * 索引會錯位：讀檔時靠原文找回同一句。選填，舊存檔沒有就照索引讀。
   */
  picks?: Record<string, string>;
  /** 存檔當下那一步的原文（台詞、提示或第一個選項）：劇本在前面插台詞時，靠它找回同一步。選填。 */
  stepText?: string;
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

export function migrate(raw: unknown, eps: Episodes = episodes): SaveFile | null {
  if (!raw || typeof raw !== 'object') return null;
  let d = raw as SaveFile;
  if (typeof d.version !== 'number' || d.version > SAVE_VERSION) return null;
  while (d.version < SAVE_VERSION) {
    const step = migrations[d.version];
    if (!step) return null;
    d = step(d);
  }
  return check(d, eps);
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

/** 電話與對話場景的最後一個合法步數；對話演完後的文件照片頁停在 steps.length。 */
function lastStep(s: Scene | undefined): number | null {
  if (!s || (s.type !== 'phone' && s.type !== 'dialogue')) return null;
  return s.type === 'dialogue' && s.photos ? s.steps.length : s.steps.length - 1;
}

/**
 * 遷移後的存檔逐欄檢查，壞掉的當作沒有存檔，免得讀進來整個畫面當掉。
 * 同時用 sceneId 找回場景、把步數夾回範圍內、丟掉超出選項的選擇。
 */
function check(d: SaveFile, eps: Episodes): SaveFile | null {
  const p = d.progress as unknown;
  if (typeof d.label !== 'string' || !Number.isFinite(d.savedAt) || !isObj(p)) return null;
  if (d.sceneId !== undefined && typeof d.sceneId !== 'string') return null;
  if (typeof p.episode !== 'string') return null;
  // 劇本依集數動態載入（#388）：還沒載入的集數只做結構檢查（空劇本＝不對場景、步數、選擇動手），
  // 開始玩之前載入後會再完整檢查一次。
  const known = Object.hasOwn(eps, p.episode);
  if (!known && !isEpisodeId(p.episode)) return null;
  const ep: Episode = known ? eps[p.episode] : UNLOADED;
  const picks = isObj(d.picks) ? d.picks : {};
  if (!isIndex(p.scene) || !isIndex(p.step) || !isStrs(p.cards)) return null;
  const flags = p.flags === undefined ? [] : p.flags;
  const ethics = p.ethics === undefined ? [] : p.ethics;
  if (!isStrs(flags) || !isStrs(ethics)) return null;
  const { choices, scenes } = p;
  if (!isObj(choices)) return null;
  if (!isObj(scenes) || !Object.values(scenes).every(isObj)) return null;
  const byId = new Map(ep.scenes.map((s, i) => [s.id, i]));
  // 劇本增刪場景後索引會偏：以 sceneId 為準，找不到才退回原索引。
  let scene = p.scene;
  if (d.sceneId && ep.scenes[scene]?.id !== d.sceneId) scene = byId.get(d.sceneId) ?? scene;
  // 大於等於場景數＝這一集已經演完（sceneOf 回 null），遊戲本來就這樣讀，不算壞檔，也不改它。
  for (const [id, st] of Object.entries(scenes as Record<string, Record<string, unknown>>)) {
    const s = ep.scenes[byId.get(id) ?? -1];
    if (s && !shapeOk(s, st)) return null;
  }
  const cur = ep.scenes[scene];
  const last = lastStep(cur);
  let step = last === null ? p.step : Math.min(p.step, last);
  // 劇本在這一步前面插了台詞：靠原文找回同一步（同一句出現多次就挑離原位最近的）。
  if (cur && 'steps' in cur && typeof d.stepText === 'string') {
    const near = nearest(
      cur.steps.map((x) => stepTextOf(x)),
      d.stepText,
      step,
    );
    if (near !== null) step = near;
  }
  // 選擇：先看原位那一步的同一個索引是不是當時那句；不是就在同一場裡找那句原文，換成新的步數與索引。
  // 原文找不到（改寫過）但原位仍是選擇步、索引在範圍內，照索引讀。個別壞掉的只丟那一筆，不廢整個存檔。
  const kept: [string, number][] = [];
  for (const [k, v] of Object.entries(choices)) {
    if (!isIndex(v)) continue;
    const [id, i] = k.split(':');
    const s = ep.scenes[byId.get(id) ?? -1];
    if (!s) {
      kept.push([k, v]);
      continue;
    }
    if (!('steps' in s)) continue;
    const steps = s.steps as Step[];
    const text = typeof picks[k] === 'string' ? (picks[k] as string) : null;
    const at = steps[Number(i)];
    if (at?.do === 'choose' && v < at.options.length && (!text || at.options[v].text === text)) {
      kept.push([k, v]);
      continue;
    }
    if (text) {
      const found = nearest(
        steps.map((x) =>
          x.do === 'choose' && x.options.some((o) => o.text === text) ? text : null,
        ),
        text,
        Number(i),
      );
      if (found !== null) {
        const opts = steps[found].options;
        kept.push([`${id}:${found}`, opts.findIndex((o: { text: string }) => o.text === text)]);
        continue;
      }
    }
    if (at?.do === 'choose' && v < at.options.length) kept.push([k, v]);
  }
  return {
    ...d,
    progress: {
      ...(p as unknown as Progress),
      scene,
      step,
      flags,
      ethics,
      choices: Object.fromEntries(kept),
      scenes: fixIndexes(ep, scenes as Record<string, Record<string, unknown>>, byId),
    },
  };
}

type Episodes = Record<string, Episode>;
const UNLOADED = { scenes: [] } as unknown as Episode;
type Step = { do: string; text?: string; prompt?: string; options: { text: string }[] };

/** 一步的原文指紋：台詞、提示或第一個選項。 */
function stepTextOf(x: unknown): string | null {
  const st = x as Partial<Step>;
  return st.text ?? st.prompt ?? st.options?.[0]?.text ?? null;
}

/** 在 list 裡找值等於 want、離 from 最近的位置。 */
function nearest(list: (string | null)[], want: string, from: number): number | null {
  let best: number | null = null;
  list.forEach((x, i) => {
    if (x === want && (best === null || Math.abs(i - from) < Math.abs(best - from))) best = i;
  });
  return best;
}

/**
 * 場景內的索引夾回範圍：劇本刪了題目，庭審的主詰問題號、錄取（對方主導）的題號會超出去。
 * 庭審存檔時異議窗開著、那一題又不見了，就把窗關上，讀回來由下一題重新開始。
 */
function fixIndexes(
  ep: Episode,
  scenes: Record<string, Record<string, unknown>>,
  byId: Map<string, number>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(scenes).map(([id, st]) => {
      const s = ep.scenes[byId.get(id) ?? -1];
      if (!s || typeof st.i !== 'number') return [id, st];
      if (s.type === 'trial') {
        const n = s.witness.direct.length;
        const i = Math.max(0, Math.min(st.i, n));
        return [id, { ...st, i, window: !!st.window && i < n }];
      }
      if (s.type === 'deposition' && 'script' in s && Array.isArray(s.script))
        return [id, { ...st, i: Math.max(0, Math.min(st.i, s.script.length)) }];
      return [id, st];
    }),
  );
}

/** 存檔時記下的原文指紋：場景 id、這一步的原文、每一筆選擇選的那句。 */
export function fingerprint(p: Progress, eps: Episodes = episodes) {
  const ep = Object.hasOwn(eps, p.episode) ? eps[p.episode] : undefined;
  if (!ep) return {};
  const cur = ep.scenes[p.scene];
  const picks: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.choices)) {
    const [id, i] = k.split(':');
    const s = ep.scenes.find((x) => x.id === id);
    const st = s && 'steps' in s ? (s.steps as Step[])[Number(i)] : undefined;
    const text = st?.do === 'choose' ? st.options[v]?.text : undefined;
    if (text !== undefined) picks[k] = text;
  }
  const stepText = cur && 'steps' in cur ? stepTextOf(cur.steps[p.step]) : null;
  return { sceneId: cur?.id, picks, ...(stepText ? { stepText } : {}) };
}

const key = (slot: Slot) => `lawgame-ep-${slot}`;

/** 瀏覽器可能封鎖儲存空間（無痕模式），讀寫失敗時遊戲照常進行，只是沒有存檔。 */
export function readSave(slot: Slot, storage: Storage | undefined = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(key(slot));
    const file = raw ? migrate(JSON.parse(raw)) : null;
    // 舊版集尾存檔的標籤是「第 1 集・第 1 集」。
    if (file) file.label = file.label.replace(/^(第 (\d+) 集)・第 \2 集$/, '$1・待續');
    return file;
  } catch {
    return null;
  }
}

/** 這一格有資料，但讀不出來（壞檔，或比這一版新的存檔）。空格不算。 */
export function unreadable(slot: Slot, storage: Storage | undefined = globalThis.localStorage) {
  try {
    return !!storage?.getItem(key(slot)) && !readSave(slot, storage);
  } catch {
    return false;
  }
}

/** 讀不出來的存檔在第一次被覆寫前另存到這裡，只留最近一份（#363）。 */
export const backupKey = (slot: Slot) => `${key(slot)}-bad`;

export function writeSave(
  slot: Slot,
  label: string,
  progress: Progress,
  storage: Storage | undefined = globalThis.localStorage,
): boolean {
  const file: SaveFile = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    label,
    ...fingerprint(progress),
    progress,
  };
  try {
    // 之後修好檢查或遷移還救得回來：原始字串先搬到備份鍵，備份失敗也照常存。
    if (unreadable(slot, storage)) {
      try {
        storage?.setItem(backupKey(slot), storage.getItem(key(slot))!);
      } catch {
        /* 空間不夠就算了 */
      }
    }
    storage?.setItem(key(slot), JSON.stringify(file));
    return !!storage;
  } catch {
    return false;
  }
}
