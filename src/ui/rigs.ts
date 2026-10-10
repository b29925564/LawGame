import rigData from '../content/rigs.yaml';

/**
 * 場記右欄讀燈組（設定集 11.3：「第二日 14:10 4800K」直接讀 rigs/court-d2-pm.yaml，不手打）。
 * 燈組資料在 src/content/rigs.yaml；每場戲在劇本裡用 rig: 指定一組（第 10 章 :108），法庭的日卡另外寫當天那一組。
 * 不再用地點字串猜色溫（設計師 2026-10-10：猜錯過，改劇本也容易猜錯）。
 */
export type Rig = { label: string; time: string; kelvin: number };

export const RIGS = rigData as Record<string, Rig>;

/** 這一格場記的燈組：地點帶的 rig 鍵。沒有就是 null（場記右欄只放地點自帶的日子時刻，不放色溫）。 */
export function rigOf(place: { rig?: string }): Rig | null {
  return (place.rig && RIGS[place.rig]) || null;
}
