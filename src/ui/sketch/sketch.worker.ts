/**
 * 陪審團速寫放在 Worker 裡算：亮度場、紙紋、兩萬多條筆觸都在這裡，主執行緒不卡。
 * mode 'strokes'：回傳底層與筆觸，讓頁面依筆觸順序畫出來（第一次切進來的 900ms 成形）。
 * mode 'bitmap'：在 OffscreenCanvas 上直接畫完，回傳一張 ImageBitmap（之後的切換與換卡）。
 */
import { buildSketch, drawStrokes, type SketchInput } from './pastel';

// Worker 裡的 postMessage 第二個參數是可轉移物件（不是 DOM 的 targetOrigin）。
const post = (m: unknown, transfer: Transferable[]) =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(
    m,
    transfer,
  );

export type SketchRequest = { id: number; mode: 'strokes' | 'bitmap'; input: SketchInput };

self.onmessage = (e: MessageEvent<SketchRequest>) => {
  const { id, mode, input } = e.data;
  const t0 = performance.now();
  const sketch = buildSketch(input);
  const built = performance.now() - t0;
  if (mode === 'bitmap' && typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(sketch.base.width, sketch.base.height);
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.putImageData(sketch.base, 0, 0);
      drawStrokes(ctx, sketch.strokes, 0, sketch.strokes.length);
      const bitmap = cv.transferToImageBitmap();
      post(
        {
          id,
          bitmap,
          light: sketch.light,
          n: sketch.strokes.length,
          built,
          drawn: performance.now() - t0 - built,
        },
        [bitmap],
      );
      return;
    }
  }
  post(
    {
      id,
      base: sketch.base,
      strokes: sketch.strokes,
      light: sketch.light,
      n: sketch.strokes.length,
      built,
    },
    [sketch.base.data.buffer],
  );
};
