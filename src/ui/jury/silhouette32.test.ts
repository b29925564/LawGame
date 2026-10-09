import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { DA, JUDGE } from '../../engine/episode/trial';
import { LUCAS } from '../cast';
import data from './cast.json';
import { castLook } from './cast';
import jurors from './jurors.json';
import { inkOpacity, LIGHT, shapes, SIL, type JurorLook, type Poly } from './silhouette';

/**
 * 32px 測試（設定集第 7.6 章；設計師 10-09 第二輪）：J1 剪影柵格化成 26×32 二值圖，兩兩算 XOR ÷ 聯集，低於 12% 算撞。
 * 柵格化照剪影規格 §5 的做法：400×500 填多邊形 → resize(BOX) 縮成 26×32 → 門檻 128。
 * 標準（每集一個合池＝本集法庭上會說話的人＋本集陪審員候選人）：主要×陪審員 0 對、陪審員×陪審員 0 對、
 * 其餘（會說話的人之間、次要角色×陪審員）≤ 3 對；主角群 13 人之間 ≤ 3 對。以後改剪影參數就不會悄悄退步。
 */

const W = 400,
  H = 500,
  GW = 26,
  GH = 32;

// 柵格化逐位元照 Pillow 的 ImageDraw.polygon 與 resize(BOX)（設計師的參考數字就是這樣算的；
// 只是「差不多」的柵格器會讓 12.0% 附近的配對翻面）。
const roundUp = (f: number) => (f >= 0 ? Math.floor(f + 0.5) : -Math.floor(-f + 0.5));
const roundDown = (f: number) => (f >= 0 ? Math.ceil(f - 0.5) : -Math.ceil(-f - 0.5));

/** ImageDraw.polygon(fill)：頂點先截成整數，掃描線求交點、排序、兩兩之間填滿。每塊多邊形各自填，疊成聯集。 */
function fill(polys: Poly[]) {
  const m = new Uint8Array(W * H);
  for (const poly of polys) {
    const pts = poly.map(([x, y]) => [Math.trunc(x), Math.trunc(y)]);
    const n = pts.length;
    const edges: { a: number; b: number; dx: number; x0: number; y0: number }[] = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      if (i === n - 1 && x0 === pts[0][0] && y0 === pts[0][1]) continue;
      if (y0 === y1) continue;
      edges.push({ a: Math.min(y0, y1), b: Math.max(y0, y1), dx: (x1 - x0) / (y1 - y0), x0, y0 });
    }
    if (!edges.length) continue;
    const ymin = Math.max(0, Math.min(...edges.map((e) => e.a)));
    const ymax = Math.min(H, Math.max(...edges.map((e) => e.b)));
    for (let y = ymin; y <= ymax; y++) {
      const xx: number[] = [];
      for (const e of edges) {
        if (y >= e.a && y <= e.b) xx.push(Math.fround((y - e.y0) * Math.fround(e.dx) + e.x0));
        if (y === e.b && y < ymax) xx.push(xx[xx.length - 1]);
      }
      xx.sort((p, q) => p - q);
      if (y >= H) continue;
      for (let i = 1; i < xx.length; i += 2)
        for (let x = Math.max(0, roundUp(xx[i - 1])); x <= Math.min(W - 1, roundDown(xx[i])); x++)
          m[y * W + x] = 255;
    }
  }
  return m;
}

/** resize(BOX) 的係數：中心落在框內的來源像素等權，再轉成 22 位元定點。 */
function coeffs(inSize: number, outSize: number) {
  const scale = inSize / outSize,
    fs = Math.max(1, scale),
    support = 0.5 * fs;
  return Array.from({ length: outSize }, (_, o) => {
    const c = (o + 0.5) * scale;
    const lo = Math.max(0, Math.trunc(c - support + 0.5));
    const len = Math.min(inSize, Math.trunc(c + support + 0.5)) - lo;
    const w = Array.from({ length: len }, (_, x): number => {
      const t = (x + lo - c + 0.5) / fs;
      return t > -0.5 && t <= 0.5 ? 1 : 0;
    });
    const sum = w.reduce((p, q) => p + q, 0);
    return { lo, k: w.map((v) => Math.trunc((v / sum) * 2 ** 22 + 0.5)) };
  });
}
const clip8 = (v: number) => Math.min(255, Math.max(0, Math.floor(v / 2 ** 22)));
const CH = coeffs(W, GW),
  CV = coeffs(H, GH);

/** 先橫向後縱向兩次（中間結果取 8 位元），門檻 128。 */
function bits(polys: Poly[]) {
  const m = fill(polys);
  const tmp = new Uint8Array(GW * H);
  for (let y = 0; y < H; y++)
    CH.forEach(({ lo, k }, o) => {
      let ss = 2 ** 21;
      k.forEach((kv, i) => (ss += m[y * W + lo + i] * kv));
      tmp[y * GW + o] = clip8(ss);
    });
  const out: boolean[] = [];
  CV.forEach(({ lo, k }) => {
    for (let x = 0; x < GW; x++) {
      let ss = 2 ** 21;
      k.forEach((kv, i) => (ss += tmp[(lo + i) * GW + x] * kv));
      out.push(clip8(ss) >= 128);
    }
  });
  return out;
}

// 兩集都有同 id 的候選人（c-nurse、c-student…），參數不同：照物件快取，不照 id。
const cache = new WeakMap<JurorLook, boolean[]>();
const sil = (l: JurorLook) => {
  let b = cache.get(l);
  if (!b) cache.set(l, (b = bits(shapes(l, 'J1').fill)));
  return b;
};
/** XOR ÷ 聯集（%）。 */
function diff(a: JurorLook, b: JurorLook) {
  const A = sil(a),
    B = sil(b);
  let x = 0,
    u = 0;
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) x++;
    if (A[i] || B[i]) u++;
  }
  return (x / u) * 100;
}

const MAIN = data.main as JurorLook[];
const MAIN_IDS = new Set(MAIN.map((l) => l.id));
const COURT = new Set(['trial', 'defense', 'closing', 'voirdire']);
const SYSTEM = new Set(['旁白', '語音', '法院系統', LUCAS]);

/** 這一集法庭上會開口、用剪影的人（盧卡斯有定案立繪，不用剪影）。 */
function speakers(ep: string): JurorLook[] {
  const names = new Set<string>([JUDGE, DA]);
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.who === 'string') names.add(o.who);
      Object.values(o).forEach(walk);
    }
  };
  const e = episodes[ep as keyof typeof episodes];
  for (const s of e.scenes as { type: string; witness?: { name: string } }[])
    if (COURT.has(s.type)) {
      walk(s);
      if (s.witness) names.add(s.witness.name);
    }
  const out = new Map<string, JurorLook>();
  for (const n of names) {
    const l = SYSTEM.has(n) ? undefined : castLook(n);
    if (l) out.set(l.id, l);
  }
  return [...out.values()];
}

interface Pair {
  a: string;
  b: string;
  d: number;
}
function low(xs: JurorLook[], ys?: JurorLook[]): Pair[] {
  const out: Pair[] = [];
  xs.forEach((a, i) =>
    (ys ?? xs.slice(i + 1)).forEach((b) => {
      const d = diff(a, b);
      if (d < 12) out.push({ a: a.id, b: b.id, d: Math.round(d * 10) / 10 });
    }),
  );
  return out.sort((p, q) => p.d - q.d);
}

describe('32px 剪影測試（第 7.6 章）', () => {
  it('主角群 13 人之間低於 12% 的不超過 3 對', () => {
    expect(MAIN).toHaveLength(13);
    expect(low(MAIN).length).toBeLessThanOrEqual(3);
  });

  for (const ep of ['ep1', 'ep2'] as const) {
    const pool = jurors[ep] as JurorLook[];
    const talk = speakers(ep);
    const main = talk.filter((l) => MAIN_IDS.has(l.id));
    it(`${ep}：主要角色 × 陪審員 0 對`, () => {
      expect(low(main, pool)).toEqual([]);
    });
    it(`${ep}：陪審員之間 0 對`, () => {
      expect(low(pool)).toEqual([]);
    });
    // 次要角色和陪審員撞到也算在這 3 對裡（設計師預期的第 1 集兩對之一就是 c-clerk–奧瑪）。
    it(`${ep}：會說話的人之間（含次要角色 × 陪審員）不超過 3 對`, () => {
      const sec = talk.filter((l) => !MAIN_IDS.has(l.id));
      expect(low(talk).length + low(sec, pool).length).toBeLessThanOrEqual(3);
    });
  }
});

/** sRGB hex → CIE L*、C*、h（D65）。 */
function lch(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(Y) - 16,
    A = 500 * (f(X) - f(Y)),
    B = 200 * (f(Y) - f(Z));
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
/** 不透明度 a 的燈色疊在剪影的黑上。 */
function over(hex: string, a: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(a * ch(hex, i) + (1 - a) * ch(SIL, i)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

describe('剪影的燈色不進黃色禁區（設定集第 2 章）', () => {
  // 輪廓光、眼神光 .9、前臂 .85、配件受光 .8：每盞燈用到的最亮那一筆。
  const inks = Object.entries(LIGHT).flatMap(([id, l]) =>
    [l.k, ...(l.extra ? [l.extra.k] : [])].map((k) => ({ id, k })),
  );
  inks.push({ id: '陪審員', k: '--k-window,#ffe2c0' });
  for (const { id, k } of inks)
    it(`${id} ${k}`, () => {
      const { L, C, h } = lch(over(k.split(',')[1], inkOpacity(k, 0.9)));
      if (h >= 50 && h <= 100 && C > 30) expect(L).toBeLessThanOrEqual(68);
    });
});

// 給審查文件用：VITEST_32PX=1 時印出每集合池的結果（test-32px.txt）。
if (process.env.VITEST_32PX)
  it('印出合池結果', () => {
    const lines: string[] = [];
    lines.push(`主角群 13 人 78 對：<12% ${low(MAIN).length} 對`);
    for (const ep of ['ep1', 'ep2'] as const) {
      const pool = jurors[ep] as JurorLook[];
      const talk = speakers(ep);
      const all = [...talk, ...pool];
      const pairs = low(all);
      lines.push(
        `${ep}：說話者 ${talk.length}（${talk.map((l) => l.id).join('、')}）＋陪審員 ${pool.length}＝${all.length} 人 ${(all.length * (all.length - 1)) / 2} 對；<12% ${pairs.length} 對`,
      );
      for (const p of pairs) lines.push(`  ${p.d.toFixed(1)}%  ${p.a} – ${p.b}`);
      const near = all
        .flatMap((a, i) => all.slice(i + 1).map((b) => ({ a: a.id, b: b.id, d: diff(a, b) })))
        .sort((p, q) => p.d - q.d)
        .slice(pairs.length, pairs.length + 3);
      lines.push(`  再來最接近：${near.map((p) => `${p.a}–${p.b} ${p.d.toFixed(1)}%`).join('、')}`);
    }
    console.log(lines.join('\n'));
  });
