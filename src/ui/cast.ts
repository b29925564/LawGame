import lucasYaml from './cast/lucas/lucas.yaml?raw';

/**
 * 正式立繪（視覺設計師的立繪包，art-bible/cast/lead/pack）。
 * 圖檔照包裡的結構放：根目錄 1024×1280、512/、144/；每個表情用哪一張看 yaml 的 default。
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

/** 讀 yaml 的 `default: { plain: v01, ... }` 一行。只為這一行不把 yaml 解析器打包進瀏覽器。 */
export function defaults(yaml: string): Partial<Record<Expr, string>> {
  const m = /^default:\s*\{([^}]*)\}/m.exec(yaml);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split(',')
      .map((kv) => kv.split(':').map((s) => s.trim()))
      .filter(([k, v]) => k && v),
  );
}

const urls = import.meta.glob<string>('./cast/lucas/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type Size = 144 | 512 | 1024;

function dir(size: Size) {
  return size === 1024 ? './cast/lucas/' : `./cast/lucas/${size}/`;
}

const picks = defaults(lucasYaml);

/** 盧卡斯某個 mood 的圖；這個表情還沒生就用緊代打，緊也沒有就用平。 */
export function lucas(mood: string | undefined, size: Size): string | undefined {
  const want = EXPR[mood ?? '平'] ?? 'plain';
  for (const expr of [want, 'tense', 'plain'] as Expr[]) {
    const v = picks[expr];
    if (!v) continue;
    // 值是「v02」或「tense-light v01」（同一表情的變體）。
    const [a, b] = v.split(/\s+/);
    const url = urls[`${dir(size)}lucas__F__${b ? a : expr}__${b ?? a}.webp`];
    if (url) return url;
  }
  return undefined;
}

export const LUCAS = '盧卡斯';
