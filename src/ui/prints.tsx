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
 * 照片紀錄表的沖印是 4×6（3:2，設定集第 9 章），證據板上的卡是 4:3，都用 cover 置中裁。
 * 手腕那張是 4:3，在紀錄表裡上下各裁一點；扣押袋那張是 3:2（場景光影照紀錄表重拍，標籤留了頭頂空間），在板上左右各裁一點。
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
