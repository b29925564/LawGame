/**
 * 實物照片（場景光影算的圖，設計師 P4-6 第三版通過）：每張三種寬度，證據板 400、抽屜 800、放大檢視 1600，
 * 用 srcset 讓瀏覽器照實際寬度和像素密度挑。檔名就是卡片 id；沒有照片的卡照舊畫閃光燈版式。
 */
const urls = import.meta.glob<string>('./photos/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const WIDTHS = [400, 800, 1600] as const;
/** 每個用途在版面上大約多寬（CSS px），瀏覽器乘上像素密度再挑檔。 */
const SIZES = {
  board: '(max-width: 640px) 45vw, 260px',
  drawer: '(max-width: 640px) 90vw, 400px',
  zoom: '(max-width: 640px) 100vw, 800px',
  thumb: '48px',
} as const;
const DEFAULT = { board: 400, thumb: 400, drawer: 800, zoom: 1600 } as const;
/**
 * 照片紀錄表的沖印是 4×6（3:2，設定集第 9 章），證據板上的卡是 4:3，都用 cover 置中裁。
 * 手腕那張是 4:3，在紀錄表裡上下各裁一點；扣押袋那張是 3:2（場景光影照紀錄表重拍，標籤留了頭頂空間），在板上左右各裁一點。
 */
export type PrintUse = keyof typeof SIZES;

const url = (id: string, w: number) => urls[`./photos/${id}-${w}.webp`];

export const hasPrint = (id: string) => !!url(id, 400);

/** 沖印的照片本身（沒有邊框和紀錄欄）；這張卡沒有照片就不畫。 */
export function Print({ id, use }: { id: string; use: PrintUse }) {
  if (!hasPrint(id)) return null;
  return (
    <img
      src={url(id, DEFAULT[use])}
      srcSet={WIDTHS.map((w) => `${url(id, w)} ${w}w`).join(', ')}
      sizes={SIZES[use]}
      alt=""
      decoding="async"
    />
  );
}
