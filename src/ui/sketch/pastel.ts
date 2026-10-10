/**
 * 陪審團視角的粉彩速寫引擎（設定集 8.6、9 章 RD-ART-0903-J）。
 * 法庭只能被畫、不能被拍：速寫畫家 M. Osei 只畫陪審團聽過的東西。
 *
 * 輸入是「同一個畫面」的亮度（這裡由板子的版面直接算：軟木 × 吊燈光圈，卡片是紙），
 * 輸出是一張鋼灰紙上的炭筆＋粉彩：
 *   1. 亮度 5%–98.5% 拉到 0–1、gamma 1.7、模糊 3px
 *   2. 分階：< .12 炭、< .24 炭紙混、< .48 紙、< .70 淺粉彩（帶 15% 軟木原色）、以上粉筆白；卡片是一張乾淨的紙
 *   3. 紙紋：模糊後拉對比的雜訊＋沿筆觸方向的條紋；覆蓋率依階，紙色從粉彩之間透出來
 *   4. 筆觸：順著光圈切線與卡片邊走；長度依亮度三級，起筆粗收筆細，30% 疊一筆反向細筆
 *   5. 邊界用斜向短筆觸抖開；最暗處加稀疏 45° 排線
 *   6. 卡片輪廓、連線用炭筆／粉彩再勾一次
 *   7. 下緣是沒畫完的紙：停筆線以下只剩紙紋
 *   8. 字最後寫（drawSketchText）：卡名是畫家的手寫炭筆字；下緣是出處小字（設定集 6.6）
 * 固定種子：同一個版面每次畫出來都一樣。
 * buildSketch 不碰 DOM，可以放在 Worker 裡算（sketch.worker.ts）；字要用頁面載入的字型，回主執行緒寫。
 */

import { proseUnits } from '../lineUnits';

export type RGB = [number, number, number];

export type SketchCard = {
  /** 卡片中心（px）與尺寸、旋轉（弧度）。 */
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
  /** 紙的亮度（0–1）與顏色。 */
  lum: number;
  rgb: RGB;
  label: string;
  sub?: string;
  /** 卡上的內容（手寫）與時刻。 */
  body?: string;
  time?: string;
  /** 卡上畫什麼：字（文件、陳述）、照片、心率線（在 22:24 斷掉）。 */
  motif?: 'lines' | 'photo' | 'pulse';
};

export type SketchString = {
  from: [number, number];
  to: [number, number];
  /** 下垂（px）。 */
  sag: number;
  kind: 'contra' | 'support' | 'other';
};

export type SketchInput = {
  /** 畫布的 CSS 尺寸與像素密度。 */
  w: number;
  h: number;
  scale: number;
  cards: SketchCard[];
  strings: SketchString[];
  /** 吊燈光圈的停點：離中心的距離（以半寬為 1）→ 亮度倍率。 */
  lamp: [number, number][];
  base: { lum: number; rgb: RGB };
  paper: RGB;
  ink: RGB;
  chalk: RGB;
};

/** 一筆：一串點，起筆粗、收筆細。 */
export type Stroke = { pts: number[]; w: number; rgb: RGB; a: number };

/** 圖版的寬（RD-ART-0903-J 是 1440×860）：筆觸數量與長度都以圖版為準換算到這塊板。 */
const PLATE_W = 1440;
/** 斜向筆觸的方向（右上 37°），和抖開筆觸同一個方向。 */
const DIAG = [0.8, -0.6] as const;
/** 亮度梯度（Sobel 等效）門檻：高於 G_EDGE 完全順著切線，低於 G_FLAT 完全走斜向。 */
const G_EDGE = 0.09;
const G_FLAT = 0.04;
const PLATE_H = 860;

function lampAt(stops: [number, number][], d: number) {
  for (let i = 1; i < stops.length; i++) {
    const [d1, v1] = stops[i];
    if (d <= d1) {
      const [d0, v0] = stops[i - 1];
      return v0 + ((v1 - v0) * (d - d0)) / (d1 - d0);
    }
  }
  return stops[stops.length - 1][1];
}

const RED: RGB = [0xb8, 0x32, 0x2c];
const GREEN: RGB = [0x2f, 0x7a, 0x52];
const BONE: RGB = [0xcf, 0xcc, 0xc4];

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** 方框模糊（水平＋垂直各一次），r 是半徑（px）。 */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      acc += src[y * w + add] - src[y * w + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      acc += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return out;
}

/** 點在不在旋轉過的卡片裡。 */
function inCard(c: SketchCard, x: number, y: number) {
  const dx = x - c.cx;
  const dy = y - c.cy;
  const cos = Math.cos(-c.angle);
  const sin = Math.sin(-c.angle);
  const u = dx * cos - dy * sin;
  const v = dx * sin + dy * cos;
  return Math.abs(u) <= c.w / 2 && Math.abs(v) <= c.h / 2;
}

/** 卡片四角（順時針）。 */
function corners(c: SketchCard): [number, number][] {
  const cos = Math.cos(c.angle);
  const sin = Math.sin(c.angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const u = (sx * c.w) / 2;
    const v = (sy * c.h) / 2;
    return [c.cx + u * cos - v * sin, c.cy + u * sin + v * cos] as [number, number];
  });
}

export type Sketch = {
  /** 底層（紙、分階的粉彩、紙紋），一次畫完。 */
  base: ImageData;
  /** 依畫的順序排好的筆觸；進場時依序畫出來（--dur-sketch）。 */
  strokes: Stroke[];
  /** 每張卡在亮處還是暗處：亮處的卡用炭筆寫字，暗處的卡用粉筆寫字。 */
  light: boolean[];
};

export function buildSketch(inp: SketchInput): Sketch {
  const S = inp.scale;
  const W = Math.max(1, Math.round(inp.w * S));
  const H = Math.max(1, Math.round(inp.h * S));
  const rand = rng(0x51ce7c4);
  const cards = inp.cards.map((c) => ({
    ...c,
    cx: c.cx * S,
    cy: c.cy * S,
    w: c.w * S,
    h: c.h * S,
  }));

  // 卡片遮罩：每個像素在哪張卡上（0 是軟木，k 是第 k 張卡）。逐像素判斷太慢，先算一次。
  const cardAt = new Uint8Array(W * H);
  cards.forEach((c, k) => {
    const cs = corners(c);
    const x0 = Math.max(0, Math.floor(Math.min(...cs.map((p) => p[0]))));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...cs.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...cs.map((p) => p[1]))));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...cs.map((p) => p[1]))));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (inCard(c, x, y)) cardAt[y * W + x] = k + 1;
  });
  const idx = (x: number, y: number) =>
    Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)));

  // ── 1. 亮度場：軟木 × 吊燈，卡片是紙（也在燈下）。
  const raw = new Float32Array(W * H);
  const half = W / 2;
  // 光圈倍率查表（d 0–2，每 1/512 一格）。
  const lamp = new Float32Array(1024);
  for (let k = 0; k < 1024; k++) lamp[k] = lampAt(inp.lamp, k / 512);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = x - W / 2;
      const dy = y - H / 2;
      const d = Math.sqrt(dx * dx + dy * dy) / half;
      const k = cardAt[i];
      raw[i] = (k ? cards[k - 1].lum : inp.base.lum) * lamp[Math.min(1023, Math.round(d * 512))];
    }
  // 5%–98.5% 拉到 0–1，gamma 1.7（速寫畫家把暗部畫得比相機亮），模糊 3px。
  // 百分位用直方圖（2048 格）取，不排序整張圖。
  const pct = (() => {
    let max = 1e-6;
    for (let i = 0; i < raw.length; i++) if (raw[i] > max) max = raw[i];
    const bins = new Uint32Array(2048);
    for (let i = 0; i < raw.length; i++) bins[Math.min(2047, Math.floor((raw[i] / max) * 2048))]++;
    return (q: number) => {
      const target = raw.length * q;
      let acc = 0;
      for (let b = 0; b < 2048; b++) {
        acc += bins[b];
        if (acc > target) return ((b + 0.5) / 2048) * max;
      }
      return max;
    };
  })();
  const lo = pct(0.05);
  // 上限至少是滿光下的白紙：板上卡少時，軟木不會被拉成最亮的一階。
  const hi = Math.max(pct(0.985), 0.95);
  const norm = new Float32Array(W * H);
  const gamma = new Float32Array(4097);
  for (let k = 0; k <= 4096; k++) gamma[k] = Math.pow(k / 4096, 1 / 1.7);
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < norm.length; i++)
    norm[i] = gamma[Math.round(Math.min(1, Math.max(0, (raw[i] - lo) / span)) * 4096)];
  const L = boxBlur(norm, W, H, Math.round(3 * S));
  // 筆觸方向用更大的模糊：順著光圈的切線，而不是逐像素的雜訊。
  const F = boxBlur(boxBlur(norm, W, H, Math.round(10 * S)), W, H, Math.round(6 * S));
  const at = (a: Float32Array, x: number, y: number) => a[idx(x, y)];

  // ── 下緣沒畫完：停筆線（兩個正弦疊出的粗糙邊）；以上 46px 乾擦變薄。
  const band = (70 + ((inp.w - 640) * 90) / 800) * S;
  const p1 = rand() * 6;
  const p2 = rand() * 6;
  const stopLine = new Float32Array(W);
  for (let x = 0; x < W; x++)
    stopLine[x] =
      H -
      Math.max(40 * S, band) +
      Math.sin(x / (W / 3.1) + p1) * 9 * S +
      Math.sin(x / (W / 11.7) + p2) * 4 * S;
  const stopAt = (x: number) => stopLine[Math.min(W - 1, Math.max(0, Math.round(x)))];
  const dry = 46 * S;
  const fade = (x: number, y: number) => {
    const s = stopAt(x);
    if (y >= s) return 0;
    return Math.min(1, (s - y) / dry);
  };

  // ── 紙紋：模糊 1px 的雜訊，沿筆觸方向（30°）再拉長成一條條的牙口，拉對比；不用逐像素的椒鹽點。
  const noise = new Float32Array(W * H);
  for (let i = 0; i < noise.length; i++) noise[i] = rand();
  const nb = boxBlur(noise, W, H, Math.max(1, Math.round(S)));
  const reachT = Math.max(2, Math.round(3 * S));
  const tooth = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -reachT; k <= reachT; k++) acc += nb[idx(x + k * 0.87, y - k * 0.5)];
      const g = acc / (2 * reachT + 1);
      const streak = 0.5 + 0.5 * Math.sin((x * 0.5 + y * 0.87) / (2.2 * S) + g * 6);
      tooth[y * W + x] = Math.min(1, Math.max(0, (g - 0.5) * 5.5 + 0.5)) * 0.8 + streak * 0.2;
    }

  // 卡片裡面是乾淨的紙：背景排線不畫進卡裡（輪廓另外勾）。
  const onCard = (x: number, y: number) => cardAt[idx(x, y)] > 0;
  /** 一筆有沒有碰到卡紙：每一點和每一段的中點都查（抖開的短筆只有兩點）。 */
  const crossesCard = (pts: number[]) => {
    for (let k = 0; k < pts.length; k += 2) {
      if (onCard(pts[k], pts[k + 1])) return true;
      if (k + 3 < pts.length && onCard((pts[k] + pts[k + 2]) / 2, (pts[k + 1] + pts[k + 3]) / 2))
        return true;
    }
    return false;
  };

  // ── 2–3. 分階上色，紙紋決定哪裡吃到粉彩。
  const ink = inp.ink;
  const chalk = inp.chalk;
  const paper = inp.paper;
  const base = new ImageData(W, H);
  // 這塊板就是圖版的那塊板：筆觸數量照圖版給，長度依板寬比例縮（太小的板不再縮，筆觸會糊成點）。
  const u = Math.min(1, Math.max(0.6, inp.w / PLATE_W));
  const plate = (inp.w * PLATE_H) / (inp.h * PLATE_W);
  const tierOf = (v: number) => (v < 0.12 ? 0 : v < 0.24 ? 1 : v < 0.48 ? 2 : v < 0.7 ? 3 : 4);
  const cover = [0.6, 0.5, 0, 0.65, 0.8];
  // 逐像素不配置陣列：固定的幾個顏色先算好，紙紋只差一個係數。
  const c0 = mix(ink, paper, 0.08);
  const c1 = mix(ink, paper, 0.45);
  const c3 = mix(paper, chalk, 0.45);
  const d = base.data;
  const put = (o: number, r: number, g: number, b: number) => {
    d[o] = r;
    d[o + 1] = g;
    d[o + 2] = b;
    d[o + 3] = 255;
  };
  // 卡紙是乾淨的一張紙：不畫粉彩斑，只留一點紙紋，字寫在上面（設計師 P2-6 r2 第 4 條）。
  // 亮處的卡是粉筆白帶一點證據的色，暗處的卡是炭色（字用粉筆寫）。
  const cardPaper = cards.map((c) => (at(L, c.cx, c.cy) >= 0.48 ? mix(chalk, c.rgb, 0.12) : c0));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const v = L[i];
      const t = tierOf(v);
      const f = Math.min(1, Math.max(0, (stopLine[x] - y) / dry));
      const k = cardAt[i];
      if (k) {
        const cp = cardPaper[k - 1];
        const m = (0.5 - tooth[i]) * 0.04;
        put(
          o,
          cp[0] + (ink[0] - cp[0]) * m,
          cp[1] + (ink[1] - cp[1]) * m,
          cp[2] + (ink[2] - cp[2]) * m,
        );
        continue;
      }
      const c = cover[t];
      if (t !== 2 && f > 0 && tooth[i] < c * f) {
        if (t === 0) put(o, c0[0], c0[1], c0[2]);
        else if (t === 1) put(o, c1[0], c1[1], c1[2]);
        else if (t === 3) {
          // 淺粉彩帶 15% 軟木原色。
          const hue = inp.base.rgb;
          const m = 0.15;
          put(
            o,
            c3[0] + (hue[0] - c3[0]) * m,
            c3[1] + (hue[1] - c3[1]) * m,
            c3[2] + (hue[2] - c3[2]) * m,
          );
        } else put(o, chalk[0], chalk[1], chalk[2]);
      } else {
        // 紙本身也有一點紋理。
        const m = (0.5 - tooth[i]) * 0.06;
        put(
          o,
          paper[0] + (ink[0] - paper[0]) * m,
          paper[1] + (ink[1] - paper[1]) * m,
          paper[2] + (ink[2] - paper[2]) * m,
        );
      }
    }

  const strokes: Stroke[] = [];
  const colorOf = (v: number): { rgb: RGB; a: number } =>
    v < 0.12
      ? { rgb: ink, a: 0.85 }
      : v < 0.24
        ? { rgb: mix(ink, paper, 0.3), a: 0.7 }
        : v < 0.48
          ? { rgb: mix(ink, paper, 0.55), a: 0.45 }
          : v < 0.7
            ? { rgb: mix(paper, chalk, 0.6), a: 0.55 }
            : { rgb: chalk, a: 0.8 };

  /** 從 (x, y) 沿亮度切線追一筆。 */
  const trace = (x0: number, y0: number, len: number, dir: 1 | -1) => {
    const pts = [x0, y0];
    let x = x0;
    let y = y0;
    let jitter = 0;
    for (let s = 0; s < len; s += 1.5 * S) {
      const gx = at(F, x + S, y) - at(F, x - S, y);
      const gy = at(F, x, y + S) - at(F, x, y - S);
      const m = Math.hypot(gx, gy);
      // 切線＝梯度轉 90°。梯度小的地方（光圈正中、四角的暗部）沒有方向，切線會繞成同心圓：
      // 改走固定的斜向筆觸，和切線依梯度大小平滑混合。
      let tx = m > 1e-6 ? -gy / m : DIAG[0];
      let ty = m > 1e-6 ? gx / m : DIAG[1];
      if (tx * DIAG[0] + ty * DIAG[1] < 0) {
        tx = -tx;
        ty = -ty;
      }
      const sob = 4 * m;
      const w = Math.min(1, Math.max(0, (sob - G_FLAT) / (G_EDGE - G_FLAT)));
      const k2 = w * w * (3 - 2 * w);
      tx = k2 * tx + (1 - k2) * DIAG[0];
      ty = k2 * ty + (1 - k2) * DIAG[1];
      const n = Math.hypot(tx, ty) || 1;
      tx = (tx / n) * dir;
      ty = (ty / n) * dir;
      jitter = jitter * 0.7 + (rand() - 0.5) * 0.7;
      x += tx * 1.5 * S - ty * jitter * 0.6 * S;
      y += ty * 1.5 * S + tx * jitter * 0.6 * S;
      if (x < 0 || y < 0 || x >= W || y >= H || fade(x, y) <= 0) break;
      pts.push(x, y);
    }
    return pts;
  };

  // ── 4. 筆觸：每 2px 一格播種；越暗播得越密、筆越長越重（壓力隨暗度加重）。
  const step = 2 * S;
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) {
      const v = at(L, x, y);
      const p = (0.06 + 0.1 * (1 - v)) * 2;
      if (rand() > p) continue;
      const sx = x + rand() * step;
      const sy = y + rand() * step;
      if (fade(sx, sy) <= 0.05 || onCard(sx, sy)) continue;
      const len = (v < 0.3 ? 16 + rand() * 10 : v < 0.62 ? 9 + rand() * 6 : 4 + rand() * 4) * S * u;
      const pts = trace(sx, sy, len, rand() < 0.5 ? 1 : -1);
      if (pts.length < 6) continue;
      const c = colorOf(v);
      const w0 = (0.9 + rand() * 1.3) * S * Math.sqrt(u);
      strokes.push({ pts, w: w0, rgb: c.rgb, a: c.a * fade(sx, sy) });
      if (rand() < 0.3) {
        const back = pts.slice();
        const rev: number[] = [];
        for (let k = back.length - 2; k >= 0; k -= 2)
          rev.push(back[k] + S * 0.6, back[k + 1] + S * 0.4);
        strokes.push({ pts: rev, w: w0 * 0.6, rgb: c.rgb, a: c.a * 0.8 * fade(sx, sy) });
      }
    }

  // ── 5. 邊界抖開：斜向短筆觸（圖版 1440×860 上 26,000 條；板子比例不同時依面積換算）。
  const dith = Math.round(26000 / plate);
  for (let k = 0; k < dith; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const f = fade(x, y);
    if (f <= 0.1 || onCard(x, y)) continue;
    const v = Math.min(1, Math.max(0, at(L, x, y) + (rand() - 0.5) * 0.12));
    const c = colorOf(v);
    const l = (3 + rand() * 6) * S * u;
    strokes.push({
      pts: [x, y, x + l * 0.7, y - l * 0.7],
      w: 0.8 * S,
      rgb: c.rgb,
      a: c.a * 0.55 * f,
    });
  }
  // 最暗處：稀疏 45° 炭筆排線。
  for (let k = 0; k < dith / 6; k++) {
    const x = rand() * W;
    const y = rand() * H;
    if (at(L, x, y) >= 0.12 || fade(x, y) < 0.5) continue;
    const l = (10 + rand() * 12) * S * u;
    strokes.push({ pts: [x, y, x + l * 0.71, y + l * 0.71], w: 0.9 * S, rgb: ink, a: 0.5 });
  }
  // 卡紙上不留背景筆觸：從卡外起筆、拖進卡裡的那幾筆整筆拿掉，字寫在乾淨的紙上（設計師 P2-6 r2）。
  const kept = strokes.filter((st) => !crossesCard(st.pts));
  // 依畫的順序：先背景排線（由外往內），卡片輪廓和連線最後。
  // 依離中心的距離分桶（由遠到近），比逐一比較的排序快得多。
  const reach = Math.hypot(W, H) / 2;
  const buckets: Stroke[][] = Array.from({ length: 1024 }, () => []);
  for (const st of kept) {
    const r = Math.hypot(st.pts[0] - W / 2, st.pts[1] - H / 2) / reach;
    buckets[1023 - Math.min(1023, Math.floor(r * 1024))].push(st);
  }
  strokes.length = 0;
  for (const b of buckets) for (const st of b) strokes.push(st);

  // ── 6. 卡片：內容畫出來（照片排線、心率線；字最後手寫），輪廓用炭筆勾三次。
  // 亮處的卡用炭筆，暗處的卡用粉筆（圖版 0903-J）。
  const light = cards.map((c) => at(L, c.cx, c.cy) >= 0.48);
  cards.forEach((c, ci) => {
    const f = fade(c.cx, c.cy);
    const tone = light[ci] ? ink : chalk;
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    // 卡片座標（左上為原點）→ 畫布座標。
    const P = (u0: number, v0: number) => [
      c.cx + (u0 - c.w / 2) * cos - (v0 - c.h / 2) * sin,
      c.cy + (u0 - c.w / 2) * sin + (v0 - c.h / 2) * cos,
    ];
    const line = (u0: number, v0: number, u1: number, v1: number, wobble: number) => {
      const pts: number[] = [];
      const n = Math.max(4, Math.round(Math.hypot(u1 - u0, v1 - v0) / (5 * S)));
      const ph = rand() * 6;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const off = Math.sin(t * Math.PI * 1.3 + ph) * wobble + (rand() - 0.5) * 0.5 * S;
        const [x, y] = P(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t + off);
        pts.push(x, y);
      }
      return pts;
    };
    const pad = 10 * S;
    const motif = c.motif ?? 'lines';
    if (motif === 'photo') {
      // 照片：影像區用炭筆兩向斜排線塗暗，下面留一條寫字的白邊。
      const [u0, v0] = [pad, pad];
      const [u1, v1] = [c.w - pad, c.h - 24 * S];
      for (let pass = 0; pass < 2; pass++)
        for (let k = 0; k < u1 - u0 + (v1 - v0); k += 2.6 * S) {
          // pass 0：「/」，u + v = C；pass 1：「\」，v − u = D。
          const C = u0 + v0 + k;
          const D = v0 - u1 + k;
          const a = pass ? Math.max(u0, v0 - D) : Math.max(u0, C - v1);
          const b = pass ? Math.min(u1, v1 - D) : Math.min(u1, C - v0);
          if (b - a < 3 * S) continue;
          const vy = (u: number) => (pass ? D + u : C - u);
          strokes.push({
            pts: line(a, vy(a), b, vy(b), 0.3 * S),
            w: 1.2 * S,
            rgb: ink,
            a: (pass ? 0.45 : 0.7) * f,
          });
        }
    } else if (motif === 'pulse') {
      // 心率：鋸齒線走到 22:24（約 62%）停下，接一小段炭筆平線，之後留白。
      // 不用紅：紅在證據板上只代表矛盾。
      const v = c.h * 0.3;
      const end = pad + (c.w - 2 * pad) * 0.62;
      const pts: number[] = [];
      let up = true;
      for (let u0 = pad; u0 <= end; u0 += 7 * S) {
        const amp = (6 + ((u0 - pad) / (end - pad)) * 8) * S;
        const [x, y] = P(u0, v + (up ? amp : -amp) + (rand() - 0.5) * 1.5 * S);
        pts.push(x, y);
        up = !up;
      }
      const [lx, ly] = [pts[pts.length - 2], pts[pts.length - 1]];
      const flat = line(end, v, end + (c.w - 2 * pad) * 0.14, v, 0.25 * S);
      flat[0] = lx;
      flat[1] = ly;
      strokes.push({ pts: [...pts, ...flat.slice(2)], w: 2.2 * S, rgb: tone, a: 0.92 * f });
    }
    // 輪廓：每邊三筆，筆筆不同——超出角落一點、中段微彎、有的沒畫滿。
    const edges: [number, number, number, number][] = [
      [0, 0, c.w, 0],
      [c.w, 0, c.w, c.h],
      [c.w, c.h, 0, c.h],
      [0, c.h, 0, 0],
    ];
    for (let pass = 0; pass < 3; pass++)
      for (const [u0, v0, u1, v1] of edges) {
        const len = Math.hypot(u1 - u0, v1 - v0);
        const [du, dv] = [(u1 - u0) / len, (v1 - v0) / len];
        const over0 = (pass === 0 ? 4 : -2 + rand() * 8) * S;
        const over1 = pass === 2 ? -len * (0.1 + rand() * 0.25) : -1 + rand() * 6 * S;
        const shift = (rand() - 0.5) * 3.6 * S;
        const pts = line(
          u0 - du * over0 + -dv * shift,
          v0 - dv * over0 + du * shift,
          u1 + du * over1 + -dv * shift,
          v1 + dv * over1 + du * shift,
          (0.9 + rand() * 1.4) * S,
        );
        strokes.push({
          pts,
          w: (pass === 0 ? 1.6 : 1.1 - pass * 0.2) * S,
          rgb: ink,
          a: (pass === 0 ? 0.85 : 0.6) * f,
        });
      }
  });
  // ── 7. 停筆線的收尾：沿停筆線方向幾筆越畫越淡的長線。
  for (let k = 0; k < 7; k++) {
    const x0 = rand() * W * 0.7;
    const len = W * (0.12 + rand() * 0.25);
    const lift = (6 + rand() * 28) * S;
    const pts: number[] = [];
    for (let x = x0; x < Math.min(W - 2, x0 + len); x += 3 * S)
      pts.push(x, stopAt(x) - lift + (rand() - 0.5) * 1.2 * S);
    if (pts.length < 6 || crossesCard(pts)) continue;
    // 收尾線是炭筆與紙之間的中灰，一筆比一筆淡、細。
    strokes.push({
      pts,
      w: (2.6 - k * 0.22) * S,
      rgb: mix(ink, paper, 0.5),
      a: Math.max(0.12, 0.62 - k * 0.07),
    });
  }
  // 連線：粉彩筆觸。矛盾是斷筆，支持是實線，其他是沒染色的棉線。
  for (const s of inp.strings) {
    const [ax, ay] = [s.from[0] * S, s.from[1] * S];
    const [bx, by] = [s.to[0] * S, s.to[1] * S];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + s.sag * 2 * S;
    const rgb = s.kind === 'contra' ? RED : s.kind === 'support' ? GREEN : BONE;
    const n = 48;
    const q = (t: number) => [
      (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx,
      (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by,
    ];
    if (s.kind === 'contra') {
      for (let k = 0; k < n; k += 4) {
        const pts: number[] = [];
        for (let j = k; j <= Math.min(n, k + 2); j++) pts.push(...q(j / n));
        strokes.push({ pts, w: 3 * S, rgb, a: 0.9 });
      }
    } else {
      const pts: number[] = [];
      for (let j = 0; j <= n; j++) {
        const [x, y] = q(j / n);
        pts.push(x + (rand() - 0.5) * 0.8 * S, y + (rand() - 0.5) * 0.8 * S);
      }
      strokes.push({ pts, w: 2.6 * S, rgb, a: 0.9 });
    }
  }

  return { base, strokes, light };
}

/**
 * 7–8. 字：卡名與副標是畫家的手寫（--font-hand、炭筆色），寫在卡紙上；
 * 出處小字 14px 放在下緣沒畫完的紙上（設定集 6.6「法庭速寫 M. Osei 庭審第一日」）。
 */
export function drawSketchText(
  ctx: CanvasRenderingContext2D,
  o: {
    w: number;
    h: number;
    scale: number;
    cards: SketchCard[];
    ink: RGB;
    chalk: RGB;
    paper: RGB;
    light: boolean[];
    provenance: string;
    /** 手寫字型與字級（--fs-hand：桌機 18px、手機 16px）。 */
    fonts: { hand: string; size: number };
  },
) {
  const S = o.scale;
  ctx.save();
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  o.cards.forEach((c, i) => {
    ctx.save();
    ctx.translate(c.cx, c.cy);
    ctx.rotate(c.angle);
    ctx.translate(-c.w / 2, -c.h / 2);
    const tone = o.light[i] ? o.ink : o.chalk;
    ctx.fillStyle = `rgb(${tone.join(' ')} / 0.92)`;
    // 下緣：卡名（圖版的「F3 沃斯的心率」），小一號；內容是畫家照著卡抄的第一句。
    // 卡的高度已經照 cardTextLayout 撐開（JurySketch），字不會被切掉。
    const L = cardTextLayout(
      (font, x) => {
        ctx.font = font;
        return ctx.measureText(x).width;
      },
      c,
      o.fonts,
    );
    ctx.font = `400 ${L.ls}px ${o.fonts.hand}`;
    L.label.forEach((x, k) =>
      ctx.fillText(x, L.pad, c.h - L.pad - (L.label.length - k) * (L.ls + 2)),
    );
    if (c.motif === 'pulse') {
      // 斷點旁寫時刻。
      if (c.time) {
        ctx.font = `400 14px ${o.fonts.hand}`;
        ctx.fillText(c.time, L.pad, c.h * 0.3 + 15);
      }
    } else if (L.body.length) {
      ctx.font = `400 ${o.fonts.size}px ${o.fonts.hand}`;
      L.body.forEach((x, k) => ctx.fillText(x, L.pad, L.pad - 1 + k * L.lh));
    }
    ctx.restore();
  });
  // 出處：紙上的字，墨色淡一點，跟畫分開。
  ctx.fillStyle = `rgb(${mix(o.ink, o.paper, 0.25).join(' ')})`;
  // 出處是畫家手寫的圖說：同一支筆（文楷）。
  ctx.font = `400 14px ${o.fonts.hand}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(o.provenance, o.w - 16, o.h - 14);
  ctx.restore();
}

/** 不能放在行首的標點（中文避頭）、不能放在行尾的開括號（避尾）。 */
const NO_START = /^[，。、；：？！）」』〉》．,.;:!?)\]}…—]/;
const NO_END = /[（「『〈《([{]$/;

/** 字級單位：拉丁字連同後面的空白一組，中日韓一字一組，標點黏在前一組後面，開括號黏在後一組前面。 */
function charUnits(s: string) {
  const units: string[] = [];
  for (const m of s.matchAll(/[\p{Script=Latin}\p{N}'’\-/:.@]+\s*|\s+|./gsu)) {
    const u = m[0];
    if (units.length && (NO_START.test(u) || NO_END.test(units[units.length - 1])))
      units[units.length - 1] += u;
    else units.push(u);
  }
  return units;
}

/** 依序把單位放進一行，放不下就換行；行頭行尾的空白不留。 */
function pack(measure: (s: string) => number, units: string[], maxW: number) {
  const lines: string[] = [];
  let line = '';
  for (const u of units) {
    if (!line || measure((line + u).trimEnd()) <= maxW) {
      line += u;
      continue;
    }
    lines.push(line.trimEnd());
    line = u.trimStart();
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/**
 * 斷行：英文只在空白斷；中文以詞為單位，守避頭避尾（line-break: strict 的規則），末行至少四個漢字。
 * 單一個字比一行還寬才在字中間斷（等同 overflow-wrap: anywhere）。
 */
export function breakLines(measure: (s: string) => number, s: string, maxW: number): string[] {
  // 有中文：照紙面內文的規則切詞（詞、譯名、數字和量詞不拆，標點黏前、開括號黏後，末行至少四個漢字；
  // 設計師 r2 點名的「刷／卡」「閘／門。」）。沒有中文：字級單位，英文只在空白斷。
  const units = /\p{Script=Han}/u.test(s) ? proseUnits(s) : charUnits(s);
  return pack(measure, units, maxW).flatMap((l) => {
    if (measure(l) <= maxW) return [l];
    // 一個詞比一行還寬：這一行退回字級單位重排，行首行尾禁則照守；
    // 字級單位還是太寬（很長的英文字）才在字中間斷。
    return pack(measure, charUnits(l), maxW).flatMap((m) => {
      if (measure(m) <= maxW) return [m];
      const out: string[] = [];
      let cur = '';
      for (const ch of m) {
        if (cur && measure(cur + ch) > maxW) {
          out.push(cur);
          cur = ch;
        } else cur += ch;
      }
      return cur ? [...out, cur] : out;
    });
  });
}

/** 速寫卡上抄的內容：畫家只抄第一句（切在第一個「。」或「. 」），不抄到一半停筆。 */
export function firstSentence(s: string) {
  const zh = s.indexOf('。');
  const en = s.search(/[.!?] /);
  const at = [zh, en].filter((x) => x >= 0).sort((a, b) => a - b)[0];
  return at === undefined ? s : s.slice(0, at + 1);
}

/** 速寫卡的字要佔多高：卡名在下緣（14px，寫不下縮到 12px，再不下分兩行），內容在上面。 */
export function cardTextLayout(
  measure: (font: string, s: string) => number,
  c: Pick<SketchCard, 'w' | 'label' | 'body' | 'motif'>,
  fonts: { hand: string; size: number },
) {
  const pad = 9;
  const inner = c.w - 2 * pad;
  const at = (px: number) => `400 ${px}px ${fonts.hand}`;
  let ls = 14;
  const lw = measure(at(ls), c.label);
  if (lw > inner) ls = Math.max(12, Math.floor((14 * inner) / lw));
  const label = breakLines((x) => measure(at(ls), x), c.label, inner);
  const lh = Math.round(fonts.size * 1.25);
  const body =
    c.motif === 'lines' && c.body
      ? breakLines((x) => measure(at(fonts.size), x), firstSentence(c.body), inner)
      : [];
  // 內容在上、卡名在下，中間留 8px；照片和心率線另有圖，至少保留原本的高度。
  const need = pad + body.length * lh + (body.length ? 8 : 0) + label.length * (ls + 2) + pad;
  return { pad, inner, ls, label, lh, body, need };
}

/**
 * 畫一段筆觸（start 到 end）：線寬從起筆收到 22%。
 * 每一筆描成一個填滿的多邊形（兩側沿法線偏移），一筆只呼叫一次 fill，兩萬筆也畫得動。
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  strokes: Stroke[],
  start: number,
  end: number,
) {
  for (let i = Math.max(0, start); i < Math.min(end, strokes.length); i++) {
    const s = strokes[i];
    const p = s.pts;
    const n = p.length / 2;
    if (n < 2) continue;
    const left: number[] = [];
    const right: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1);
      const b = Math.min(n - 1, k + 1);
      let dx = p[b * 2] - p[a * 2];
      let dy = p[b * 2 + 1] - p[a * 2 + 1];
      const m = Math.hypot(dx, dy) || 1;
      dx /= m;
      dy /= m;
      const hw = (s.w * (1 - (0.78 * k) / (n - 1))) / 2;
      left.push(p[k * 2] - dy * hw, p[k * 2 + 1] + dx * hw);
      right.push(p[k * 2] + dy * hw, p[k * 2 + 1] - dx * hw);
    }
    ctx.fillStyle = `rgb(${Math.round(s.rgb[0])} ${Math.round(s.rgb[1])} ${Math.round(s.rgb[2])} / ${s.a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let k = 1; k < n; k++) ctx.lineTo(left[k * 2], left[k * 2 + 1]);
    for (let k = n - 1; k >= 0; k--) ctx.lineTo(right[k * 2], right[k * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }
}
