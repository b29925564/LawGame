/**
 * 陪審團視角的粉彩速寫引擎（設定集 8.6、9 章 RD-ART-0903-J）。
 * 法庭只能被畫、不能被拍：速寫畫家 M. Osei 只畫陪審團聽過的東西。
 *
 * 輸入是「同一個畫面」的亮度（這裡由板子的版面直接算：軟木 × 吊燈光圈，卡片是紙），
 * 輸出是一張鋼灰紙上的炭筆＋粉彩：
 *   1. 亮度 5%–98.5% 拉到 0–1、gamma 1.7、模糊 3px
 *   2. 分階：< .12 炭、< .24 炭紙混、< .48 紙、< .70 淺粉彩（帶 15–35% 原色）、以上粉筆白
 *   3. 紙紋：模糊後拉對比的雜訊＋沿筆觸方向的條紋；覆蓋率依階，紙色從粉彩之間透出來
 *   4. 筆觸：順著光圈切線與卡片邊走；長度依亮度三級，起筆粗收筆細，30% 疊一筆反向細筆
 *   5. 邊界用斜向短筆觸抖開；最暗處加稀疏 45° 排線
 *   6. 卡片輪廓、連線用炭筆／粉彩再勾一次
 *   7. 下緣是沒畫完的紙：停筆線以下只剩紙紋
 *   8. 右下角簽名（出處標記，不翻譯、不隨主題變）
 * 固定種子：同一個版面每次畫出來都一樣。
 */

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
  /** 吊燈：離中心的距離（以半寬為 1）→ 亮度倍率。 */
  lamp: (d: number) => number;
  base: { lum: number; rgb: RGB };
  paper: RGB;
  ink: RGB;
  chalk: RGB;
  signature: string;
  fonts: { doc: string; hand: string };
};

/** 一筆：一串點，起筆粗、收筆細。 */
type Stroke = { pts: number[]; w: number; rgb: RGB; a: number };

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
  /** 最後才寫的字：卡片內容與簽名。 */
  text: (ctx: CanvasRenderingContext2D) => void;
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

  // ── 1. 亮度場：軟木 × 吊燈，卡片是紙（也在燈下）。
  const raw = new Float32Array(W * H);
  const half = W / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W / 2, y - H / 2) / half;
      let lum = inp.base.lum;
      for (const c of cards) if (inCard(c, x, y)) lum = c.lum;
      raw[y * W + x] = lum * inp.lamp(d);
    }
  // 5%–98.5% 拉到 0–1，gamma 1.7（速寫畫家把暗部畫得比相機亮），模糊 3px。
  const sorted = Float32Array.from(raw).sort();
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  // 上限至少是滿光下的白紙：板上卡少時，軟木不會被拉成最亮的一階。
  const hi = Math.max(sorted[Math.floor(sorted.length * 0.985)], 0.95);
  const norm = new Float32Array(W * H);
  for (let i = 0; i < norm.length; i++)
    norm[i] = Math.pow(Math.min(1, Math.max(0, (raw[i] - lo) / Math.max(1e-6, hi - lo))), 1 / 1.7);
  const L = boxBlur(norm, W, H, Math.round(3 * S));
  // 筆觸方向用更大的模糊：順著光圈的切線，而不是逐像素的雜訊。
  const F = boxBlur(boxBlur(norm, W, H, Math.round(10 * S)), W, H, Math.round(6 * S));
  const at = (a: Float32Array, x: number, y: number) =>
    a[
      Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))
    ];

  // 原色：軟木或卡片紙（淺粉彩帶 15–35% 原色）。
  const hueAt = (x: number, y: number): RGB => {
    for (let i = cards.length - 1; i >= 0; i--) if (inCard(cards[i], x, y)) return cards[i].rgb;
    return inp.base.rgb;
  };

  // ── 下緣沒畫完：停筆線（兩個正弦疊出的粗糙邊）；以上 46px 乾擦變薄。
  const band = (70 + ((inp.w - 640) * 90) / 800) * S;
  const p1 = rand() * 6;
  const p2 = rand() * 6;
  const stopAt = (x: number) =>
    H -
    Math.max(40 * S, band) +
    Math.sin(x / (W / 3.1) + p1) * 9 * S +
    Math.sin(x / (W / 11.7) + p2) * 4 * S;
  const dry = 46 * S;
  const fade = (x: number, y: number) => {
    const s = stopAt(x);
    if (y >= s) return 0;
    return Math.min(1, (s - y) / dry);
  };

  // ── 紙紋：模糊 1px 的雜訊拉對比，加上 30° 方向的條紋。
  const noise = new Float32Array(W * H);
  for (let i = 0; i < noise.length; i++) noise[i] = rand();
  const nb = boxBlur(noise, W, H, Math.max(1, Math.round(S)));
  const tooth = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const streak = 0.5 + 0.5 * Math.sin((x * 0.5 + y * 0.87) / (2.2 * S) + nb[i] * 4);
      tooth[i] = Math.min(1, Math.max(0, (nb[i] - 0.5) * 3.2 + 0.5)) * 0.7 + streak * 0.3;
    }

  // 卡片裡面是乾淨的紙：背景排線不畫進卡裡（輪廓另外勾）。
  const onCard = (x: number, y: number) => cards.some((c) => inCard(c, x, y));

  // ── 2–3. 分階上色，紙紋決定哪裡吃到粉彩。
  const ink = inp.ink;
  const chalk = inp.chalk;
  const paper = inp.paper;
  const base = new ImageData(W, H);
  const tierOf = (v: number) => (v < 0.12 ? 0 : v < 0.24 ? 1 : v < 0.48 ? 2 : v < 0.7 ? 3 : 4);
  const cover = [0.6, 0.5, 0, 0.65, 0.8];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = L[i];
      const t = tierOf(v);
      let col: RGB;
      const f = fade(x, y);
      // 卡紙吃粉筆比較滿，字才讀得出來。
      const c = t === 4 && onCard(x, y) ? 0.93 : cover[t];
      if (t !== 2 && f > 0 && tooth[i] < c * f) {
        if (t === 0) col = mix(ink, paper, 0.08);
        else if (t === 1) col = mix(ink, paper, 0.45);
        else if (t === 3)
          col = mix(
            mix(paper, chalk, 0.45),
            hueAt(x, y),
            0.15 + 0.2 * ((v - 0.48) / 0.22) * (onCard(x, y) ? 1 : 0),
          );
        else col = chalk;
      } else {
        // 紙本身也有一點紋理。
        col = mix(paper, ink, (0.5 - tooth[i]) * 0.06);
      }
      const o = i * 4;
      base.data[o] = col[0];
      base.data[o + 1] = col[1];
      base.data[o + 2] = col[2];
      base.data[o + 3] = 255;
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
      // 切線＝梯度轉 90°；梯度太小（光圈正中）就沿 30° 走。
      let tx = m > 1e-5 ? -gy / m : 0.87;
      let ty = m > 1e-5 ? gx / m : 0.5;
      tx *= dir;
      ty *= dir;
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
      const p = 0.06 + 0.1 * (1 - v);
      if (rand() > p) continue;
      const sx = x + rand() * step;
      const sy = y + rand() * step;
      if (fade(sx, sy) <= 0.05 || onCard(sx, sy)) continue;
      const len = (v < 0.3 ? 16 + rand() * 10 : v < 0.62 ? 9 + rand() * 6 : 4 + rand() * 4) * S;
      const pts = trace(sx, sy, len, rand() < 0.5 ? 1 : -1);
      if (pts.length < 6) continue;
      const c = colorOf(v);
      const w0 = (0.9 + rand() * 1.3) * S;
      strokes.push({ pts, w: w0, rgb: c.rgb, a: c.a * fade(sx, sy) });
      if (rand() < 0.3) {
        const back = pts.slice();
        const rev: number[] = [];
        for (let k = back.length - 2; k >= 0; k -= 2)
          rev.push(back[k] + S * 0.6, back[k + 1] + S * 0.4);
        strokes.push({ pts: rev, w: w0 * 0.6, rgb: c.rgb, a: c.a * 0.8 * fade(sx, sy) });
      }
    }

  // ── 5. 邊界抖開：斜向短筆觸（1440×860 上 26,000 條，依面積換算）。
  const dith = Math.round((26000 * W * H) / (1440 * 860 * S * S));
  for (let k = 0; k < dith; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const f = fade(x, y);
    if (f <= 0.1 || onCard(x, y)) continue;
    const v = Math.min(1, Math.max(0, at(L, x, y) + (rand() - 0.5) * 0.12));
    const c = colorOf(v);
    const l = (3 + rand() * 6) * S;
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
    const l = (10 + rand() * 12) * S;
    strokes.push({ pts: [x, y, x + l * 0.71, y + l * 0.71], w: 0.9 * S, rgb: ink, a: 0.5 });
  }
  // 依畫的順序：先背景排線（由外往內），卡片輪廓和連線最後。
  strokes.sort(
    (a, b) =>
      Math.hypot(b.pts[0] - W / 2, b.pts[1] - H / 2) -
      Math.hypot(a.pts[0] - W / 2, a.pts[1] - H / 2),
  );

  // ── 6. 卡片輪廓：炭筆勾兩次，每次有一點抖。
  for (const c of cards) {
    const cs = corners(c);
    for (let pass = 0; pass < 2; pass++)
      for (let e = 0; e < 4; e++) {
        const [ax, ay] = cs[e];
        const [bx, by] = cs[(e + 1) % 4];
        const pts: number[] = [];
        const n = 8;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pts.push(
            ax + (bx - ax) * t + (rand() - 0.5) * 1.2 * S,
            ay + (by - ay) * t + (rand() - 0.5) * 1.2 * S,
          );
        }
        strokes.push({ pts, w: (1.4 - pass * 0.5) * S, rgb: ink, a: 0.85 * fade(c.cx, c.cy) });
      }
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

  // ── 7–8. 字：卡片內容用粉筆或炭筆（看卡在第幾階），簽名在右下角留白的紙上。
  const text = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.textBaseline = 'top';
    for (const c of cards) {
      const v = at(L, c.cx, c.cy);
      ctx.save();
      ctx.translate(c.cx, c.cy);
      ctx.rotate(c.angle);
      ctx.fillStyle = v >= 0.48 ? `rgb(${ink.join(' ')} / 0.9)` : `rgb(${chalk.join(' ')} / 0.85)`;
      ctx.font = `600 ${13 * S}px ${inp.fonts.doc}`;
      const pad = 10 * S;
      wrap(ctx, c.label, -c.w / 2 + pad, -c.h / 2 + pad + 4 * S, c.w - 2 * pad, 18 * S, 2);
      if (c.sub) {
        ctx.font = `400 ${12 * S}px ${inp.fonts.doc}`;
        wrap(ctx, c.sub, -c.w / 2 + pad, -c.h / 2 + pad + 42 * S, c.w - 2 * pad, 17 * S, 2);
      }
      ctx.restore();
    }
    ctx.fillStyle = `rgb(${ink.join(' ')})`;
    ctx.font = `400 ${17 * S}px ${inp.fonts.hand}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(inp.signature, W - 18 * S, H - 16 * S);
    ctx.restore();
  };

  return { base, strokes, text };
}

function wrap(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  lines: number,
) {
  let line = '';
  let n = 0;
  for (const ch of s) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      if (n === lines - 1) {
        ctx.fillText(line.slice(0, -1) + '…', x, y + n * lh);
        return;
      }
      ctx.fillText(line, x, y + n * lh);
      n++;
      line = ch;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}

/**
 * 畫一段筆觸（start 到 end）：線寬從起筆收到 22%。
 * 每一筆描成一個填滿的多邊形（兩側沿法線偏移），一筆只呼叫一次 fill，兩萬筆也畫得動。
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  start: number,
  end: number,
) {
  for (let i = start; i < end; i++) {
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
