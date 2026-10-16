/**
 * 實物照片（場景光影算的圖，設計師審過）：檔名是「{卡片 id}-{寬}.webp」，每張三種寬度，
 * 用 srcset 讓瀏覽器照實際寬度和像素密度挑。寬度照交來的檔案：證物 400／800／1600，31 樓警方照片 450／900／1800。
 * 沒有照片的卡照舊畫閃光燈版式。
 */
const urls = import.meta.glob<string>('./photos/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** 每張照片有哪些寬度（小到大）。 */
const prints = new Map<string, { w: number; url: string }[]>();
for (const [path, url] of Object.entries(urls)) {
  const m = /\/([^/]+)-(\d+)\.webp$/.exec(path);
  if (!m) continue;
  prints.set(
    m[1],
    [...(prints.get(m[1]) ?? []), { w: Number(m[2]), url }].sort((a, b) => a.w - b.w),
  );
}

/**
 * 照片裡要遮的範圍（redact.json，場景光影交的：圖片比例座標 x0, y0, x1, y1，原點左上）。
 * 照片紀錄表在這一塊畫「照片已遮蔽」黑條（設定集第 9 章：遺體只以黑條出現）。
 */
const zones = Object.values(
  import.meta.glob<Record<string, { redact?: [number, number, number, number] }>>(
    './photos/redact.json',
    { eager: true, import: 'default' },
  ),
)[0];
export const redactZone = (id: string) => zones?.[id]?.redact;

/**
 * 每張證物照片的原圖寬高（ratios.json，照 webp 實際尺寸填）：證據板上的沖印框跟著照片的比例走，照片一律不裁切
 * （設計師 #2 2026-10-16；設定集規定證物縮圖是 800×600）。沒有登記的是 4:3。
 */
const sizes = Object.values(
  import.meta.glob<Record<string, [number, number]>>('./photos/ratios.json', {
    eager: true,
    import: 'default',
  }),
)[0];
export const printRatio = (id: string) => {
  const s = sizes?.[id];
  return s ? s[0] / s[1] : undefined;
};

/** 每個用途在版面上大約多寬（CSS px），瀏覽器乘上像素密度再挑檔。 */
const SIZES = {
  board: '(max-width: 640px) 45vw, 260px',
  drawer: '(max-width: 640px) 90vw, 400px',
  zoom: '(max-width: 640px) 100vw, 800px',
  thumb: '48px',
  /** 冷開場最後一格：三張沖印並排（手機一張一列）。 */
  scene: '(max-width: 640px) 92vw, 400px',
} as const;
/** 沒有 srcset 的瀏覽器用哪一張：至少這麼寬的最小一張。 */
const DEFAULT = { board: 400, thumb: 400, drawer: 800, zoom: 1600, scene: 800 } as const;
/**
 * 照片紀錄表的沖印預設是 4×6（3:2，設定集第 9 章）；ratios.json 有登記的照片，紀錄表和證據板的沖印框
 * 都跟著照片的比例走（printRatio），不裁切。手腕那張和扣押袋那張都是 4:3（扣押袋那張 2026-10-16 照 800×600 重出）。
 * 31 樓警方照片是 3:2，紀錄表裡不裁，遮蔽範圍照原圖座標畫。
 */
export type PrintUse = keyof typeof SIZES;

export const hasPrint = (id: string) => prints.has(id);

/** 沖印的照片本身（沒有邊框和紀錄欄）；這張卡沒有照片就不畫。alt 給沒有紀錄欄說明的地方（冷開場的警方照片）。 */
export function Print({ id, use, alt = '' }: { id: string; use: PrintUse; alt?: string }) {
  const list = prints.get(id);
  if (!list) return null;
  const src = (list.find((p) => p.w >= DEFAULT[use]) ?? list[list.length - 1]).url;
  return (
    <img
      src={src}
      srcSet={list.map((p) => `${p.url} ${p.w}w`).join(', ')}
      sizes={SIZES[use]}
      alt={alt}
      decoding="async"
    />
  );
}
