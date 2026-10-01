/**
 * 畫外字幕的節奏（設計稿 inner-voice 3.4）。
 * 逐字 50ms；，、：；後停 160ms，。？！ 320ms，…… 480ms；整段出字 ≤ 2400ms（超過就等比壓縮）。
 * 停留 H = clamp(1800, 600 + 170 × 字數, 7000) ms。
 */
export const CHAR_MS = 50;
export const MAX_TYPE_MS = 2400;

const pause = (ch: string, next: string) =>
  ch === '…' && next !== '…'
    ? 480
    : '，、：；'.includes(ch)
      ? 160
      : '。？！'.includes(ch)
        ? 320
        : 0;

/** 每個字開始出現的時間（ms），以及整段出完要多久。｜只是斷句記號，不算字。 */
export function voTiming(text: string) {
  const chars = [...text.replace(/｜/g, '')];
  const starts: number[] = [];
  let t = 0;
  chars.forEach((c, i) => {
    starts.push(t);
    t += CHAR_MS + pause(c, chars[i + 1] ?? '');
  });
  const k = t > MAX_TYPE_MS ? MAX_TYPE_MS / t : 1;
  const type = Math.round(Math.min(t, MAX_TYPE_MS));
  return {
    starts: starts.map((s) => Math.round(s * k)),
    type,
    hold: Math.min(7000, Math.max(1800, 600 + 170 * chars.length)),
  };
}
