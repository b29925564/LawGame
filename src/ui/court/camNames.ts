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

/** 判決格的結果（Closing 的 VerdictKind 再分兩集）。 */
export type VerdictOutcome = '無罪' | '有罪' | '無責' | '有責' | '陪審團僵局';

/**
 * 判決那一格法官席（判決窗光 A）：掛鐘跟著結果走，兩集各三組時刻。
 * 檔名 bench-verdict-<格>-p<n>，格見 art-bible/scenes/court-cams/verdict-A/README.md。
 */
const VERDICT_SLOTS: Record<'ep1' | 'ep2', Partial<Record<VerdictOutcome, string>>> = {
  ep1: { 無罪: 'verdict-e1-1640', 有罪: 'verdict-e1-164845', 陪審團僵局: 'verdict-e1-1701' },
  ep2: { 無責: 'verdict-e2-1610', 有責: 'verdict-e2-1640', 陪審團僵局: 'verdict-e2-1734' },
};

export function verdictSlot(episode: string, outcome: VerdictOutcome) {
  const ep = episode === 'ep2' ? 'ep2' : 'ep1';
  // 第一集是刑事（無罪／有罪），第二集是民事（無責／有責）；萬一對不上，照同一邊的結果找。
  const same: Record<VerdictOutcome, VerdictOutcome> =
    ep === 'ep1'
      ? { 無罪: '無罪', 無責: '無罪', 有罪: '有罪', 有責: '有罪', 陪審團僵局: '陪審團僵局' }
      : { 無罪: '無責', 無責: '無責', 有罪: '有責', 有責: '有責', 陪審團僵局: '陪審團僵局' };
  return VERDICT_SLOTS[ep][same[outcome]]!;
}
