import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '../../i18n';
import { useScope } from '../lang';
import { buildSketch, drawStrokes, type RGB, type SketchCard } from './pastel';

/** 板上要畫的卡：位置（%）與卡寬（%）。 */
export type JuryCard = {
  id: string;
  kind: string;
  name: string;
  sub?: string;
  at: [number, number];
  w: number;
  tilt: number;
};

/** 吊燈光圈的亮度倍率（和 cork.css 的 .cork-lamp 同一組停點；d 以半寬為 1）。 */
const STOPS: [number, number][] = [
  [0, 1],
  [0.34, 0.95],
  [0.46, 0.83],
  [0.52, 0.64],
  [0.66, 0.53],
  [0.84, 0.22],
  [1, 0.15],
];
function lamp(d: number) {
  for (let i = 1; i < STOPS.length; i++) {
    const [d1, v1] = STOPS[i];
    if (d <= d1) {
      const [d0, v0] = STOPS[i - 1];
      return v0 + ((v1 - v0) * (d - d0)) / (d1 - d0);
    }
  }
  return 0.15;
}

/** 卡紙的亮度與顏色（照片白邊、影印紙、便條）。 */
const PAPER: Record<string, { lum: number; rgb: RGB; ratio: number }> = {
  photo: { lum: 0.95, rgb: [244, 244, 241], ratio: 0.95 },
  index: { lum: 0.9, rgb: [240, 231, 221], ratio: 0.6 },
  note: { lum: 0.9, rgb: [240, 231, 221], ratio: 0.6 },
  copy: { lum: 0.92, rgb: [239, 238, 233], ratio: 0.66 },
};

function cssColor(expr: string): RGB {
  const probe = document.createElement('span');
  probe.style.color = expr;
  probe.style.display = 'none';
  document.body.append(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ['0', '0', '0'];
  probe.remove();
  return [+m[0], +m[1], +m[2]];
}

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// 第一次切進來才依筆觸順序成形（--dur-sketch 900ms）；之後是 180ms 交叉淡化。
let formed = false;

/**
 * 陪審團視角：同一塊板，M. Osei 的粉彩速寫。只畫陪審團聽過的東西：
 * 沒被採納的卡、玩家自己的連線與推理都不畫，那裡就是空白的紙（不是黑條：速寫畫家沒看到就不會畫）。
 */
export function JurySketch({
  on,
  cards,
  look,
  signature,
}: {
  on: boolean;
  cards: JuryCard[];
  look: (kind: string) => string;
  signature: string;
}) {
  const t = useT();
  const scope = useScope();
  const ref = useRef<HTMLCanvasElement>(null);
  const [scheme, setScheme] = useState(0);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setScheme((n) => n + 1);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const lang = useLang((s) => s.lang);
  const key = `${cards.map((c) => c.id).join()}|${lang}|${scheme}|${signature}`;

  useEffect(() => {
    const cv = ref.current;
    const host = cv?.parentElement;
    const ctx = cv?.getContext('2d');
    if (!cv || !host || !ctx) return;
    let raf = 0;
    let cancelled = false;
    const run = async () => {
      await document.fonts?.ready;
      if (cancelled) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * scale);
      cv.height = Math.round(h * scale);
      const doc = getComputedStyle(host).getPropertyValue('--font-doc') || 'serif';
      const hand = getComputedStyle(host).getPropertyValue('--font-hand') || 'serif';
      const sc: SketchCard[] = cards.map((c) => {
        const p = PAPER[look(c.kind)] ?? PAPER.copy;
        const cw = (c.w / 100) * w;
        const ch = cw * p.ratio;
        const x = (c.at[0] / 100) * w;
        const y = (c.at[1] / 100) * h;
        return {
          cx: x + cw / 2,
          cy: y + ch / 2,
          w: cw,
          h: ch,
          angle: (c.tilt * Math.PI) / 180,
          lum: p.lum,
          rgb: p.rgb,
          label: t(c.name, scope),
          sub: c.sub && t(c.sub, scope),
        };
      });
      const sketch = buildSketch({
        w,
        h,
        scale,
        cards: sc,
        strings: [],
        lamp,
        base: { lum: 0.43, rgb: [0x8a, 0x6a, 0x48] },
        paper: cssColor('var(--sketch-paper)'),
        ink: cssColor('var(--sketch-ink)'),
        chalk: cssColor('var(--chalk)'),
        signature,
        fonts: { doc, hand },
      });
      ctx.putImageData(sketch.base, 0, 0);
      const all = sketch.strokes.length;
      if (formed || reduced()) {
        drawStrokes(ctx, sketch.strokes, 0, all);
        sketch.text(ctx);
        return;
      }
      formed = true;
      const t0 = performance.now();
      let done = 0;
      const frame = (now: number) => {
        if (cancelled) return;
        const k = Math.min(1, (now - t0) / 900);
        const upto = Math.round(all * k);
        drawStrokes(ctx, sketch.strokes, done, upto);
        done = upto;
        if (k < 1) raf = requestAnimationFrame(frame);
        else sketch.text(ctx);
      };
      raf = requestAnimationFrame(frame);
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // key 涵蓋卡片、語言與主題。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <canvas ref={ref} className={on ? 'cork-sketch on' : 'cork-sketch'} aria-hidden />;
}
