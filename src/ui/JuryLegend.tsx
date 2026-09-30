/**
 * 試玩回饋：只看到數字不知道那是什麼。打開數值時就把規則講清楚
 * （企劃書 6.10：刑事案 70 以上才投有罪，那條線就是「超越合理懷疑」）。
 */
export function JuryLegend({
  jury,
  threshold,
  note,
}: {
  jury: Record<string, number>;
  threshold: number;
  /** 這一場的起點要交代清楚，否則「大家都 100」看起來像壞掉了。 */
  note?: string;
}) {
  const values = Object.values(jury);
  const over = values.filter((v) => v >= threshold).length;
  return (
    <p className="muted small legend-text">
      數字是每個人的「有罪傾向」，0 到 100。{threshold} 以上才會投有罪，那條線就是「超越合理懷疑」。
      目前 {over} / {values.length} 在線上。{note && ` ${note}`}
    </p>
  );
}
