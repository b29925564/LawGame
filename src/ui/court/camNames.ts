/** 法官席底圖的檔名候選（先找到的先用）：時段＋耐心；背牆的字跟介面語言，英文先找 -en，找不到退回中文版。 */
export const BENCH_FALLBACK_SLOT = 'd2-pm';

export function benchNames(slot: string | undefined, patience: number, en: boolean) {
  const p = Math.max(0, Math.min(5, Math.round(patience)));
  const slots =
    slot && slot !== BENCH_FALLBACK_SLOT ? [slot, BENCH_FALLBACK_SLOT] : [BENCH_FALLBACK_SLOT];
  return slots.flatMap((s) => {
    const base = `bench-${s}-p${p}`;
    return en ? [`${base}-en`, base] : [base];
  });
}
