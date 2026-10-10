import * as branch from './episode/branch';
import type { Card, Episode, Scene } from './episode/schema';

/**
 * Bates（設定集第 9 章 :11、第 10 章 :17；差距表 P2-1）。兩條序列：
 * - 文件 Bates：前綴是交出的一方（CALDER-、CPD-、DA-、ME-、WH-、OKF-，錄影加 -V-），號碼寫在劇本資料裡，
 *   這裡只負責挑出這條分支用哪一個（batesIf）和驗證。
 * - 本所序列 WH-E01-六位數：法庭 HUD、幕卡、存檔欄、筆錄頁尾、本所的狀紙、片尾頁數。
 *   每一種場景有固定的頁數，照場景順序累加成頁段，只看劇本：不跟語言、螢幕寬度、玩家走的分支變，
 *   沒走的分支照樣佔頁，所以「本集共製作 N 頁」在每個存檔都一樣（設計師 bates-review.md）。
 */

/** 每一種場景佔幾頁。筆錄（庭審、辯方證人）一卷的上限也是這個數。 */
export const PAGES: Record<Scene['type'], number> = {
  card: 1,
  phone: 2,
  dialogue: 2,
  interview: 4,
  theory: 2,
  opening: 4,
  desk: 13,
  deposition: 20,
  negotiation: 6,
  voirdire: 8,
  trial: 60,
  defense: 60,
  closing: 8,
};

/** 本所序列的格式：WH-E01-000214。 */
export function ownBates(episode: number, page: number): string {
  return `WH-E${String(episode).padStart(2, '0')}-${String(page).padStart(6, '0')}`;
}

/** 第 at 場的頁段：第一頁與頁數。at 超過最後一場時，回傳片尾那一頁。 */
export function pagesOf(ep: Episode, at: number): { first: number; count: number } {
  let first = 1;
  for (let i = 0; i < Math.min(at, ep.scenes.length); i++) first += PAGES[ep.scenes[i].type];
  const s = ep.scenes[at];
  return { first, count: s ? PAGES[s.type] : 1 };
}

/** 第 at 場的第 sheet 張紙（從 1 起）。 */
export function batesAt(ep: Episode, at: number, sheet = 1): string {
  const { first, count } = pagesOf(ep, at);
  return ownBates(ep.number, first + Math.min(Math.max(sheet, 1), count) - 1);
}

/** 這一集一共幾頁（片尾「本集共製作 N 頁」）。 */
export function totalPages(ep: Episode): number {
  return pagesOf(ep, ep.scenes.length).first - 1;
}

/** 照片沖印本另有 photo.bates，那裡印；卡片本身印的是這一個。 */
export function cardBates(c: Card, ctx: branch.BranchContext): string | undefined {
  return c.batesIf?.find((b) => branch.matches(b.when, ctx))?.bates ?? c.bates;
}

/**
 * 每張紙的出處（設計師 bates-review.md 補充第 2 點）：開示交出的文件印 Bates；
 * 筆錄、勘誤表印頁行；法院裁定、訴狀印案號與收文日期；陳述印時間與製作人。
 * 有 Bates 的優先。只有照片的卡（沒寫 bates），號碼印在沖印本上（photo.bates），這裡不再印一次；
 * 財物清單這種本身是一份紀錄、又附照片的卡，兩個號碼各印各的（清單 CPD-000021、照片 CPD-000024）。
 */
export type Provenance =
  | { kind: 'bates'; bates: string }
  | { kind: 'cite'; page: number; line: number }
  | { kind: 'filed'; caseNo: string; date: string }
  | { kind: 'taken'; at: string; by: string };

/** 這一集裡的卡片（桌面場景之間共用同一份牌庫，找到第一張就是）。 */
export function cardIn(ep: Episode, id: string): Card | undefined {
  for (const s of ep.scenes)
    if (s.type === 'desk') for (const c of s.cards) if (c.id === id) return c;
  return undefined;
}

export function provenanceOf(c: Card, ctx: branch.BranchContext): Provenance | null {
  const bates = cardBates(c, ctx);
  if (bates) return { kind: 'bates', bates };
  if (c.cite) {
    const [page, line] = c.cite.split(':').map(Number);
    return { kind: 'cite', page, line };
  }
  if (c.filed) return { kind: 'filed', ...c.filed };
  if (c.taken) return { kind: 'taken', ...c.taken };
  return null;
}
