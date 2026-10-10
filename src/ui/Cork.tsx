import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Relation } from '../engine/constants';
import { useT } from '../i18n';
import { durUi, reducedMotion } from './a11y';
import { PhotoLogLine, type PhotoRecord } from './Dossier';
import { useScope } from './lang';
import { prose } from './prose';
import './cork.css';
import { JurySketch, type JuryCard } from './sketch/JurySketch';
import { hasPrint, Print } from './prints';

/**
 * 證據板（設定集第 9 章 RD-ART-0903）：一塊軟木板，一盞 2700K 吊燈打在中央。
 * 正在比對的兩張卡（A、B）推進光圈；其他卡退到邊緣、變暗；連過的線是紅（矛盾）、綠（支持）棉線。
 * 合成順序：軟木 → 線 → 卡 → 吊燈（multiply＋soft-light）→ 標記層（槽位標籤、黑條、關係結），標記層不被調光。
 */

export type CorkItem = {
  id: string;
  name: string;
  kind: string;
  text?: string;
  source?: string;
  date?: string;
  time?: string;
  image?: string;
  /** 照片紀錄表（設計師 P2-6）：照片卡的卡名下面一行。 */
  photo?: PhotoRecord;
  /** 有證物袋的卡，光圈裡可以放大檢視。 */
  bag?: unknown;
};

/** 板上連過的線：兩張卡加一種關係。 */
export type CorkLink = { a: CorkItem; b: CorkItem; relation: Relation };

/** 還沒到手、但已經提得出聲請的卡：黑條佔位。 */
export type CorkPending = { id: string; name: string; why: string };

/**
 * 邊緣的位置（板寬、板高的百分比）：左右兩欄、每欄三格，比對中的兩張在中間的光圈裡。
 * 原本上下中間各有一格，比對位置中以後卡會被那兩張壓住半張（設定集第 9 章 :74「其他卡退到邊緣」），改成兩欄。
 */
const EDGE: [number, number][] = [
  [3, 3], // 左上
  [3, 35], // 左中（和左上一條線）
  [80, 3], // 右上
  [80, 35], // 右中（和右上一條線）
  [3, 67], // 左下（黑條佔位優先）
  [80, 67], // 右下
];
const CARD_W = 17; // 邊緣卡寬（%）
const FOCUS_W = 19; // 光圈卡寬（%），再放大 1.15 倍
const FOCUS_SCALE = 1.15;
/**
 * 板子內寬（px）小於這個就用手機的板面（設計師 P2-6 r5：小籤不壓照片、不蓋圖釘）。
 * 光圈卡半寬 19% × 1.15 ÷ 2 ＝ 板寬 10.9%，要放得下：邊距 8＋最寬的籤（英文「Zoom」約 49）＋2＋圖釘半徑 6.3 ≈ 65px。
 */
const ROOMY = 600;
/**
 * 比對位（設計師 P2-6 r5、設定集第 9 章 :74「正在比對的兩張推進光圈」）：兩張對光圈中心左右對稱，
 * 中間只留關係結的寬度：直條最寬是英文的 28px，兩側各 4px（POOL_GAP）。
 * 上下把兩張裡較高的那張置中在光圈中心（RD-ART-0903 (700, 430)／1400×875）。
 * 卡高隨字數、語言、字型載入而變，所以量實際的卡高再算上緣（見 Cork 的 cardH）；還沒量到時用下面的預設。
 * 光圈半徑 360/1400 板寬，兩張 1.15 倍的卡放不進半徑的 85%（量過：最外角約 115%），設計師改成影像中心在 60% 以內（impl/p2-6/r5/designer-review.md 更正段）。
 */
const POOL_GAP = 36;
/** 光圈半徑（板寬的比例，RD-ART-0903 360/1400）。 */
const POOL_R = 360 / 1400;
/** 影像中心離光圈中心最多半徑的幾成（設計師 60%；留 2% 給卡片傾角和取整）。 */
const IMG_IN = 0.58;
const focusX = (w: number) =>
  [-1, 1].map(
    (side) =>
      50 +
      side * ((w ? (POOL_GAP / 2 / w) * 100 : 2.75) + (FOCUS_W * FOCUS_SCALE) / 2) -
      FOCUS_W / 2,
  );
const FOCUS_TOP = 27;
/** 手機：兩張卡佔滿光圈（寬 44%，左右各留 4%）。 */
const COMPACT_X = [4, 52];
const COMPACT_TOP = 14.5;
/** 板子上下至少留這麼多（px）：小籤伸出卡片上緣 10px，再留一點軟木。 */
const BOARD_PAD = 24;
const SAG = 34; // 下垂（px）
const PIN = 7; // 圖釘離卡片上緣（px）
const PIN_R = 5.5; // 圖釘半徑（cork.css .cork-pick::before 11px）

/** 同一張卡每次都歪同一個角度（±2.5°），不隨機跳動。 */
function tilt(id: string, max = 2.5) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 2 * max;
}

/** 卡片長相跟著它是什麼：物品是照片、陳述是索引卡、論點是便條、其他是影印紙。 */
function look(kind: string) {
  if (kind === '物品') return 'photo';
  if (kind === '陳述' || kind === '宣誓陳述') return 'index';
  if (kind === '論點') return 'note';
  return 'copy';
}

function Face({ item }: { item: CorkItem }) {
  const t = useT();
  const scope = useScope();
  const when = [item.date && t(item.date, scope), item.time].filter(Boolean).join(' ');
  // 板上的中文也以詞換行（「卡爾德州」「證明」不拆，設計師 P2-6 r3 留給證據板這一輪）。
  const name = prose(t(item.name, scope));
  const text = item.text ? prose(t(item.text, scope)) : null;
  switch (look(item.kind)) {
    case 'photo':
      return (
        <>
          {/* 警方照片的閃光燈：中心過曝、四角快速變暗；證物立牌灰白。有照片紀錄表的（驗屍照片）不畫立牌：放大後會把錯的道具放大（設計師 P2-6 r1）。 */}
          <span className="cork-print">
            {hasPrint(item.id) ? (
              <Print id={item.id} use="board" />
            ) : item.image ? (
              <img src={item.image} alt="" />
            ) : (
              !item.photo && <i className="cork-tent" />
            )}
          </span>
          <span className="cork-strip">
            <b>{name}</b>
            {when && <time>{when}</time>}
            {/* 照片紀錄表的四欄：卡名留在底欄（玩法要讀），紀錄列一行小字，放大時才讀。 */}
            {item.photo && <PhotoLogLine photo={item.photo} />}
          </span>
        </>
      );
    case 'index':
      return (
        <>
          <span className="cork-index-head">
            <b>{name}</b>
            {item.source && <small>{t(item.source, scope)}</small>}
          </span>
          {text && <span className="cork-hand">{text}</span>}
        </>
      );
    case 'note':
      return (
        <>
          <b className="cork-hand">{name}</b>
          {text && <span className="cork-hand small">{text}</span>}
        </>
      );
    default:
      return (
        <>
          <b className="cork-doc-name">{name}</b>
          {when && <time>{when}</time>}
          {text && <span className="cork-doc-text">{text}</span>}
        </>
      );
  }
}

/** 一條棉線：兩個圖釘之間的二次曲線，下垂 34px；矛盾是斷線加一道暖白高光。 */
function String_({
  from,
  to,
  relation,
  h,
  sagPx = SAG,
  fallPx = 0,
  opacity,
}: {
  from: [number, number];
  to: [number, number];
  relation: Relation | null;
  h: number;
  /** 下垂（px）；沒釘住的線會加深。 */
  sagPx?: number;
  /** B 端從圖釘鬆脫後往下掉的距離（px）。 */
  fallPx?: number;
  opacity?: number;
}) {
  const px = (v: number) => (v / Math.max(h, 1)) * 100;
  const end: [number, number] = [to[0], to[1] + px(fallPx)];
  const mx = (from[0] + end[0]) / 2;
  // 二次曲線中點的下垂是控制點偏移的一半。
  const my = (from[1] + end[1]) / 2 + px(sagPx) * 2;
  const d = `M${from[0]} ${from[1]} Q${mx} ${my} ${end[0]} ${end[1]}`;
  const kind =
    relation === '矛盾'
      ? 'contra'
      : relation === '支持'
        ? 'support'
        : relation
          ? 'other'
          : 'pending';
  const up = (1 / Math.max(h, 1)) * 100;
  return (
    <g className={`cork-string ${kind}`} style={opacity === undefined ? undefined : { opacity }}>
      <path d={d} vectorEffect="non-scaling-stroke" />
      {kind === 'contra' && (
        <path
          className="glint"
          d={d}
          transform={`translate(0 ${-up})`}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

/** 介面權杖 --ease 的 cubic-bezier(0.16, 1, 0.3, 1)：給 JS 補間用，和 CSS 同一條曲線。 */
function ease(x: number) {
  const [x1, y1, x2, y2] = [0.16, 1, 0.3, 1];
  const at = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  // 用二分法從 x 反求 t（單調），再算 y。
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2, y1, y2);
}

/**
 * 連錯：這條線沒釘住（設計師 P1-8a，取代抖動）。下垂從 34px 加深、B 端從圖釘鬆脫往下掉、淡出，
 * --dur-ui 180ms --ease。演完叫 onDone，接著兩張卡退出光圈回原位。
 */
function LooseString({
  from,
  to,
  relation,
  h,
  onDone,
}: {
  from: [number, number];
  to: [number, number];
  relation: Relation | null;
  h: number;
  onDone: () => void;
}) {
  const [k, setK] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const dur = durUi();
    let raf = 0;
    let t0 = -1;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const p = Math.min(1, (now - t0) / dur);
      setK(ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
      else done.current();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <String_
      from={from}
      to={to}
      relation={relation}
      h={h}
      sagPx={SAG + 60 * k}
      fallPx={90 * k}
      opacity={1 - k}
    />
  );
}

/**
 * 軟木平鋪方塊（設定集第 9 章）：256px，雙層雜訊——8px 格的低頻起伏＋逐像素顆粒，6% 暗點、3% 亮點，固有色 #8a6a48。
 * 固定種子，每次開都是同一塊木頭；四邊可以無縫接。只算一次。
 */
let tileUrl: string | null | undefined;
function corkTile(): string | null {
  if (tileUrl !== undefined) return tileUrl;
  tileUrl = null;
  try {
    const N = 256;
    const G = N / 8;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    if (!ctx) return tileUrl;
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const grid = Array.from({ length: G * G }, () => rnd() * 2 - 1);
    const at = (x: number, y: number) => grid[((y + G) % G) * G + ((x + G) % G)];
    const smooth = (v: number) => v * v * (3 - 2 * v);
    const img = ctx.createImageData(N, N);
    const base = [0x8a, 0x6a, 0x48];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const gx = x / 8;
        const gy = y / 8;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smooth(gx - x0);
        const fy = smooth(gy - y0);
        const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
        const bot = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
        const low = (top * (1 - fy) + bot * fy) * 0.09;
        const r = rnd();
        const grain = (rnd() * 2 - 1) * 0.07;
        const speck = r < 0.06 ? -0.38 - rnd() * 0.2 : r < 0.09 ? 0.22 + rnd() * 0.12 : 0;
        const k = 1 + low + grain + speck;
        const i = (y * N + x) * 4;
        for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, base[c] * k));
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    tileUrl = cv.toDataURL('image/png');
  } catch {
    tileUrl = null;
  }
  return tileUrl;
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(460);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      setH(el.clientHeight || 460);
      setW(el.clientWidth);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h, w] as const;
}

export function Cork({
  focus,
  relation,
  relationLabel,
  ready,
  links,
  loose,
  pending,
  compact: phone,
  onPick,
  slot,
  jury,
  onZoom,
  misses = 0,
  onMissDone,
}: {
  /** A、B 槽裡的卡（沒放就是 undefined）。 */
  focus: [CorkItem | undefined, CorkItem | undefined];
  relation: Relation | null;
  relationLabel: string;
  ready: boolean;
  links: CorkLink[];
  /** 其他已經到手的卡，釘在邊緣空著的位置。 */
  loose: CorkItem[];
  pending: CorkPending[];
  /** 手機：只有光圈裡的兩張（板子太窄時也一樣，見 ROOMY）。 */
  compact: boolean;
  /** 點邊緣的卡＝放上連線台。 */
  onPick: (id: string) => void;
  /** A、B 槽的內容（卡片按鈕、或空槽的提示）。 */
  slot: (i: 0 | 1, face: ReactNode) => ReactNode;
  /** 陪審團視角：只畫被採納的卡（設定集 8.6）。 */
  jury?: { on: boolean; cards: CorkItem[]; provenance: string };
  /** 光圈裡有照片紀錄表或證物袋的卡：標記層一顆「放大檢視」（設計師 P2-6）。 */
  onZoom?: (id: string) => void;
  /** 連錯的次數：一變多就演「線沒釘住」，演完叫 onMissDone 把兩張卡放回原位。 */
  misses?: number;
  onMissDone?: () => void;
}) {
  const t = useT();
  const scope = useScope();
  const [ref, h, w] = useSize();
  // 板子窄到光圈卡上放不下圖釘兩側的小籤（1350px 以下的桌機視窗），也改用手機的板面。
  const compact = phone || (w > 0 && w < ROOMY);
  // 比對位兩格的卡高（在原位的不算）：卡高變了（換卡、換語言、字型載入）就重量。兩格上緣對齊，取高的那張置中。
  const focusEls = useRef<(HTMLDivElement | null)[]>([]);
  const [slotH, setSlotH] = useState([0, 0]);
  const cardH = Math.max(...slotH);
  // 照片卡的影像中心離卡片上緣多遠（沒放大前）：用來檢查「影像中心在光圈半徑 60% 以內」。
  const [imgMid, setImgMid] = useState(0);
  // 第一次量好位置以前不跑轉場：不然一進來兩張卡會從預設位置滑到量好的位置。
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (settled || !w || !cardH) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [settled, w, cardH]);
  const [tile] = useState(corkTile);
  const pinY = (PIN / Math.max(h, 1)) * 100;

  // 邊緣位置分配：先給連線（兩兩一組），再給黑條佔位（兩欄最下面那格優先），剩下的放其他卡。
  type Placed = { item: CorkItem; at: [number, number] };
  const placed: Placed[] = [];
  const strings: {
    from: [number, number];
    to: [number, number];
    relation: Relation;
    key: string;
  }[] = [];
  const free = [0, 1, 2, 3, 4, 5];
  const pinOf = (at: [number, number], w: number): [number, number] => [
    at[0] + w / 2,
    at[1] + pinY,
  ];
  if (!compact) {
    links.slice(0, 2).forEach((l, i) => {
      const [p, q] = i === 0 ? [0, 1] : [2, 3];
      free.splice(free.indexOf(p), 1);
      free.splice(free.indexOf(q), 1);
      placed.push({ item: l.a, at: EDGE[p] }, { item: l.b, at: EDGE[q] });
      strings.push({
        from: pinOf(EDGE[p], CARD_W),
        to: pinOf(EDGE[q], CARD_W),
        relation: l.relation,
        key: `${l.a.id}-${l.b.id}`,
      });
    });
  }
  const take = () =>
    free.splice(
      Math.max(
        0,
        free.findIndex((k) => k >= 4),
      ),
      1,
    )[0];
  const bars = compact
    ? []
    : pending.slice(0, Math.min(2, free.length)).map((p) => ({ p, at: EDGE[take()] }));
  if (!compact) {
    const used = new Set(placed.map((x) => x.item.id));
    loose
      .filter((c) => !used.has(c.id))
      .slice(0, free.length)
      .forEach((c, i) => placed.push({ item: c, at: EDGE[free[i]] }));
  }

  // 比對位上下置中在光圈中心（板高 50%）：卡以（中線, 圖釘）為軸放大，放大後的中心＝上緣＋PIN＋(卡高/2−PIN)×倍率。
  const scale = compact ? 1 : FOCUS_SCALE;
  const focusW = compact ? 44 : FOCUS_W;
  const xs = compact ? COMPACT_X : focusX(w);
  // 照片的影像中心離光圈中心多遠（px）：左右是卡中線到板中線，上下是影像中心到板高一半。
  const imgDx = Math.abs(xs[0] + focusW / 2 - 50) * (w / 100);
  const imgDy = (topPx: number) => h / 2 - (topPx + PIN + (imgMid - PIN) * scale);
  let topPx = cardH ? h / 2 - PIN - (cardH / 2 - PIN) * scale : 0;
  // 桌機：光圈是設定集的 360/1400，不動。字多、板子小的時候卡比較高，整組置中會讓影像中心超出 60%，
  // 這時卡往下讓到影像中心剛好在 IMG_IN 為止（上下就不完全置中了）。
  if (!compact && cardH && imgMid && w) {
    const dyMax = Math.sqrt(Math.max(0, (IMG_IN * POOL_R * w) ** 2 - imgDx ** 2));
    if (imgDy(topPx) > dyMax) topPx += imgDy(topPx) - dyMax;
  }
  const top = cardH ? (topPx / Math.max(h, 1)) * 100 : compact ? COMPACT_TOP : FOCUS_TOP;
  const focusAt = xs.map((x) => [x, top]) as [number, number][];
  // 手機：光圈本來就是為這個版面另設的（設計師 P2-6 r5 更正），小手機上卡比較高，光圈放大到影像中心落在 IMG_IN 以內。
  const pool =
    compact && cardH && imgMid && w
      ? Math.max(1.9, Math.hypot(imgDx, imgDy(topPx)) / (IMG_IN * POOL_R * w))
      : compact
        ? 1.9
        : 1;
  // 兩格卡片（放大、歪之前）的中心：速寫版的卡對準這裡（設計師 P2-6 r6 第 1 條）。卡以（中線, 圖釘）為軸放大。
  // 這一格空著就用另一格的卡高；兩格都空就是光圈中心。
  const cellCenter = xs.map((x, i): [number, number] => [
    x + focusW / 2,
    cardH ? ((topPx + PIN + ((slotH[i] || cardH) / 2 - PIN) * scale) / Math.max(h, 1)) * 100 : 50,
  ]);
  const abFrom = pinOf(focusAt[0], focusW);
  const abTo = pinOf(focusAt[1], focusW);
  // 關係結掛在 A–B 線的最低點。
  const knot = { left: (abFrom[0] + abTo[0]) / 2, top: abFrom[1] + (SAG / Math.max(h, 1)) * 100 };

  // 卡的原位：邊緣分到的位置。放進光圈時原位空著（不重複畫），退出時回到這裡。
  const originOf = (id: string) => placed.find((p) => p.item.id === id)?.at;
  const focusIds = focus.map((c) => c?.id ?? '');

  // 連錯（設計師 P1-8a，取代抖動）：線沒釘住、鬆脫淡出 → 兩張卡退出光圈回原位 → 清掉連線台。
  // 兩段都是 --dur-ui 180ms --ease；減少動態時線直接消失、卡直接歸位。
  type Miss = {
    phase: 'drop' | 'return';
    from: [number, number];
    to: [number, number];
    relation: Relation | null;
  };
  const [seenMisses, setSeenMisses] = useState(misses);
  const [miss, setMiss] = useState<Miss | null>(null);
  if (misses !== seenMisses) {
    setSeenMisses(misses);
    if (focus[0] && focus[1])
      setMiss({
        phase: reducedMotion() ? 'return' : 'drop',
        from: abFrom,
        to: abTo,
        relation,
      });
  }
  const missDone = useRef(onMissDone);
  useEffect(() => {
    missDone.current = onMissDone;
  });
  // 演到一半板子被收起來（換題、切到陪審團視角）：直接把卡放回去，不留在連線台上。
  const missing = useRef(false);
  useEffect(() => {
    missing.current = !!miss;
  });
  useEffect(() => () => void (missing.current && missDone.current?.()), []);
  useEffect(() => {
    if (miss?.phase !== 'return') return;
    const id = setTimeout(
      () => {
        setMiss(null);
        missDone.current?.();
      },
      reducedMotion() ? 0 : durUi(),
    );
    return () => clearTimeout(id);
  }, [miss?.phase]);

  // 放上光圈：剛放上的卡先畫一格在原位，下一格才推進光圈，轉場看得到從哪裡來。
  const ids = focusIds.join(',');
  const [prevIds, setPrevIds] = useState(ids);
  const [arriving, setArriving] = useState<string[]>([]);
  if (ids !== prevIds) {
    const before = prevIds.split(',');
    setPrevIds(ids);
    setArriving(focusIds.filter((id) => id && !before.includes(id)));
  }
  useEffect(() => {
    if (!arriving.length) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setArriving([]));
    });
    return () => cancelAnimationFrame(raf);
  }, [arriving]);

  useLayoutEffect(() => {
    const measure = () => {
      const live = [0, 1].map((i) => {
        const el = focusEls.current[i];
        return el && !el.classList.contains('away') ? el : null;
      });
      const hs = live.map((el) => el?.offsetHeight ?? 0);
      setSlotH((prev) => (prev.join() === hs.join() ? prev : hs));
      const mids = live
        .map((el) => el?.querySelector<HTMLElement>('.cork-print'))
        .filter((p): p is HTMLElement => !!p)
        .map((p) => p.offsetTop + p.offsetHeight / 2);
      const mid = mids.length ? Math.min(...mids) : 0;
      setImgMid((prev) => (prev === mid ? prev : mid));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    focusEls.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [ids, compact, arriving, miss?.phase]);
  // 「放大」和 A／B 小籤貼在卡片上緣（一半在卡外、一半壓在白邊上），不進入照片的影像範圍（設計師 P2-6 r5）。
  // 用比對位的目標框算，不量 DOM：卡推進光圈時 left／top 在轉場，量到的是半路的位置。
  // 卡以（中線, 圖釘 7px）為軸放大 1.15、歪 --tilt；籤不歪，所以取籤中線那一點的上緣高度。
  // 「放大」離卡角 8px；卡窄（小手機）放不下時往卡角靠、再不夠就伸出卡角，總之不蓋圖釘。籤寬中英文不同，量實際的。
  const zoomEls = useRef<(HTMLButtonElement | null)[]>([]);
  const [zoomW, setZoomW] = useState<number[]>([]);
  useLayoutEffect(() => {
    const next = [0, 1].map((i) => zoomEls.current[i]?.offsetWidth ?? 0);
    setZoomW((prev) => (prev.join() === next.join() ? prev : next));
  }, [w, t, ids]);
  const tabs = focusAt.map(([x, y], i) => {
    const c = focus[i];
    const s = c && !compact ? FOCUS_SCALE : 1;
    const a = ((c ? tilt(c.id, 1.2) : 0) * Math.PI) / 180;
    const half = (focusW / 100) * w * s * 0.5;
    const ox = (x / 100) * w + ((focusW / 100) * w) / 2;
    const oy = (y / 100) * h + PIN;
    const corner = (side: -1 | 1) => ({
      x: ox + side * half * Math.cos(a) + PIN * s * Math.sin(a),
      y: oy + side * half * Math.sin(a) - PIN * s * Math.cos(a),
    });
    const l = corner(-1);
    const r = corner(1);
    const zw = zoomW[i] ?? 0;
    const m = Math.min(8, half - PIN_R * s - 2 - zw);
    // 籤中線離卡角：A／B 是邊距 8＋半個籤寬（約 10），「放大」是 m＋半個籤寬。
    return { x: l.x, y: l.y + Math.tan(a) * 18, r: r.x - m, ry: r.y - Math.tan(a) * (m + zw / 2) };
  });

  // 影子沿離燈方向拉長（燈在板中央）。
  const away = (at: [number, number], w: number) => {
    const dx = at[0] + w / 2 - 50;
    const dy = at[1] + 12 - 50;
    const n = Math.hypot(dx, dy) || 1;
    return {
      '--sx': `${((dx / n) * 10).toFixed(1)}px`,
      '--sy': `${(6 + (dy / n) * 8).toFixed(1)}px`,
    };
  };

  return (
    <div
      ref={ref}
      className={['cork', compact && 'compact', miss && 'missing', settled && 'settled']
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--cork-tile': tile ? `url(${tile})` : 'none',
          // 小手機上卡比 4:3 的板子高：板子跟著長，上下各留 BOARD_PAD（含 10px 木框）。
          minHeight: cardH ? cardH * scale + 2 * (BOARD_PAD + 10) : undefined,
          '--pool': pool,
        } as CSSProperties
      }
    >
      <svg className="cork-strings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {strings.map((s) => (
          <String_ key={s.key} from={s.from} to={s.to} relation={s.relation} h={h} />
        ))}
        {miss?.phase === 'drop' ? (
          <LooseString
            from={miss.from}
            to={miss.to}
            relation={miss.relation}
            h={h}
            onDone={() => setMiss((m) => m && { ...m, phase: 'return' })}
          />
        ) : (
          !miss &&
          focus[0] &&
          focus[1] && <String_ from={abFrom} to={abTo} relation={relation} h={h} />
        )}
      </svg>
      {placed
        .filter(({ item }) => !focusIds.includes(item.id))
        .map(({ item, at }) => (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            aria-hidden
            className={`cork-card ${look(item.kind)}`}
            style={
              {
                left: `${at[0]}%`,
                top: `${at[1]}%`,
                width: `${CARD_W}%`,
                '--tilt': `${tilt(item.id)}deg`,
                ...away(at, CARD_W),
              } as CSSProperties
            }
            onClick={() => onPick(item.id)}
          >
            <Face item={item} />
          </button>
        ))}
      {focus.map((c, i) => {
        // 退回原位（連錯）或剛放上（還在原位那一格）：畫在原位、原尺寸；手機上沒有原位，就地淡出。
        const back = !!c && (miss?.phase === 'return' || arriving.includes(c.id));
        const at = back && c ? originOf(c.id) : undefined;
        return (
          <div
            key={c ? c.id : `empty-${i}`}
            ref={(el) => {
              focusEls.current[i] = el;
            }}
            className={[
              'cork-focus',
              c && `filled ${look(c.kind)}`,
              back && 'away',
              back && !at && 'gone',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              {
                left: `${(at ?? focusAt[i])[0]}%`,
                top: `${(at ?? focusAt[i])[1]}%`,
                width: `${at ? CARD_W : focusW}%`,
                '--tilt': c ? `${at ? tilt(c.id) : tilt(c.id, 1.2)}deg` : '0deg',
              } as CSSProperties
            }
          >
            {slot(i as 0 | 1, c ? <Face item={c} /> : null)}
          </div>
        );
      })}
      <div className="cork-lamp" aria-hidden />
      <div className="cork-warm" aria-hidden />
      {/* 標記層：不被吊燈調光。 */}
      {bars.map(({ p, at }) => (
        <div
          key={p.id}
          className="cork-redact"
          style={{ left: `${at[0]}%`, top: `${at[1]}%`, width: `${CARD_W}%` }}
        >
          <b>{t(p.name, scope)}</b>
          <span>{t(p.why)}</span>
        </div>
      ))}
      {focus.map((_, i) => (
        <span
          key={i}
          className="slot-tag cork-tag"
          aria-hidden
          style={w ? { left: tabs[i].x, top: tabs[i].y } : { visibility: 'hidden' }}
        >
          {i === 0 ? 'A' : 'B'}
        </span>
      ))}
      {onZoom &&
        focus.map(
          (c, i) =>
            c &&
            (c.photo || c.bag !== undefined) && (
              <button
                key={c.id}
                type="button"
                ref={(el) => {
                  zoomEls.current[i] = el;
                }}
                className="cork-zoom"
                // 陪審團視角看的是速寫，不是卷宗：停用。
                disabled={jury?.on}
                aria-label={t('放大檢視 {name}', { name: t(c.name, scope) })}
                style={w ? { left: tabs[i].r, top: tabs[i].ry } : { visibility: 'hidden' }}
                onClick={() => onZoom(c.id)}
              >
                {t('放大')}
              </button>
            ),
        )}
      {/* 速寫一直掛著（看不見），在 Worker 裡先畫好：切過去時不用等，也才能交叉淡化。 */}
      {jury && (
        <JurySketch
          on={jury.on}
          cards={jury.cards.map((c, i): JuryCard => {
            const inPool = i < 2;
            const at = inPool ? focusAt[i] : EDGE[(i - 2) % EDGE.length];
            return {
              id: c.id,
              kind: c.kind,
              name: c.name,
              text: c.text,
              time: c.time,
              at,
              w: inPool ? focusW : CARD_W,
              tilt: tilt(c.id, inPool ? 1.2 : 2.5),
              // 光圈裡的兩格：中心對準吊燈版同一格的卡。兩格都有卡時最寬到吊燈版放大後的卡寬（空隙只留給關係結）；
              // 手機照內容檔的寬度，不加寬。
              ...(inPool && {
                center: cellCenter[i],
                maxW: compact || jury.cards.length > 1 ? focusW * scale : undefined,
              }),
            };
          })}
          look={look}
          provenance={jury.provenance}
          pool={pool}
        />
      )}
      {/* 手機上兩張卡之間沒有空隙，關係看下面選中的那顆。 */}
      {!compact && (focus[0] || focus[1]) && (
        <span
          className={ready ? 'cork-knot ready' : relation ? 'cork-knot set' : 'cork-knot'}
          aria-hidden
          style={{ left: `${knot.left}%`, top: `${knot.top}%` }}
        >
          {relationLabel}
        </span>
      )}
    </div>
  );
}
