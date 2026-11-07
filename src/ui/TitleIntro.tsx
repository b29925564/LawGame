import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSettings } from '../engine/settings';
import { useLang, useT } from '../i18n';
import { reducedMotion } from './a11y';
import { useMenu } from './GameMenu';
import blindDA from './intro/blind-ep1-base-desktop.avif';
import blindDW from './intro/blind-ep1-base-desktop.webp';
import blindPA from './intro/blind-ep1-base-phone.avif';
import blindPW from './intro/blind-ep1-base-phone.webp';
import slitDA from './intro/blind-ep1-slit-screen-desktop.avif';
import slitDW from './intro/blind-ep1-slit-screen-desktop.webp';
import slitPA from './intro/blind-ep1-slit-screen-phone.avif';
import slitPW from './intro/blind-ep1-slit-screen-phone.webp';
import blind2DA from './intro/blind-ep2-base-desktop.avif';
import blind2DW from './intro/blind-ep2-base-desktop.webp';
import blind2PA from './intro/blind-ep2-base-phone.avif';
import blind2PW from './intro/blind-ep2-base-phone.webp';
import slit2DA from './intro/blind-ep2-slit-screen-desktop.avif';
import slit2DW from './intro/blind-ep2-slit-screen-desktop.webp';
import slit2PA from './intro/blind-ep2-slit-screen-phone.avif';
import slit2PW from './intro/blind-ep2-slit-screen-phone.webp';
import c17DA from './intro/court-0017wD.avif';
import c17DW from './intro/court-0017wD.webp';
import c17PA from './intro/court-0017wP.avif';
import c17PW from './intro/court-0017wP.webp';
import vigD from './intro/court-0017w-vignette-desktop.png';
import vigP from './intro/court-0017w-vignette-phone.png';
import c23DA from './intro/court-0023D.avif';
import c23DW from './intro/court-0023D.webp';
import c23PA from './intro/court-0023P.avif';
import c23PW from './intro/court-0023P.webp';
import c29DA from './intro/court-0029D.avif';
import c29DW from './intro/court-0029D.webp';
import c29PA from './intro/court-0029P.avif';
import c29PW from './intro/court-0029P.webp';
import pbDA from './intro/paper-blank-desktop.avif';
import pbDW from './intro/paper-blank-desktop.webp';
import pbPA from './intro/paper-blank-phone.avif';
import pbPW from './intro/paper-blank-phone.webp';
import peDA from './intro/paper-full-en-desktop.avif';
import peDW from './intro/paper-full-en-desktop.webp';
import pePA from './intro/paper-full-en-phone.avif';
import pePW from './intro/paper-full-en-phone.webp';
import pfDA from './intro/paper-full-desktop.avif';
import pfDW from './intro/paper-full-desktop.webp';
import pfPA from './intro/paper-full-phone.avif';
import pfPW from './intro/paper-full-phone.webp';
import pnDA from './intro/paper-numbers-desktop.avif';
import pnDW from './intro/paper-numbers-desktop.webp';
import pnPA from './intro/paper-numbers-phone.avif';
import pnPW from './intro/paper-numbers-phone.webp';
import paperRows from './intro/paper-rows.json';
import './titleIntro.css';

/**
 * 片頭 40 秒（設定集 11.1）：冷開場之後、第一幕之前，取代集內「片頭」幕卡前面的那一段。
 * 0:00–0:38 是這裡的七個鏡頭（0:00 和 0:05 同一個機位，合成一格）；0:38 的集名卡是原本的幕卡（ActCard），
 * 停完切黑 83ms 進第一幕第一場。
 *
 * 底圖全部是場景光影 #3 的正式圖（art-bible/scenes/title-intro-v94/final/，設計師 11-07 PASS）：0:00 紙、
 * 0:10 兩集百葉窗、0:17、0:23、0:29 法庭。圖已經分級過（titlegrade），這裡不再加濾鏡。每張有 AVIF、WebP 兩種，
 * 手機用直式機位。
 *
 * - 每次從頭開始一集都播；讀檔讀到片頭之後不播（片頭是那一張卡的前半段，過了就不在了）。
 * - 第二次播起右下角有「跳過」，直接到 0:38 的集名卡（不跳過集名）。看過與否每一集分開記，存在設定裡。
 * - 減少動態：推軌、後拉改成不動，黑條直接出現，每個鏡頭 120ms 淡入，鏡頭之間不插黑格。
 * - 光敏安全：0:34 燈管兩次脈衝改單次 700ms 漸亮（titleIntro.css 讀 html[data-photosafe]）。
 * - 沒有音樂（音效另外提案）。
 * - 片頭期間右上角照樣有「選單」（第一次不能跳過，玩家要能去改光敏安全、減少動態）；選單打開時片頭暫停，Esc 也能打開。
 * - 預設播（正式圖到齊，設計師 #319 審查 1 的條件）。測試要關掉用網址 `?intro=0`（只在那一頁）或
 *   localStorage['rd.dev.intro']＝'0'。
 */

type ShotId = 'paper' | 'blind' | 'court' | 'witness' | 'lucas' | 'mark';

/** 每個鏡頭的長度（ms）。paper 包含 0:00 的紙和 0:05 的黑條（同一個機位、不切）。 */
export const SHOTS: readonly (readonly [ShotId, number])[] = [
  ['paper', 10000],
  ['blind', 7000],
  ['court', 6000],
  ['witness', 6000],
  ['lucas', 5000],
  ['mark', 4000],
];
/** 0:38：集名卡出現的時間。 */
export const INTRO_MS = SHOTS.reduce((n, [, ms]) => n + ms, 0);
/** 鏡頭之間的硬切：2 格黑（--dur-cut-black），從前一個鏡頭的尾巴扣，總長不變。 */
const CUT_BLACK = 83;

/** 玩家版播不播片頭。 */
const INTRO_DEFAULT = true;
export function introOn() {
  try {
    const q = new URLSearchParams(location.search).get('intro');
    if (q === '1' || q === '0') return q === '1';
    const v = localStorage.getItem('rd.dev.intro');
    if (v === '1' || v === '0') return v === '1';
  } catch {
    // 讀不到就照預設。
  }
  return INTRO_DEFAULT;
}

export function TitleIntro({ episode, onDone }: { episode: string; onDone: () => void }) {
  const t = useT();
  // 第二次播起才能跳過：看的是開始播的那一刻，這一次播到一半不會冒出按鈕。
  const [canSkip] = useState(() => !!useSettings.getState().introSeen[episode]);
  const [at, setAt] = useState(0);
  const [black, setBlack] = useState(false);
  const paused = useMenu((m) => m.open !== null);
  /** 這個鏡頭已經播了多久（暫停前播掉的）。 */
  const spent = useRef(0);
  useEffect(() => {
    const seen = useSettings.getState().introSeen;
    if (!seen[episode]) useSettings.getState().set({ introSeen: { ...seen, [episode]: true } });
  }, [episode]);
  // Esc 打開選單（開著的時候 Esc 由選單自己收起來）：在捕獲階段先接，選單的 Esc 不會同時把它關掉。
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useMenu.getState().open) return;
      e.stopImmediatePropagation();
      useMenu.getState().setOpen('save');
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, []);
  useEffect(() => {
    spent.current = 0;
  }, [at]);
  useEffect(() => {
    if (paused) return;
    const rm = reducedMotion();
    const last = at === SHOTS.length - 1;
    const left = SHOTS[at][1] - spent.current;
    const start = Date.now();
    const timers: number[] = [];
    if (!last && !rm)
      timers.push(window.setTimeout(() => setBlack(true), Math.max(0, left - CUT_BLACK)));
    timers.push(
      window.setTimeout(() => {
        setBlack(false);
        if (last) onDone();
        else setAt(at + 1);
      }, left),
    );
    return () => {
      spent.current += Date.now() - start;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // onDone 每次 render 都是新的：計時只看鏡頭換了沒有、停了沒有。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, paused]);
  const [shot] = SHOTS[at];
  const ep2 = episode === 'ep2';
  return (
    <main
      className="title-intro"
      data-shot={shot}
      data-episode={episode}
      data-paused={paused ? '' : undefined}
      aria-label={t('片頭')}
    >
      {!black && (
        <div key={shot} className={`ti-shot shot-${shot}`} aria-hidden>
          {shot === 'paper' && <Paper />}
          {shot === 'blind' && <Blinds ep2={ep2} />}
          {shot === 'court' && <Court />}
          {shot === 'witness' && <Witness ep2={ep2} />}
          {shot === 'lucas' && <Lucas />}
          {shot === 'mark' && <Mark />}
        </div>
      )}
      {canSkip && (
        <button className="ti-skip" onClick={onDone}>
          {t('跳過')}
        </button>
      )}
    </main>
  );
}

/**
 * 0:05 的黑條：先慢後快（設計師 #319 審查 4，24 格／秒）。第 1 條蓋第 11 行；第 2、3 條各隔 8 格（333ms）；
 * 其餘各隔 2 格（83ms），跳著蓋。每條 167ms steps(4)。只蓋底圖裡有字的行（桌機 12 行、手機 16–17 行），0:07.3 前蓋完，停到 0:10。
 */
export const barDelay = (i: number) => (i < 3 ? i * 333 : 2 * 333 + (i - 2) * 83);
/**
 * 0:00–0:10 的紙（場景光影 #3 正式圖，art-bible/scenes/title-intro-v94/final/paper/）：同一台機位、同一個裁切的
 * 三張圖疊起來，用遮罩逐行露出。
 * - 空白頁（blank）墊底。
 * - 紅邊線從「行號」那張（numbers）由上往下畫出來，和行號同步。
 * - 每一行（行號＋那一行的字）從「全文」那張（full／full-en）一拍二亮起，先是 12% 的影子。
 * - 0:05 起黑條一條一條蓋上：黑條是那一行字的四邊形上下各外擴 15%，跟著景深糊（對焦在第 11 行）。
 *   黑條是紙上的墨，不是貼上去的純黑：空白頁乘上墨的反射率，跟著光池暗下去，最暗是底色。
 *   黑條底下的字從遮罩扣掉，露出空白頁：糊開的黑條邊緣看到的是紙，不是被蓋住的字。
 * 每一行的四角座標是場景光影用同一台機位投影出來的（paper-rows.json，底圖像素）。
 */
type Pt = [number, number];
type Quad = [Pt, Pt, Pt, Pt];
type PaperRow = { number: Quad; zh: Quad | null; en: Quad | null };
type Cam = { size: [number, number]; rows: PaperRow[] };
const CAMS = paperRows as unknown as { desktop: Cam; phone: Cam };
const PAPER_IMG = {
  desktop: {
    blank: [pbDA, pbDW],
    numbers: [pnDA, pnDW],
    zh: [pfDA, pfDW],
    en: [peDA, peDW],
  },
  phone: {
    blank: [pbPA, pbPW],
    numbers: [pnPA, pnPW],
    zh: [pfPA, pfPW],
    en: [pePA, pePW],
  },
} as const;
const PHONE = '(max-width: 767px)';

/** 第 n 行（0 起）亮起的時間：0.4 秒起，一拍二（24 格／秒，每 2 格一行）。 */
const rowOn = (n: number) => 400 + n * 83;
/** 對焦在第 11 行。離得越遠越糊：在全文底圖上量，每隔一行約多 4.5 px 的高斯（底圖像素）。 */
const dof = (n: number) => Math.min(4.5 * Math.abs(n - 10), 36);

/**
 * 黑條是墨：紙的 5% 反射率，在 sRGB 裡約等於乘 0.2–0.25（0.05^(1/2.2)，取暗一點：黑條要讀成黑）。不在線性光裡算：Chrome 的濾鏡用 8 位元
 * 存線性值，暗部只剩幾階，黑條會出現一塊一塊的色斑。截距讓最暗的地方停在底色 #0b0e13。
 */
const INK = 0.2;
const FLOOR = [11 / 255, 14 / 255, 19 / 255];

const hOf = (q: Quad) => (q[3][1] - q[0][1] + q[2][1] - q[1][1]) / 2;
const grow = (q: Quad, dx: number, dy: number): Quad => [
  [q[0][0] - dx, q[0][1] - dy],
  [q[1][0] + dx, q[1][1] - dy],
  [q[2][0] + dx, q[2][1] + dy],
  [q[3][0] - dx, q[3][1] + dy],
];
const pts = (q: Quad) => q.map((p) => p.join(',')).join(' ');
/** x = a·y + b 的最小平方。 */
function fitX(ps: Pt[]) {
  const n = ps.length;
  const my = ps.reduce((s, p) => s + p[1], 0) / n;
  const mx = ps.reduce((s, p) => s + p[0], 0) / n;
  const a =
    ps.reduce((s, p) => s + (p[1] - my) * (p[0] - mx), 0) /
    ps.reduce((s, p) => s + (p[1] - my) ** 2, 0);
  return (y: number) => mx + a * (y - my);
}

/** 一台機位要畫的東西：每一行的遮罩、黑條、紅邊線那一帶、紅邊線往下畫的時間表。 */
function paperLayout(cam: Cam, lang: 'zh' | 'en') {
  const [W, H] = cam.size;
  const rows = cam.rows.map((r, n) => {
    const text = r[lang];
    const h = hOf(r.number);
    const s = dof(n);
    // 糊開的字會超出框：外擴 15%，再加景深，但不吃進下一行太多。
    const pad = 0.15 * h + Math.min(1.5 * s, 0.3 * h);
    return {
      n,
      s,
      number: grow(r.number, 0.3 * h + 1.5 * s, pad),
      text: text && grow(text, 0.15 * h + 1.5 * s, pad),
      bar: text && grow(text, 0.05 * h, 0.15 * hOf(text)),
      onImage: !!text && (text[0][1] + text[2][1]) / 2 > 0 && (text[0][1] + text[2][1]) / 2 < H,
    };
  });
  // 黑條只蓋畫面裡有字的行。第一條蓋第 11 行，其餘跳著蓋。
  const barred = rows.filter((r) => r.onImage).map((r) => r.n);
  const rest = barred.filter((n) => n !== 10).sort((a, b) => ((a * 11) % 28) - ((b * 11) % 28));
  const order = new Map([10, ...rest].map((n, i) => [n, i]));
  // 紅邊線：行號右緣和內文左緣之間，紅線落在兩者的 40–60%，遮罩取 20–85%。
  const num = fitX(cam.rows.flatMap((r) => [r.number[1], r.number[2]]));
  const txt = fitX(cam.rows.flatMap((r) => (r.zh ? [r.zh[0], r.zh[3]] : [])));
  const at = (y: number, f: number) => num(y) + f * (txt(y) - num(y));
  const [y0, y1] = [-0.1 * H, 1.1 * H];
  const band: Quad = [
    [at(y0, 0.2), y0],
    [at(y0, 0.85), y0],
    [at(y1, 0.85), y1],
    [at(y1, 0.2), y1],
  ];
  // 紅邊線往下畫：第 n 行亮起的那一格，畫到第 n 行行號的底。
  const bottom = (n: number) => Math.max(cam.rows[n].number[2][1], cam.rows[n].number[3][1]);
  const first = cam.rows[0].number[0][1] - (cam.rows[1].number[0][1] - cam.rows[0].number[0][1]);
  const dur = rowOn(cam.rows.length);
  const stops: [number, number][] = [
    [0, first],
    ...cam.rows.map((_, n) => [rowOn(n), bottom(n)] as [number, number]),
    [dur, bottom(cam.rows.length - 1) + H],
  ];
  const wipe = stops
    .map(([t, y]) => `${((t / dur) * 100).toFixed(2)}%{transform:translateY(${y.toFixed(1)}px)}`)
    .join('');
  const origin = cam.rows[10].zh!;
  return {
    W,
    H,
    rows,
    order,
    band,
    wipe: { css: wipe, dur, x: Math.min(...band.map((p) => p[0])) - 20 },
    origin: [(origin[0][0] + origin[2][0]) / 2, (origin[0][1] + origin[2][1]) / 2] as Pt,
  };
}

/** 支不支援 AVIF：SVG 的 <image> 沒有 <picture> 可以選格式，先試解一張。四張都解完才畫，畫面不會半張。 */
let avifOk: Promise<boolean> | null = null;
function usePaperSrc(phone: boolean, lang: 'zh' | 'en') {
  const set = PAPER_IMG[phone ? 'phone' : 'desktop'];
  const [ready, setReady] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    avifOk ??= (() => {
      const i = new Image();
      i.src = pbDA;
      return i.decode().then(
        () => true,
        () => false,
      );
    })();
    void avifOk.then(async (avif) => {
      const pick = (s: readonly [string, string]) => s[avif ? 0 : 1];
      const srcs = { blank: pick(set.blank), numbers: pick(set.numbers), full: pick(set[lang]) };
      await Promise.all(
        Object.values(srcs).map((u) => {
          const i = new Image();
          i.src = u;
          return i.decode().catch(() => undefined);
        }),
      );
      if (live) setReady(srcs);
    });
    return () => {
      live = false;
    };
  }, [set, lang]);
  return ready;
}

function usePhonePaper() {
  const [on, setOn] = useState(() => globalThis.matchMedia?.(PHONE).matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(PHONE);
    if (!mq) return;
    const sync = () => setOn(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return on;
}

function Paper() {
  const lang = useLang((s) => s.lang);
  const phone = usePhonePaper();
  const cam = phone ? 'phone' : 'desktop';
  const L = useMemo(() => paperLayout(CAMS[cam], lang), [cam, lang]);
  const src = usePaperSrc(phone, lang);
  const id = useId().replace(/:/g, '');
  const sigmas = [...new Set(L.rows.filter((r) => r.bar && L.order.has(r.n)).map((r) => r.s))];
  const region = {
    filterUnits: 'userSpaceOnUse',
    x: -L.W,
    y: -L.H,
    width: 3 * L.W,
    height: 3 * L.H,
  } as const;
  return (
    <div className="ti-paper" data-cam={cam}>
      {src && (
        <svg viewBox={`0 0 ${L.W} ${L.H}`} preserveAspectRatio="xMidYMid slice">
          <style>{`@keyframes ti-wipe-${cam}{${L.wipe.css}}.ti-wipe-${cam}{--wipe:ti-wipe-${cam};--wipe-dur:${L.wipe.dur}ms}`}</style>
          <defs>
            <filter id={`${id}f`} {...region}>
              <feGaussianBlur stdDeviation={2} />
            </filter>
            {sigmas.map((s) => (
              <filter key={s} id={`${id}d${s}`} {...region}>
                <feGaussianBlur stdDeviation={Math.max(s, 0.6)} />
              </filter>
            ))}
            <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={L.W} height={L.H}>
              <g filter={`url(#${id}f)`}>
                <polygon points={pts(L.band)} fill="#fff" />
                <rect
                  className={`ti-wipe ti-wipe-${cam}`}
                  x={L.wipe.x}
                  y={0}
                  width={L.W}
                  height={3 * L.H}
                  fill="#000"
                />
              </g>
            </mask>
            <mask id={`${id}r`} maskUnits="userSpaceOnUse" x={0} y={0} width={L.W} height={L.H}>
              <g filter={`url(#${id}f)`}>
                {L.rows.map((r) => (
                  <g key={r.n} className="ti-prow" style={{ '--n': r.n } as CSSProperties}>
                    <polygon points={pts(r.number)} fill="#fff" />
                    {r.text && <polygon points={pts(r.text)} fill="#fff" />}
                  </g>
                ))}
                {L.rows.map(
                  (r) =>
                    r.text &&
                    L.order.has(r.n) && (
                      <g
                        key={r.n}
                        className="ti-bar-hide"
                        style={{ '--bd': `${barDelay(L.order.get(r.n)!)}ms` } as CSSProperties}
                      >
                        <polygon points={pts(r.text)} fill="#000" />
                      </g>
                    ),
                )}
              </g>
            </mask>
            {/* 黑條是紙上的墨：跟著光池暗下去，最暗不低於底色 #0b0e13。 */}
            <filter id={`${id}k`} colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                {(['R', 'G', 'B'] as const).map((c, i) => {
                  const F = { R: 'feFuncR', G: 'feFuncG', B: 'feFuncB' }[c] as 'feFuncR';
                  return <F key={c} type="linear" slope={INK} intercept={FLOOR[i] * (1 - INK)} />;
                })}
              </feComponentTransfer>
            </filter>
            <mask id={`${id}b`} maskUnits="userSpaceOnUse" x={0} y={0} width={L.W} height={L.H}>
              {L.rows.map(
                (r) =>
                  r.bar &&
                  L.order.has(r.n) && (
                    <g
                      key={r.n}
                      className="ti-bar"
                      data-row={r.n + 1}
                      style={{ '--bd': `${barDelay(L.order.get(r.n)!)}ms` } as CSSProperties}
                    >
                      <polygon points={pts(r.bar)} fill="#fff" filter={`url(#${id}d${r.s})`} />
                    </g>
                  ),
              )}
            </mask>
          </defs>
          <g
            className="ti-sheet"
            style={{ transformOrigin: `${L.origin[0]}px ${L.origin[1]}px` } as CSSProperties}
          >
            <image href={src.blank} width={L.W} height={L.H} />
            <image href={src.numbers} width={L.W} height={L.H} mask={`url(#${id}m)`} />
            <image href={src.full} width={L.W} height={L.H} mask={`url(#${id}r)`} />
            <image
              href={src.blank}
              width={L.W}
              height={L.H}
              filter={`url(#${id}k)`}
              mask={`url(#${id}b)`}
            />
          </g>
        </svg>
      )}
    </div>
  );
}

/** 手機（≤767px）用直式機位；兩種都先給 AVIF、再給 WebP。 */
type Src = readonly [avif: string, webp: string];
function Plate({ desk, phone, className }: { desk: Src; phone: Src; className?: string }) {
  const PHONE = '(max-width: 767px)';
  return (
    <picture className={['ti-plate', className].filter(Boolean).join(' ')}>
      <source media={PHONE} type="image/avif" srcSet={phone[0]} />
      <source media={PHONE} type="image/webp" srcSet={phone[1]} />
      <source type="image/avif" srcSet={desk[0]} />
      <img src={desk[1]} alt="" decoding="async" draggable={false} />
    </picture>
  );
}

/**
 * 0:10：塗黑的頁面立起來變成百葉窗（場景光影 #3 正式圖），31 條縫＝31 層樓。底圖的亮縫權重是 0，
 * 亮的那一條是另一層，黑底、screen 疊上去，2.4 秒起亮。整組從 1.3 倍拉到 1.0。
 * 第一集亮最上面那條（31 樓）；第二集亮合約第 7.3 條那一行（第 13 縫，和第一集同一個機位、葉片升高 18 縫）。
 */
const BLINDS = {
  ep1: {
    base: { desk: [blindDA, blindDW], phone: [blindPA, blindPW] },
    slit: { desk: [slitDA, slitDW], phone: [slitPA, slitPW] },
  },
  ep2: {
    base: { desk: [blind2DA, blind2DW], phone: [blind2PA, blind2PW] },
    slit: { desk: [slit2DA, slit2DW], phone: [slit2PA, slit2PW] },
  },
} as const;
function Blinds({ ep2 }: { ep2: boolean }) {
  const { base, slit } = BLINDS[ep2 ? 'ep2' : 'ep1'];
  return (
    <div className="ti-blinds">
      <Plate desk={base.desk} phone={base.phone} />
      <Plate desk={slit.desk} phone={slit.phone} className="ti-slit" />
    </div>
  );
}

/**
 * 0:17：一張寬圖橫移（陪審席）。視窗左緣從圖寬的 0.310（手機 0.561）移到 0；寬螢幕的起點往回收，
 * 右邊不露出圖外。暗角是另一張圖，固定在視窗上、一般疊法（不烤進寬圖，橫移時暗角不跟著走）。
 */
function Court() {
  return (
    <>
      <div className="ti-pan">
        <Plate desk={[c17DA, c17DW]} phone={[c17PA, c17PW]} />
      </div>
      <picture className="ti-plate ti-vignette">
        <source media="(max-width: 767px)" srcSet={vigP} />
        <img src={vigD} alt="" decoding="async" draggable={false} />
      </picture>
    </>
  );
}

/** 0:23：證人席，麥克風、一杯水。浮出本集的關鍵物，黑條蓋上。 */
function Witness({ ep2 }: { ep2: boolean }) {
  const t = useT();
  return (
    <>
      <Plate desk={[c23DA, c23DW]} phone={[c23PA, c23PW]} className="still" />
      {ep2 ? (
        <>
          {/* 不是藏、刪、默（黑條的三種意思），是他自己按掉的：61 次紀錄都在（ep2.yaml app-log）。
              提醒卡像被手指按掉一樣往右滑出，原位留一行「已略過」和那一次的時間（設計師 #319）。 */}
          <div className="ti-note">
            <b>{t('卡爾德快遞', 'cold-open')}</b>
            <span className="ti-msg">
              {t('您已連續上線 10 小時。休息將使今日評分下降。', 'cold-open')}
            </span>
          </div>
          <p className="ti-skipped">
            {t('已略過')}
            <time>18:09</time>
          </p>
        </>
      ) : (
        <div className="ti-bubble">
          <b>{t('葛蘭特・沃斯', 'cold-open')}</b>
          <span className="ti-msg">
            {t('十點四十五分上來，把筆電帶來。我們私下解決。', 'cold-open')}
            <i className="ti-msg-bar">
              <em>{t('此訊息已被收回')}</em>
            </i>
          </span>
        </div>
      )}
    </>
  );
}

/**
 * 0:29：盧卡斯的背影（正式圖：立牌 v4 的輪廓光，手上那頁紙在房間裡實算），從 1.0 推到 1.12（中心在畫面正中）。
 * 一道螢光由左往右刷過紙上第 13 行：全片第一道黃。螢光的四角取自場景光影的 court-0029-ui.json（放大 1.0 時的
 * 底圖座標），畫在和底圖同尺寸、同裁切（cover＝slice）的 SVG 上，跟著一起推。
 */
function Lucas() {
  return (
    <div className="ti-push29">
      <Plate desk={[c29DA, c29DW]} phone={[c29PA, c29PW]} className="rack" />
      <svg
        className="ti-hl29 ti-hl29-desk"
        viewBox="0 0 2880 1800"
        preserveAspectRatio="xMidYMid slice"
      >
        <polygon
          className="ti-hl29-ink"
          points="1160.1,1277.8 1332.0,1303.0 1331.1,1308.8 1159.2,1283.4"
        />
      </svg>
      <svg
        className="ti-hl29 ti-hl29-phone"
        viewBox="0 0 1620 2880"
        preserveAspectRatio="xMidYMid slice"
      >
        <polygon
          className="ti-hl29-ink"
          points="223.7,2044.5 499.1,2084.8 497.7,2094.0 222.3,2053.4"
        />
      </svg>
    </div>
  );
}

/** 0:34：標準字直排。每個字先是一條黑條，燈管亮起的同時依序抽走；「疑」字旁留下螢光直線。 */
function Mark() {
  const t = useT();
  return (
    <div className="ti-mark">
      <span className="ti-tube" />
      <span className="ti-cone" />
      <h1 aria-label={t('合理懷疑')}>
        {[...'合理懷疑'].map((c, i) => (
          <span key={i} className="ti-ch" style={{ '--i': i } as CSSProperties}>
            {c}
          </span>
        ))}
        <i className="ti-hl" />
      </h1>
    </div>
  );
}
