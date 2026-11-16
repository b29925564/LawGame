import type { Verdict } from './verdictBeats';

/**
 * 判決窗光 ④ 的畫面（設定集 10.5，10-17 定稿的判決窗光 A；人是立牌，Issue #354）。
 * - `vl-e1-1640.webp`：16:40，光落在被告席（無罪就停在這一格；有罪、僵局從這一格開始）。
 * - `vl-e1-g01…g10`：有罪，太陽從 16:40 走到 16:48:45（光到桌角）。`vl-e1-h01…h10`：僵局，走到 17:01（光到走道）。
 * - 10 格照 24 fps 排在 --dur-lightmove（400 ms）裡，--ease-light 已經算進每一格的太陽位置，播的時候等間隔。
 * 算圖：art-bible/scenes/verdict-light/standee-v1/（vt2.py、vt2post.py）。
 */
const FILES = import.meta.glob('./vlight/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const MOVE_FRAMES = 10;
const MOVE: Partial<Record<Verdict, string>> = { 有罪: 'g', 陪審團僵局: 'h' };

const url = (name: string) => FILES[`./vlight/${name}.webp`];

/** 這個結果要播的畫面：第 0 格是 16:40（被告席），之後是移動的 10 格；無罪只有第 0 格。缺檔回傳空陣列。 */
export function lightFrames(v: Verdict): string[] {
  const k = MOVE[v];
  const names = ['vl-e1-1640'];
  if (k) for (let i = 1; i <= MOVE_FRAMES; i++) names.push(`vl-e1-${k}${String(i).padStart(2, '0')}`);
  const urls = names.map(url);
  return urls.every(Boolean) ? (urls as string[]) : [];
}
