import type { CSSProperties } from 'react';
import lucasYaml from './cast/lucas/lucas.yaml?raw';

/**
 * 正式立繪（視覺設計師的立繪包，art-bible/cast/lead/pack）。
 * 圖檔照包裡的結構放：根目錄是立繪（1256×1363，v95 右肩補完的畫布）、628/ 是它的一半，
 * 512/、144/ 是頭像（4:5，只裁臉）；每個表情用哪一張看 yaml 的 default。
 * 補新表情或換預設張，只要把圖和新的 yaml 放進來，這裡不用改。
 */
export type Expr = 'plain' | 'tense' | 'warm' | 'hard' | 'panic' | 'silent';

/** 台詞的 mood（中文）對到立繪包的表情鍵。 */
export const EXPR: Record<string, Expr> = {
  平: 'plain',
  緊: 'tense',
  暖: 'warm',
  硬: 'hard',
  慌: 'panic',
  默: 'silent',
};

/** 讀 yaml 裡 `key: { a: 1, b: 2 }` 這種一行的表。只為這幾行不把 yaml 解析器打包進瀏覽器。 */
function inline(yaml: string, key: string): Record<string, string> {
  const m = new RegExp(`^${key}:\\s*\\{([^}]*)\\}`, 'm').exec(yaml);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split(',')
      .map((kv) => kv.split(':').map((s) => s.trim()))
      .filter(([k, v]) => k && v),
  );
}

/** 讀 yaml 的 `default: { plain: v01, ... }` 一行。 */
export function defaults(yaml: string): Partial<Record<Expr, string>> {
  return inline(yaml, 'default');
}

/** 讀 yaml 的 `face_cx: { plain v01: 40.6, ... }` 一行：每張圖臉的中心 x（％）。 */
export function faces(yaml: string): Record<string, number> {
  return Object.fromEntries(Object.entries(inline(yaml, 'face_cx')).map(([k, v]) => [k, +v]));
}

const urls = import.meta.glob<string>('./cast/lucas/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type Size = 144 | 512 | 628 | 1256;

function dir(size: Size) {
  return size === 1256 ? './cast/lucas/' : `./cast/lucas/${size}/`;
}

const picks = defaults(lucasYaml);
const faceX = faces(lucasYaml);

/** 某個 mood 實際用哪一張：表情鍵和「表情 版本」（yaml 裡的寫法，例如「plain v01」「tense-light v01」）。 */
function pick(mood: string | undefined, size: Size) {
  const want = EXPR[mood ?? '平'] ?? 'plain';
  for (const expr of [want, 'tense', 'plain'] as Expr[]) {
    const v = picks[expr];
    if (!v) continue;
    // 值是「v02」或「tense-light v01」（同一表情的變體）。
    const [a, b] = v.split(/\s+/);
    const [name, ver] = b ? [a, b] : [expr, a];
    const url = urls[`${dir(size)}lucas__F__${name}__${ver}.webp`];
    if (url) return { url, key: `${name} ${ver}` };
  }
  return undefined;
}

/** 盧卡斯某個 mood 的圖；這個表情還沒生就用緊代打，緊也沒有就用平。 */
export function lucas(mood: string | undefined, size: Size): string | undefined {
  return pick(mood, size)?.url;
}

/**
 * 頭像怎麼裁（所有放盧卡斯臉的小格子共用，styles.css 的 .face-crop）：圖放大 1.5 倍取頭肩，
 * 臉的中心（yaml face_cx，不是頭部輪廓）放在格子正中間。沒量過的圖退回頭部中心 45.6％。
 */
export function lucasFace(mood: string | undefined): CSSProperties {
  const key = pick(mood, 144)?.key;
  const cx = (key && faceX[key]) || 45.6;
  return { '--face-x': `${cx / 100}` } as CSSProperties;
}

export const LUCAS = '盧卡斯';
