/**
 * 影子往上爬（設定集第 7 章，鋪陳 → 對質由下往上，--dur-shadow 300ms、--ease-light）。
 * 場景光影交來的遮罩是 1920×1080 灰階圖：每個像素的值＝影子在進度幾時掃到那裡（0–255 ↔ 0–1）。
 * 新一格的底圖、受光、前景整層疊在舊的上面，用遮罩切：進度 p 超過像素值的地方顯示新的，
 * 交界留 SOFT 寬的軟邊（不是硬線）。軟邊在 SVG 濾鏡裡做：權重 = clamp((p − m)/SOFT + 0.5, 0, 1)，
 * 即每個通道 m → slope × m + intercept；p 從 −SOFT/2 走到 1 + SOFT/2，頭尾各是全舊、全新。
 */

/** 交界軟邊寬（進度的比例）。 */
export const SOFT = 0.06;
export const P_FROM = -SOFT / 2;
export const P_TO = 1 + SOFT / 2;

/** feComponentTransfer linear 的係數：遮罩值 m（0–1）→ 這個像素新圖的權重。 */
export function climbCoef(p: number) {
  return { slope: -1 / SOFT, intercept: p / SOFT + 0.5 };
}

/** 套用在像素上的權重（測試和濾鏡係數對照用）。 */
export function climbWeight(m: number, p: number) {
  const { slope, intercept } = climbCoef(p);
  return Math.min(1, Math.max(0, slope * m + intercept));
}

/** 權杖 --ease-light 的 cubic-bezier(x1, y1, x2, y2) → 時間 t（0–1）換成進度。解不出來就當線性。 */
export function easeOf(token: string): (t: number) => number {
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(
    token,
  );
  if (!m) return (t) => t;
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  const at = (a: number, b: number, u: number) =>
    3 * a * (1 - u) * (1 - u) * u + 3 * b * (1 - u) * u * u + u * u * u;
  const dx = (u: number) =>
    3 * x1 * (1 - u) * (1 - u) + 6 * (x2 - x1) * (1 - u) * u + 3 * (1 - x2) * u * u;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const err = at(x1, x2, u) - t;
      const d = dx(u);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    u = Math.min(1, Math.max(0, u));
    return at(y1, y2, u);
  };
}
