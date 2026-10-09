/**
 * 陪審員剪影替身（設定集第 7.6、8.2、8.4 章）。照視覺設計師 #2 的參考實作
 * ux/jury-silhouettes/jury-silhouette.mjs v1 移植，數字一個都不改；要改先問視覺設計師。
 *
 * 座標 400×500（y 向下），兩眼連線 y = 190，頸根 N = (225, 365)，下巴 y = 342。
 * 每個形狀都是頂點多邊形，姿勢一律用第 8.2 章的頂點 morph，不准整張 transform。
 */

export type Pt = [number, number];
export type Poly = Pt[];
export type Pose = 'J1' | 'J2' | 'J3' | 'J4';
type Size = 'narrow' | 'medium' | 'wide';

export interface JurorLook {
  id: string;
  hair: string;
  build?: Size;
  head?: Size;
  jaw?: 'round' | 'square' | 'long';
  slope?: number;
  lift?: number;
  beard?: 'full' | 'goatee';
  acc?: string[];
  glasses?: 'round' | 'square' | 'cateye' | 'aviator';
  /** 席號（入座後才有）。 */
  no?: string;
}

const N: Pt = [225, 365];
const CX = 208,
  CY = 206,
  RY = 136; // 頭（轉向畫面左 20°，所以頭心在頸根左邊）
const BUILD = {
  narrow: { sw: 122, nw: 28 },
  medium: { sw: 158, nw: 35 },
  wide: { sw: 198, nw: 44 },
};
const HEAD = { narrow: 86, medium: 98, wide: 110 };

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rad = (d: number) => (d * Math.PI) / 180;
const ell = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 48) => {
  const pts: Poly = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

interface Head {
  pts: Poly;
  rx: number;
  ry: number;
}

// ── 頭：上半橢圓，下半往下巴收（jaw 0.82 圓、0.9 方、0.8 長）
function head(p: JurorLook): Head {
  const rx = HEAD[p.head || 'medium'],
    jaw = p.jaw === 'square' ? 0.9 : p.jaw === 'long' ? 0.8 : 0.82;
  const ry = p.jaw === 'long' ? RY + 8 : RY;
  const pts: Poly = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * 2 * Math.PI,
      s = Math.sin(a);
    const k = s > 0 ? 1 - (1 - jaw) * Math.pow(s, 1.6) : 1; // 下半收窄
    pts.push([CX + rx * Math.cos(a) * k, CY + ry * s]);
  }
  return { pts, rx, ry };
}

interface Torso {
  neck: Poly;
  sh: Poly;
  b: { sw: number; nw: number };
  sl: number;
}

// ── 頸與肩
function torso(p: JurorLook): Torso {
  const b = BUILD[p.build || 'medium'],
    sl = p.slope ?? 14,
    x = N[0];
  const L = (dx: number, y: number): Pt => [x - dx, y],
    R = (dx: number, y: number): Pt => [x + dx, y];
  const neck = [
    L(b.nw, 300 - (p.lift || 0)),
    R(b.nw, 300 - (p.lift || 0)),
    R(b.nw + 4, 372),
    L(b.nw + 4, 372),
  ];
  const sh = [
    L(b.nw + 2, 366),
    L(b.sw * 0.5, 386 + sl * 0.4),
    L(b.sw * 0.82, 404 + sl),
    L(b.sw, 432 + sl * 1.2),
    L(b.sw + 8, 500),
    R(b.sw + 8, 500),
    R(b.sw, 432 + sl * 1.2),
    R(b.sw * 0.82, 404 + sl),
    R(b.sw * 0.5, 386 + sl * 0.4),
    R(b.nw + 2, 366),
  ];
  return { neck, sh, b, sl };
}

// ── 髮型（外輪廓；內側點落在頭裡，和頭同色，聯集就是剪影）
function hair(p: JurorLook, h: Head): Poly[] {
  const rx = h.rx,
    ry = h.ry,
    top = CY - ry;
  const arc = (th: (a: number) => number, a0 = 180, a1 = 360, n = 64) => {
    const o: Poly = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const t = th(a);
      o.push([CX + (rx + t) * Math.cos(rad(a)), CY + (ry + t) * Math.sin(rad(a))]);
    }
    return o;
  };
  const inside: Poly = [
    [CX + rx * 0.7, CY - 10],
    [CX - rx * 0.7, CY - 10],
  ];
  const S: Poly[] = [];
  switch (p.hair) {
    case 'crew': {
      // 平頭：頂是平的
      const o = arc(() => 7, 195, 345).map(([x, y]): Pt => [x, Math.max(y, top - 2)]);
      S.push(o.concat(inside));
      break;
    }
    case 'buzz':
      S.push(arc(() => 4, 190, 350).concat(inside));
      break;
    case 'bald': // 只剩耳上一圈
      S.push(
        arc(() => 5, 160, 200, 16).concat([[CX - rx * 0.6, CY + 10]]),
        arc(() => 6, 330, 380, 16).concat([[CX + rx * 0.6, CY + 10]]),
      );
      break;
    case 'receding':
      S.push(
        arc(() => 7, 155, 215, 20).concat([[CX - rx * 0.6, CY + 10]]),
        arc(() => 8, 300, 385, 30).concat([[CX + rx * 0.5, CY + 10]]),
      );
      break;
    case 'sidepart': // 前側（左）較蓬
      S.push(arc((a) => 13 + 9 * ss(250, 205, a), 185, 352).concat(inside));
      break;
    case 'quiff':
      S.push(arc((a) => 10 + 30 * Math.exp(-(((a - 235) / 22) ** 2)), 185, 350).concat(inside));
      break;
    case 'curly':
      S.push(arc((a) => 36 + 7 * Math.sin(rad(a * 14)), 170, 370, 120).concat(inside));
      break;
    case 'afro':
      S.push(
        arc((a) => 66 + 5 * Math.sin(rad(a * 18)), 160, 380, 140).concat([
          [CX + rx * 0.8, CY + 30],
          [CX - rx * 0.8, CY + 30],
        ]),
      );
      break;
    case 'shaggy':
      S.push(
        arc((a) => 20 + 6 * Math.sin(rad(a * 9)) + 10 * ss(300, 360, a), 175, 372, 90).concat([
          [CX + rx * 0.9, CY + 40],
          [CX - rx * 0.7, CY],
        ]),
      );
      break;
    case 'pixie': // 額前一撮
      S.push(arc((a) => 12 + 14 * Math.exp(-(((a - 205) / 18) ** 2)), 175, 352).concat(inside));
      break;
    case 'bouffant':
      S.push(arc((a) => 14 + 44 * Math.sin(rad(a - 180)) ** 2, 175, 365, 80).concat(inside));
      break;
    case 'topknot':
      S.push(arc(() => 8, 190, 350).concat(inside), ell(CX + 26, top - 14, 22, 20, 0, 360, 32));
      break;
    case 'topbun':
      S.push(arc(() => 10, 185, 355).concat(inside), ell(CX + 14, top - 22, 32, 28, 0, 360, 36));
      break;
    case 'ponytail': {
      // 高馬尾往後（右）甩
      S.push(arc(() => 10, 185, 355).concat(inside));
      S.push([
        [CX + rx * 0.55, top + 30],
        [CX + rx + 16, top + 10],
        [CX + rx + 44, top + 40],
        [CX + rx + 40, CY - 10],
        [CX + rx + 22, CY + 60],
        [CX + rx + 6, CY + 20],
        [CX + rx * 0.7, top + 60],
      ]);
      break;
    }
    case 'wavy': {
      // 及肩波浪
      const o = arc(() => 18, 160, 380, 80);
      S.push(o.concat(inside));
      const side = (sgn: number) => {
        const xs = CX + sgn * (rx + 14),
          pts: Poly = [];
        for (let y = CY - 10; y <= 368; y += 8)
          pts.push([xs + sgn * (6 * Math.sin(y / 14) + (y - CY) * 0.12), y]);
        pts.push([CX + sgn * (rx - 30), 360], [CX + sgn * (rx - 40), CY]);
        return pts;
      };
      S.push(side(-1), side(1));
      break;
    }
    case 'long': {
      // 過肩長直髮
      S.push(arc(() => 14, 165, 375, 80).concat(inside));
      const side = (sgn: number): Poly => [
        [CX + sgn * (rx + 12), CY - 20],
        [CX + sgn * (rx + 20), CY + 80],
        [CX + sgn * (rx + 26), 420],
        [CX + sgn * (rx - 10), 430],
        [CX + sgn * (rx - 34), CY + 40],
      ];
      S.push(side(-1), side(1));
      break;
    }
    case 'braid': {
      // 一條長辮從前肩（左）垂下
      S.push(arc(() => 9, 180, 355).concat(inside));
      const b: Poly = [];
      for (let y = CY + 40; y <= 480; y += 14) {
        const w = 13 - (y - CY) * 0.012;
        b.push([CX - rx + 2 - w + 4 * Math.sin(y / 9), y]);
      }
      const back = b
        .slice()
        .reverse()
        .map(([x, y]): Pt => [x + 26, y]);
      S.push(b.concat(back));
      break;
    }
    case 'headscarf-knot': {
      // 頭巾綁在頭頂後側，結往右上翹
      S.push(
        arc(() => 12, 180, 365)
          .map(([x, y]): Pt => [x, Math.max(y, top - 8)])
          .concat(inside),
      );
      S.push([
        [CX + rx * 0.4, top + 4],
        [CX + rx * 0.9, top - 30],
        [CX + rx + 10, top - 8],
        [CX + rx * 0.8, top + 20],
      ]);
      break;
    }
    case 'cap': {
      // 鴨舌帽：帽冠＋帽簷往前（左）伸
      S.push(
        arc(() => 18, 185, 355)
          .map(([x, y]): Pt => [x, Math.max(y, top - 16)])
          .concat(inside),
      );
      S.push([
        [CX - rx * 0.4, top + 40],
        [CX - rx - 80, top + 56],
        [CX - rx - 78, top + 72],
        [CX - rx * 0.3, top + 66],
      ]);
      break;
    }
    case 'mohawk': // 兩側推短、頂上一束
      S.push(arc((a) => 6 + 34 * Math.exp(-(((a - 270) / 30) ** 2)), 190, 350).concat(inside));
      break;
  }
  return S;
}

// ── 鬍子、配件（會改外輪廓的才算剪影鉤子）
function extras(p: JurorLook, h: Head, t: Torso) {
  const S: Poly[] = [],
    H: Poly[] = [],
    rx = h.rx,
    top = CY - h.ry,
    x = N[0],
    b = t.b;
  if (p.beard === 'full')
    H.push(
      ell(CX, CY + 70, rx * 0.86 + 8, 86, 10, 170, 40).concat([
        [CX + rx * 0.7, CY + 20],
        [CX - rx * 0.7, CY + 20],
      ]),
    );
  if (p.beard === 'goatee') H.push(ell(CX - 6, 344, 22, 22, 0, 180, 20).concat([[CX - 28, 330]]));
  for (const a of p.acc || []) {
    if (a === 'hood')
      S.push([
        [x - 6, 330],
        [x + 40, 316],
        [x + 96, 342],
        [x + 118, 392],
        [x + 60, 392],
        [x + 10, 372],
      ]); // 帽 T 帽子堆在頸後
    if (a === 'collar')
      S.push(
        [
          [x - b.nw - 6, 372],
          [x - b.nw + 2, 338],
          [x - b.nw + 22, 368],
        ],
        [
          [x + b.nw + 6, 372],
          [x + b.nw - 2, 338],
          [x + b.nw - 22, 368],
        ],
      ); // 襯衫領尖
    if (a === 'popped')
      S.push(
        [
          [x - b.nw - 14, 376],
          [x - b.nw - 6, 326],
          [x - b.nw + 14, 360],
        ],
        [
          [x + b.nw + 14, 376],
          [x + b.nw + 6, 326],
          [x + b.nw - 14, 360],
        ],
      ); // 立起的外套領
    if (a === 'scarf')
      S.push([
        [x - b.nw - 22, 334],
        [x + b.nw + 22, 334],
        [x + b.nw + 28, 392],
        [x - b.nw - 28, 392],
      ]);
    if (a === 'headphones')
      S.push(
        ell(x - b.nw - 10, 352, 20, 24, 0, 360, 28),
        ell(x + b.nw + 10, 352, 20, 24, 0, 360, 28),
      ); // 掛在脖子上的耳機
    if (a === 'strap')
      S.push([
        [x - b.sw * 0.62, 392],
        [x - b.sw * 0.5, 378],
        [x - b.sw * 0.3, 384],
        [x - b.sw * 0.3, 410],
      ]); // 後背包肩帶（近側）
    if (a === 'epaulette')
      S.push(
        [
          [x - b.sw * 0.9, 406],
          [x - b.sw * 0.55, 384],
          [x - b.sw * 0.5, 394],
          [x - b.sw * 0.86, 418],
        ],
        [
          [x + b.sw * 0.9, 406],
          [x + b.sw * 0.55, 384],
          [x + b.sw * 0.5, 394],
          [x + b.sw * 0.86, 418],
        ],
      );
    if (a === 'pads')
      S.push(
        [
          [x - b.sw - 6, 420 + t.sl],
          [x - b.sw * 0.7, 392],
          [x - b.sw * 0.6, 402],
          [x - b.sw - 2, 436 + t.sl],
        ],
        [
          [x + b.sw + 6, 420 + t.sl],
          [x + b.sw * 0.7, 392],
          [x + b.sw * 0.6, 402],
          [x + b.sw + 2, 436 + t.sl],
        ],
      ); // 西裝墊肩
    if (a === 'hoops')
      H.push(ell(CX - rx * 0.86, 262, 9, 12, 0, 360, 20).concat([[CX - rx * 0.86 + 4, 248]])); // 近側耳環
    if (a === 'pencil')
      H.push([
        [CX + 20, top - 30],
        [CX + 66, top - 74],
        [CX + 72, top - 68],
        [CX + 28, top - 24],
      ]); // 髮髻上的鉛筆
    if (a === 'readers')
      H.push([
        [CX - rx * 0.5, top + 18],
        [CX - rx * 0.1, top - 4],
        [CX + rx * 0.2, top - 2],
        [CX + rx * 0.1, top + 16],
      ]); // 推到頭頂的老花眼鏡
  }
  return { head: H, body: S };
}

// 眼鏡只畫線（第 8.4 章：0.8px、不透明度 ≤ 0.6），不進剪影
function glasses(p: JurorLook): Poly[] {
  const ex = CX - 52,
    ey = 190;
  if (p.glasses === 'round')
    return [
      ell(ex, ey, 20, 20, 0, 360, 24),
      [
        [ex + 20, ey],
        [CX + 40, ey - 4],
      ],
    ];
  if (p.glasses === 'square')
    return [
      [
        [ex - 22, ey - 14],
        [ex + 22, ey - 14],
        [ex + 22, ey + 14],
        [ex - 22, ey + 14],
        [ex - 22, ey - 14],
      ],
      [
        [ex + 22, ey - 6],
        [CX + 40, ey - 8],
      ],
    ];
  if (p.glasses === 'cateye')
    return [
      [
        [ex - 24, ey - 18],
        [ex + 20, ey - 10],
        [ex + 16, ey + 12],
        [ex - 18, ey + 12],
        [ex - 24, ey - 18],
      ],
      [
        [ex + 20, ey - 8],
        [CX + 40, ey - 8],
      ],
    ];
  if (p.glasses === 'aviator')
    return [
      [
        [ex - 22, ey - 14],
        [ex + 22, ey - 14],
        [ex + 18, ey + 16],
        [ex - 4, ey + 22],
        [ex - 20, ey + 10],
        [ex - 22, ey - 14],
      ],
      [
        [ex + 22, ey - 10],
        [CX + 40, ey - 10],
      ],
    ];
  return [];
}

// ── 姿勢 morph（第 8.2 章，逐字照抄）
const POSE: Record<Pose, [number, number, number, number]> = {
  J1: [0, 0, 0, 0],
  J2: [-14, 21, -18, 6],
  J3: [6, -10, 14, -4],
  J4: [-24, 32, -10, 8],
};
export function morph([px, py]: Pt, pose: Pose): Pt {
  const [deg, drop, dx, dy] = POSE[pose];
  if (pose === 'J1') return [px, py];
  const wH = ss(380, 300, py),
    wS = ss(500, 380, py),
    th = rad(deg);
  const rx = Math.cos(th) * (px - N[0]) - Math.sin(th) * (py - N[1]) + N[0];
  const ry = Math.sin(th) * (px - N[0]) + Math.cos(th) * (py - N[1]) + N[1];
  return [px + wH * (rx - px) + wS * dx, py + wH * (ry - py + drop) + wS * dy];
}

// 第 8.4 章臉光，v 先量化成四階代表值（規格 v2.0 §18，10-09 裁定）
export const band = (v: number) => (v >= 70 ? 85 : v >= 50 ? 60 : v >= 25 ? 40 : 35);
export const shadowPct = (v: number) => (v >= 70 ? 0 : v >= 50 ? 30 : v >= 25 ? 60 : 90);
export const poseFor = (v: number): Pose => (v >= 70 ? 'J3' : v < 50 ? 'J2' : 'J1');
/**
 * 影子的寬（SVG 單位，卡面 400 寬）：量的是頭，不是卡面（10-09 修正）。
 * 左緣 x = CX + rx − p×2rx：30% 吃掉後腦，60% 吃到眼睛後方，90% 只剩臉前緣輪廓光。
 */
export function shadowWidth(p: JurorLook, v: number) {
  const sh = shadowPct(v),
    rx = HEAD[p.head || 'medium'];
  return sh ? 400 - (CX + rx - (sh / 100) * 2 * rx) : 0;
}
/** 刻痕只有五格（0／25／50／75／100），不讓玩家用像素反推數值（第 8.4 章）。 */
export const tick = (v: number) => Math.round(v / 25) * 25;

export function shapes(p: JurorLook, pose: Pose = 'J1') {
  const h = head(p),
    t = torso(p);
  const up = (poly: Poly): Poly => poly.map(([x, y]): Pt => [x, y - (p.lift || 0)]); // lift：坐高（頸長），頭部整組上下移
  const ex = extras(p, h, t);
  const fill: Poly[] = [
    up(h.pts),
    t.neck,
    t.sh,
    ...hair(p, h).map(up),
    ...ex.head.map(up),
    ...ex.body,
  ];
  if (pose === 'J3')
    fill.push([
      [N[0] - 120, 436],
      [N[0] + 120, 436],
      [N[0] + 124, 500],
      [N[0] - 124, 500],
    ]); // 抱胸前臂
  const m = (poly: Poly) => poly.map((q) => morph(q, pose));
  return {
    fill: fill.map(m),
    glasses: glasses(p).map(up).map(m),
    eye: m(up(ell(CX - 52, 190, 9, 5, 0, 360, 16))),
    head: h,
  };
}

const d = (poly: Poly, close = true) =>
  'M' + poly.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + (close ? 'Z' : '');

/**
 * 一張卡面的 SVG（viewBox 400×500）。影子不在這裡：影子要能 300ms 移動（--dur-shadow），
 * 由元件疊一層 HTML 遮罩（參考實作把影子畫在 SVG 裡，形狀與羽化照抄到 CSS）。
 * label：虛線框上的字（已翻譯，「待放 AI 立繪」加席號）；空字串＝不畫框。
 */
export function svg(
  p: JurorLook,
  {
    v = 60,
    pose,
    label = '',
    uid = p.id,
  }: { v?: number; pose?: Pose; label?: string; uid?: string } = {},
) {
  pose = pose || poseFor(v);
  const s = shapes(p, pose),
    vb = band(v),
    tt = Math.min(1, Math.max(0, (vb - 35) / 50));
  const key = 10 + 46 * tt,
    rimTop = 225 - 135 * tt; // 第 8.4 章 keyWidth、rimTop
  const sil = s.fill.map((q) => `<path d="${d(q)}"/>`).join(''); // 每塊各自一條 path：合成一條會因繞向相反挖出洞
  const notes =
    pose === 'J4'
      ? `<path d="M150 470h140v30h-140z" fill="var(--k-window,#ffe2c0)" opacity=".4"/>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" class="juror-svg" data-pose="${pose}" aria-hidden="true" focusable="false">
<defs>
 <mask id="lit-${uid}"><rect width="400" height="500" fill="#000"/><g fill="#fff">${sil}</g><g fill="#000" transform="translate(${key.toFixed(1)} 0)">${sil}</g></mask>
 <filter id="rim-${uid}" x="-5%" y="-5%" width="110%" height="110%"><feMorphology in="SourceAlpha" operator="erode" radius="8" result="er"/><feComposite in="SourceAlpha" in2="er" operator="out" result="edge"/><feOffset in="edge" dx="-2" result="sh"/><feComposite in="sh" in2="SourceAlpha" operator="in" result="band"/><feFlood flood-color="#ffe2c0"/><feComposite in2="band" operator="in"/></filter>
 <clipPath id="rimclip-${uid}"><rect x="0" y="${rimTop.toFixed(1)}" width="215" height="${(342 - rimTop).toFixed(1)}"/>${rimTop < CY ? `<rect x="0" y="0" width="262" height="${(rimTop + 24).toFixed(1)}"/>` : ''}<rect x="0" y="372" width="160" height="60"/></clipPath>
</defs>
<rect width="400" height="500" fill="var(--cine-bg,#06080b)"/>
<g class="silhouette" fill="#07090c">${sil}</g>
<rect width="400" height="500" fill="var(--k-window,#ffe2c0)" opacity=".10" mask="url(#lit-${uid})"/>
<g clip-path="url(#rimclip-${uid})"><g filter="url(#rim-${uid})" opacity=".9">${sil}</g></g>
${s.glasses.map((q) => `<path d="${d(q, false)}" fill="none" stroke="#c9ced6" stroke-width="5.7" opacity=".5"/>`).join('')}
${pose === 'J4' ? '' : `<path d="${d(s.eye)}" fill="#1a1f26"/><rect x="${(s.eye[0][0] - 12).toFixed(1)}" y="${(s.eye[0][1] - 4).toFixed(1)}" width="5" height="5" fill="var(--k-window,#ffe2c0)" opacity=".9"/>`}
${notes}
${pose === 'J3' ? `<path d="${d([morph([N[0] - 120, 436], 'J3'), morph([N[0] + 120, 436], 'J3')], false)}" stroke="var(--k-window,#ffe2c0)" stroke-width="9.3" opacity=".85" fill="none"/>` : ''}
${label ? `<rect x="14" y="14" width="372" height="472" fill="none" stroke="var(--cine-line,#2a323d)" stroke-dasharray="14 14" stroke-width="3"/><text x="28" y="470" font-family="JetBrains Mono, monospace" font-size="34" fill="var(--cine-muted,#8b95a3)">${label}</text>` : ''}
</svg>`;
}
