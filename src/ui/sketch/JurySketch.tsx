import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '../../i18n';
import { reducedMotion } from '../a11y';
import { useScope } from '../lang';
import {
  buildSketch,
  cardTextLayout,
  drawSketchText,
  drawStrokes,
  type RGB,
  type SketchCard,
  type SketchInput,
  type Stroke,
} from './pastel';
import type { SketchRequest } from './sketch.worker';

/** 板上要畫的卡：位置（%）與卡寬（%）。 */
export type JuryCard = {
  id: string;
  kind: string;
  name: string;
  text?: string;
  time?: string;
  at: [number, number];
  w: number;
  tilt: number;
  /** 光圈裡的比對卡：卡的中心（%）對準吊燈版同一格，加寬、撐高都從中心往兩邊長。 */
  center?: [number, number];
  /** 最寬多少（%）：兩格都有卡、會疊到時就不再加寬，改成加高。手機不加寬。 */
  maxW?: number;
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

type Built = { light: boolean[] } & (
  { bitmap: ImageBitmap } | { base: ImageData; strokes: Stroke[] }
);

let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (b: Built) => void>();
/** 速寫在 Worker 裡算；沒有 Worker（測試環境、舊瀏覽器）就在這裡算。 */
function build(input: SketchInput, mode: SketchRequest['mode']): Promise<Built> {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./sketch.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<Built & { id: number }>) => {
        waiting.get(e.data.id)?.(e.data);
        waiting.delete(e.data.id);
      };
      worker.onerror = () => {
        worker = null;
        // Worker 起不來：已經送出的改在主執行緒算。
      };
    } catch {
      worker = null;
    }
  }
  if (!worker) {
    const s = buildSketch(input);
    return Promise.resolve(s);
  }
  const id = ++seq;
  const w = worker;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, mode, input } satisfies SketchRequest);
  });
}

/** 畫好的速寫依「採納的證據＋版面＋語言＋主題」快取：證據沒變就不重畫。 */
const cache = new Map<string, ImageBitmap | HTMLCanvasElement>();
const CACHE_MAX = 6;

// 第一次切進來才依筆觸順序成形（--dur-sketch 900ms）；之後是 180ms 交叉淡化。
// 筆觸在 Worker 裡事先算好，切過去的那一刻就開始畫。
let formed = false;

/**
 * 陪審團視角：同一塊板，M. Osei 的粉彩速寫。只畫陪審團聽過的東西：
 * 沒被採納的卡、玩家自己的連線與推理都不畫，那裡就是空白的紙（不是黑條：速寫畫家沒看到就不會畫）。
 */
export function JurySketch({
  on,
  cards,
  look,
  provenance,
  pool = 1,
  lamp: lampAt,
}: {
  on: boolean;
  cards: JuryCard[];
  look: (kind: string) => string;
  /** 出處小字：「法庭速寫 M. Osei 預審」或「…庭審第一日」。 */
  provenance: string;
  /** 光圈半徑的倍率：手機的板子光圈放大，蓋住兩張比對卡（和 cork.css 的 .cork.compact .cork-lamp 一致）。 */
  pool?: number;
  /** 手機牌架的橢圓光圈：中心高（板高的比例）、橫向 ÷ 縱向半徑。 */
  lamp?: { y: number; sy: number };
}) {
  const t = useT();
  const scope = useScope();
  const ref = useRef<HTMLCanvasElement>(null);
  const [scheme, setScheme] = useState(0);
  const [size, setSize] = useState('');
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setScheme((n) => n + 1);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    let timer = 0;
    // 掛上時的尺寸就是第一次畫的尺寸；之後真的變了才重畫（拖拉視窗時等停下來）。
    let last = `${host.clientWidth}x${host.clientHeight}`;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = `${host.clientWidth}x${host.clientHeight}`;
        if (now !== last) setSize((last = now));
      }, 200);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);
  const lang = useLang((s) => s.lang);
  const key = `${cards.map((c) => `${c.id}@${(c.center ?? c.at).map((x) => x.toFixed(1)).join(',')}`).join()}|${lang}|${scheme}|${provenance}|${size}|${pool}|${lampAt ? `${lampAt.y.toFixed(3)},${lampAt.sy.toFixed(2)}` : ''}`;

  // 第一次成形要等玩家真的切過來才開始畫；筆觸先在 Worker 算好放著。
  const onRef = useRef(on);
  const play = useRef<(() => void) | null>(null);
  useEffect(() => {
    onRef.current = on;
    if (on) play.current?.();
  }, [on]);

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
      if (!w || !h) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const full = `${key}|${w}x${h}@${scale}`;
      const hit = cache.get(full);
      if (hit) {
        cv.width = Math.round(w * scale);
        cv.height = Math.round(h * scale);
        ctx.drawImage(hit, 0, 0);
        return;
      }
      const css = getComputedStyle(host);
      const hand = css.getPropertyValue('--font-hand') || 'cursive';
      const sc: SketchCard[] = cards.map((c) => {
        const p = PAPER[look(c.kind)] ?? PAPER.copy;
        // 桌機的卡寬拉到場景寬的 30% 左右（220–240px），英文不拆成一欄窄字；手機維持內容檔的寬度
        // （設計師 P2-6 r3 第 10 條）。光圈裡的卡在板子窄於 640 的桌機也加寬，但兩格都有卡時不寬過吊燈版
        // 放大後的卡（r6）。紙的高度照原本的比例，字放不下再撐高。
        const cw0 = (c.w / 100) * w;
        const wide =
          w >= 640 || c.center ? Math.max(cw0, Math.min(240, Math.max(220, w * 0.3))) : cw0;
        const cw = c.maxW ? Math.max(cw0, Math.min(wide, (c.maxW / 100) * w)) : wide;
        const ch = cw0 * p.ratio;
        const x = (c.at[0] / 100) * w;
        const y = (c.at[1] / 100) * h;
        // 邊緣的卡加寬時往板子外側長（靠中線那一邊不動）。
        const inner = x + cw0 / 2 < w / 2 ? x + cw0 : x;
        return {
          cx: c.center
            ? (c.center[0] / 100) * w
            : x + cw0 / 2 < w / 2
              ? inner - cw / 2
              : inner + cw / 2,
          cy: c.center ? (c.center[1] / 100) * h : y + ch / 2,
          w: cw,
          h: ch,
          angle: (c.tilt * Math.PI) / 180,
          lum: p.lum,
          rgb: p.rgb,
          label: t(c.name, scope),
          body: c.text && t(c.text, scope),
          time: c.time,
          motif: /心率|heart-rate/.test(c.id + c.name)
            ? 'pulse'
            : look(c.kind) === 'photo'
              ? 'photo'
              : 'lines',
        };
      });
      // 手寫字型是依字分包下載的：畫布要用的字先載入，否則會退回別的字型。
      const words = sc.map((c) => c.label + (c.body ?? '') + (c.time ?? '')).join('');
      const size = parseFloat(css.getPropertyValue('--fs-hand')) || 18;
      await document.fonts?.load(`${size}px ${hand}`, words + provenance).catch(() => undefined);
      if (cancelled) return;
      // 字放不下就把卡撐高，不切字（設計師 P2-6 r2）：邊緣的卡往下長，光圈裡的卡上下平均長、中心不動（r6）。
      // 要在算筆觸之前量，輪廓才會跟著卡。
      const measure = (font: string, x: string) => {
        ctx.font = font;
        return ctx.measureText(x).width;
      };
      for (const [i, c] of sc.entries()) {
        // 光圈裡的卡中心不動時最多能多高（不出板子、不壓下緣的出處小字）；放不下就把內容的字縮小，最小 14px。
        const room = cards[i].center ? 2 * Math.min(c.cy - 8, h - 34 - c.cy) : Infinity;
        const fit = (px: number) =>
          cardTextLayout(measure, { ...c, size: px }, { hand, size }).need;
        let px = size;
        while (px > 14 && fit(px) > Math.max(room, c.h)) px--;
        if (px < size) c.size = px;
        const { need } = cardTextLayout(measure, c, { hand, size });
        if (need > c.h) {
          if (!cards[i].center) c.cy += (need - c.h) / 2;
          c.h = need;
        }
        // 撐高、拉寬後整張卡還要留在板子裡，下緣不壓到出處小字（基線在 h − 14，留 34px）。
        const ext =
          (c.h / 2) * Math.abs(Math.cos(c.angle)) + (c.w / 2) * Math.abs(Math.sin(c.angle));
        const lo = ext + 8;
        const hi = h - 34 - ext;
        c.cy = hi >= lo ? Math.min(hi, Math.max(lo, c.cy)) : lo;
        const half =
          (c.w / 2) * Math.abs(Math.cos(c.angle)) + (c.h / 2) * Math.abs(Math.sin(c.angle));
        c.cx = Math.min(w - half - 8, Math.max(half + 8, c.cx));
      }
      const paper = cssColor('var(--sketch-paper)');
      const ink = cssColor('var(--sketch-ink)');
      const chalk = cssColor('var(--chalk)');
      const input: SketchInput = {
        w,
        h,
        scale,
        cards: sc,
        strings: [],
        lamp: STOPS.map(([d, v]) => [d * pool, v]),
        lampAt,
        base: { lum: 0.43, rgb: [0x8a, 0x6a, 0x48] },
        paper,
        ink,
        chalk,
      };
      const animate = !formed && !reducedMotion();
      const t0 = performance.now();
      const got = await build(input, animate ? 'strokes' : 'bitmap');
      if (cancelled) return;
      performance.measure?.('jury-sketch-build', { start: t0 });
      // 換畫布尺寸會清空畫布：算好才換，舊的畫面留到最後一刻。
      cv.width = Math.round(w * scale);
      cv.height = Math.round(h * scale);
      const finish = () => {
        const lines = drawSketchText(ctx, {
          w,
          h,
          scale,
          cards: sc,
          ink,
          chalk,
          paper,
          light: got.light,
          provenance,
          fonts: { hand, size },
        });
        // 版面（卡的中心、大小、角度和每行字的框）記在效能時間軸上，驗收截圖照這個量。
        performance.mark?.('jury-sketch-layout', {
          detail: { cards: sc.map(({ cx, cy, w, h, angle }) => ({ cx, cy, w, h, angle })), lines },
        });
        // 畫完存一份：證據、語言、主題、尺寸都沒變，下次直接貼上。
        const snap = document.createElement('canvas');
        snap.width = cv.width;
        snap.height = cv.height;
        snap.getContext('2d')?.drawImage(cv, 0, 0);
        cache.set(full, snap);
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
      };
      if ('bitmap' in got) {
        ctx.drawImage(got.bitmap, 0, 0);
        got.bitmap.close();
        finish();
        performance.measure?.('jury-sketch', { start: t0 });
        return;
      }
      if (!animate) {
        ctx.putImageData(got.base, 0, 0);
        drawStrokes(ctx, got.strokes, 0, got.strokes.length);
        finish();
        return;
      }
      // 依筆觸順序成形（--dur-sketch 900ms）：底層先鋪，筆觸一批一批畫上去，字最後寫。
      play.current = () => {
        play.current = null;
        formed = true;
        ctx.putImageData(got.base, 0, 0);
        const all = got.strokes.length;
        // 起點取第一格的時間戳：rAF 的時間戳是這一格開始的時間，可能早於呼叫當下。
        let start = -1;
        let done = 0;
        const frame = (now: number) => {
          if (cancelled) return;
          if (start < 0) start = now;
          const k = Math.min(1, Math.max(0, (now - start) / 900));
          const upto = Math.round(all * k);
          drawStrokes(ctx, got.strokes, done, upto);
          done = upto;
          if (k < 1) raf = requestAnimationFrame(frame);
          else {
            finish();
            performance.measure?.('jury-sketch-form', { start, detail: { strokes: all } });
          }
        };
        raf = requestAnimationFrame(frame);
      };
      if (onRef.current) play.current();
    };
    void run();
    return () => {
      cancelled = true;
      play.current = null;
      cancelAnimationFrame(raf);
    };
    // key 涵蓋卡片、語言、主題與尺寸。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <canvas ref={ref} className={on ? 'cork-sketch on' : 'cork-sketch'} aria-hidden />;
}
