import type { Episode } from '../engine/episode/schema';
import type { CaseData } from '../engine/schema';
// 由 vite.config.ts 的 content 外掛在建置時解析與驗證。
// 劇本依集數用 import() 載入（#388）；標題畫面只要集數與標題，?meta 只帶這兩欄。
import ep1Meta from './ep1.yaml?meta';
import ep2Meta from './ep2.yaml?meta';
import protoData from './proto.yaml';

/** 原型（企劃書第 15 節）的單場劇本，垂直切片的庭審完成前保留在標題畫面。 */
export const cases = { proto: protoData as CaseData };

/** 集數順序。 */
export const EPISODE_IDS = ['ep1', 'ep2'] as const;
export type EpisodeId = (typeof EPISODE_IDS)[number];

export const isEpisodeId = (id: unknown): id is EpisodeId =>
  typeof id === 'string' && (EPISODE_IDS as readonly string[]).includes(id);

/** 不必載入整集就看得到的：集數與標題。 */
export const episodeMeta: Record<EpisodeId, { number: number; title: string }> = {
  ep1: ep1Meta,
  ep2: ep2Meta,
};

const loaders: Record<EpisodeId, () => Promise<{ default: unknown }>> = {
  ep1: () => import('./ep1.yaml'),
  ep2: () => import('./ep2.yaml'),
};

/**
 * 已載入的劇本。引擎同步讀它，所以開新局、讀檔、接下一集之前要先 await loadEpisode；
 * 還沒載入的集數在這裡是 undefined（型別為了引擎好寫標成必有，讀之前用 episodeLoaded 確認）。
 */
export const episodes = {} as Record<EpisodeId, Episode>;

const pending = new Map<EpisodeId, Promise<Episode>>();
const listeners = new Set<() => void>();

export const episodeLoaded = (id: string): boolean =>
  isEpisodeId(id) && Object.hasOwn(episodes, id);

export function loadEpisode(id: EpisodeId): Promise<Episode> {
  if (episodeLoaded(id)) return Promise.resolve(episodes[id]);
  let p = pending.get(id);
  if (!p) {
    p = loaders[id]().then((m) => {
      episodes[id] = m.default as Episode;
      for (const f of listeners) f();
      return episodes[id];
    });
    // 網路失敗時允許重試。
    p.catch(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

export const loadAllEpisodes = () => Promise.all(EPISODE_IDS.map(loadEpisode));

/** 有劇本載入完時通知（標題畫面的存檔欄要等劇本才畫得出案卷登錄表）。 */
export function onEpisodeLoaded(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
