/** 英文台詞的實際寬度（em）：用字幕卡真正的字型家族，canvas 量。量不到就回 undefined，切分器照每字 0.6em 估。 */
let ctx: CanvasRenderingContext2D | null | undefined;
export function measureOf(font: string): ((t: string) => number) | undefined {
  if (!font) return undefined;
  ctx ??= document.createElement('canvas').getContext('2d');
  const c = ctx;
  if (!c) return undefined;
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '17');
  return (t) => {
    c.font = font;
    return c.measureText(t).width / px;
  };
}
