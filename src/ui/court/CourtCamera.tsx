import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { useLang, useT } from '../../i18n';
import { reducedMotion } from '../a11y';
import { JUDGE } from '../../engine/episode/trial';
import { benchNames } from './camNames';
import { P_FROM, P_TO, climbCoef, easeOf } from './climb';
import { useSettings } from '../../engine/settings';
import { useScope } from '../lang';
import type { Cue } from '../record';
import { readUnits, splitCards, subEm, SUB_MIN_UNITS } from './subtitleSplit';
import { castLook } from '../jury/cast';
import { svg } from '../jury/silhouette';

/**
 * 法庭鏡頭（設定集第 7 章「3D 立牌」與 :21–22 裁切規則、第 10.3／10.4 章；設計師 P3 裁定 5）。
 * 桌機是中欄一條 2.39:1 的鏡頭條，手機在招牌時刻插一張 16:9；兩種都從同一張機位圖裁，眼線在畫面高度 1/3。
 *
 * 一個機位由這幾個檔組成（src/ui/court/cam/，算圖來了直接覆蓋，不用改程式）：
 * - `{機位}.json`：清單。standee＝立牌（400×500 的剪影卡面）在 16:9 畫面裡的左、上、寬（比例）；
 *   crop239＝鏡頭條的裁切框 [x, y, w, h]（比例）；eye＝眼線高度；slots＝法官席每一場的窗光時段；
 *   placeholder＝占位圖（框上方標「待放 3D 機位」）。
 * - `{機位}-{狀態}.avif／.webp`：那個狀態的底圖（各層光已合成好、調過色，人不在圖裡、影子在）。
 *   證人席的狀態是 default／lock／build／confront／fifth；法官席是 p0–p5（耐心剩幾根燈管），
 *   有時段就是 bench-{時段}-p{n}，英文介面先找 -en（背牆的字）；找不到退回 bench-d2-pm。
 * - `{機位}-{狀態}-rim.webp`：立牌的受光圖（灰階，和底圖同一個畫面）。輪廓光乘上它，被百葉窗光條、
 *   盧卡斯的影子擋掉的地方就沒有輪廓光；沒有這張就照剪影自己的燈畫。
 * - 證人席 lock→build、build→confront 另有 `{機位}-{從}-{到}-climb.png`：影子往上爬的遮罩（climb.ts），換狀態時 --dur-shadow 掃過去；其他狀態互換淡化，減少動態直接換。
 * - `{機位}-front.webp`（或 `{機位}-{狀態}-front.webp`）：擋在立牌前面的東西（證人席桌面、欄杆、法官席桌緣），帶 alpha。
 */

const PLATES = import.meta.glob('./cam/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
/** 影子往上爬的遮罩（climb.ts），檔名 {機位}-{從}-{到}-climb.png，例如 witness-lock-build-climb.png。 */
const CLIMBS = import.meta.glob('./cam/*-climb.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const MANIFESTS = import.meta.glob('./cam/{bench,witness}.json', {
  eager: true,
  import: 'default',
}) as Record<string, Manifest>;

interface Manifest {
  placeholder?: boolean;
  eye: number;
  crop239: [number, number, number, number];
  standee: { x: number; y: number; w: number };
  slots?: Record<string, string>;
}

export type Cam = 'witness' | 'bench';
export type Shot = Cam | 'black';
/** 證人席的五個狀態（第 10.4 章：作證、鎖定、鋪陳、對質，加上援引緘默權）。 */
export type WitnessState = 'default' | 'lock' | 'build' | 'confront' | 'fifth';

const LABEL: Record<Cam, string> = { witness: '證人席', bench: '法官席' };

function pick(names: string[]) {
  for (const name of names) {
    const avif = PLATES[`./cam/${name}.avif`];
    const webp = PLATES[`./cam/${name}.webp`];
    if (avif || webp) return { name, avif, webp: webp ?? avif };
  }
  return null;
}

type Plate = NonNullable<ReturnType<typeof pick>>;
/** 一層：底圖、受光圖、前景（同一個狀態的三張圖）。換狀態時新舊兩層疊著，用遮罩或透明度換。 */
interface Layer {
  name: string;
  plate: Plate;
  rim: Plate | null;
  front: Plate | null;
}

function resolve(cam: Cam, names: string[]): Layer | null {
  const plate = pick(names);
  if (!plate) return null;
  return {
    name: plate.name,
    plate,
    rim: pick([`${plate.name}-rim`]),
    front: pick([`${plate.name}-front`, `${cam}-front`]),
  };
}

/** 從這一層換到那一層的方式：有遮罩就由下往上爬；證人席其他狀態互換用淡化；其餘（轉頭、法官席）直接換。 */
function changeOf(cam: Cam, from: Layer, to: Layer): { climb: string } | 'fade' | null {
  if (cam !== 'witness') return null;
  const state = (l: Layer) => l.name.slice(l.name.indexOf('-') + 1);
  if (state(from) === 'fifth' || state(to) === 'fifth') return null;
  const climb = CLIMBS[`./cam/${from.name}-${state(to)}-climb.png`];
  return climb ? { climb } : 'fade';
}

function Img({ src, className }: { src: { avif?: string; webp: string }; className: string }) {
  return (
    <picture className={className}>
      {src.avif && src.avif !== src.webp && <source type="image/avif" srcSet={src.avif} />}
      <img src={src.webp} alt="" decoding="async" draggable={false} />
    </picture>
  );
}

/** 一層的畫面：底圖、立牌（本體＋受光）、前景。 */
function CamLayer({
  cam,
  layer,
  look,
  turn,
  rimUnits,
  catchSize,
  box,
  fx,
}: {
  cam: Cam;
  layer: Layer;
  look: ReturnType<typeof castLook>;
  turn: boolean;
  rimUnits: number;
  catchSize: number;
  box: CSSProperties;
  fx?: { mask?: string; fade?: boolean };
}) {
  // 證人席有正面和轉頭兩張立牌，換的時候交叉淡化（第 7 章 :75，--dur-turn），不硬切。
  const poses = useMemo(() => {
    if (!look) return [];
    return (cam === 'witness' ? [false, true] : [false]).map((t) => {
      const o = {
        v: 85,
        pose: 'J1' as const,
        bg: false,
        rim: rimUnits,
        catchSize,
        turn: t,
        uid: `cam-${layer.name}-${look.id}${t ? '-turn' : ''}`,
      };
      return {
        turn: t,
        body: svg(look, { ...o, part: 'body' }),
        light: svg(look, { ...o, part: 'light' }),
      };
    });
  }, [look, rimUnits, catchSize, cam, layer.name]);
  const { rim, front, plate } = layer;
  return (
    <div
      className="cam-layer"
      data-fx={fx ? (fx.mask ? 'climb' : 'fade') : undefined}
      style={
        fx?.mask
          ? {
              maskImage: `url(#${maskId(layer.name)})`,
              WebkitMaskImage: `url(#${maskId(layer.name)})`,
            }
          : fx
            ? { opacity: 0 }
            : undefined
      }
    >
      <Img src={plate} className="cam-plate" />
      {poses.map((p) => (
        <span key={String(p.turn)} className="cam-pose" data-on={p.turn === turn || undefined}>
          <span className="cam-standee" style={box} dangerouslySetInnerHTML={{ __html: p.body }} />
          <span
            className="cam-light"
            style={rim ? ({ '--rim': `url("${rim.webp}")` } as CSSProperties) : undefined}
            data-rim={rim ? '' : undefined}
          >
            <span
              className="cam-standee"
              style={box}
              dangerouslySetInnerHTML={{ __html: p.light }}
            />
          </span>
        </span>
      ))}
      {front && <Img src={front} className="cam-front" />}
    </div>
  );
}

function maskId(name: string) {
  return `cam-climb-${name}`;
}

/** 遮罩的 SVG 定義：遮罩圖過一道 feComponentTransfer（climb.ts 的係數），進度由 Stage 每格改 intercept。 */
function ClimbDefs({ name, src }: { name: string; src: string }) {
  const c = climbCoef(P_FROM);
  const f = { type: 'linear', slope: c.slope, intercept: c.intercept } as const;
  return (
    <svg className="cam-defs" width="0" height="0" aria-hidden focusable="false">
      <defs>
        <filter
          id={`${maskId(name)}-f`}
          colorInterpolationFilters="sRGB"
          x="0"
          y="0"
          width="1"
          height="1"
        >
          <feComponentTransfer>
            <feFuncR {...f} />
            <feFuncG {...f} />
            <feFuncB {...f} />
          </feComponentTransfer>
        </filter>
        <mask
          id={maskId(name)}
          maskContentUnits="objectBoundingBox"
          x="0"
          y="0"
          width="1"
          height="1"
        >
          <image
            href={src}
            x="0"
            y="0"
            width="1"
            height="1"
            preserveAspectRatio="none"
            filter={`url(#${maskId(name)}-f)`}
          />
        </mask>
      </defs>
    </svg>
  );
}

/** 圖解碼好了沒：切鏡頭前新鏡頭的每一層都要解碼完，不然切過去那一格只有剪影和字幕（設計師 #281 第三輪）。 */
const warmed = new Map<string, Promise<void>>();
const warmedDone = new Set<string>();
function warm(url: string) {
  let p = warmed.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = (img.decode ? img.decode() : Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        warmedDone.add(url);
      });
    warmed.set(url, p);
  }
  return p;
}
/** 進場等圖的保險上限（ms）：到了才先出字幕，鏡頭仍黑。 */
const ENTRY_CAP = 8000;
const layerUrls = (l: Layer | null) =>
  l ? [l.plate.webp, l.rim?.webp, l.front?.webp].filter((u): u is string => !!u) : [];

/** 英文台詞的實際寬度（em）：用字幕卡真正的字型家族，canvas 量。量不到就回 undefined，切分器照每字 0.6em 估。 */
let ctx: CanvasRenderingContext2D | null | undefined;
function measureOf(font: string): ((t: string) => number) | undefined {
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
/** 字幕卡實際用的字型家族（英文介面和中文不同）：放一張空卡進去讀 computed style。 */
function probeFamily(el: HTMLElement) {
  const p = document.createElement('p');
  p.className = 'cam-sub';
  p.style.visibility = 'hidden';
  el.appendChild(p);
  const fam = getComputedStyle(p).fontFamily;
  p.remove();
  return fam;
}

function token(el: Element, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** 一個機位：兩層疊著換（底圖、立牌、前景）。 */
function Stage({
  cam,
  who,
  names,
  on,
  mode,
  frameW,
  turn = false,
}: {
  cam: Cam;
  who: string;
  names: string[];
  on: boolean;
  mode: 'strip' | 'insert';
  frameW: number;
  /** 援引緘默權：立牌換成轉頭的剪影（機位審查 review-v1 第 2 條）。 */
  turn?: boolean;
}) {
  const m = MANIFESTS[`./cam/${cam}.json`];
  // 16:9 的機位圖放進框裡：照裁切框把整張圖往上、往左推（2.39:1 只露出 crop239 那一段，眼線仍在 1/3）。
  const crop = mode === 'strip' && m ? m.crop239 : [0, 0, 1, 1];
  const width = frameW / crop[2];
  const target = resolve(cam, names);
  const look = castLook(who);
  // 輪廓光照顯示寬度換算：畫面上 1.25px（設計師：1–1.5px，不能是原圖上的寬）。取 0.5 的倍數，拖拉視窗時不一直重畫。
  const shown = (m?.standee.w ?? 0.2) * width;
  const rimUnits = shown > 0 ? Math.max(1, Math.round(((1.25 * 400) / shown) * 2) / 2) : 8;
  // 眼神光畫面上至少 2×2 px。
  const catchSize = shown > 0 ? Math.max(5, Math.ceil((2 * 400) / shown)) : 5;

  // 換狀態：鏡頭正開著才有過場（一刀切過來的那一格直接是新的）；減少動態直接換。
  const [base, setBase] = useState(target);
  const [inc, setInc] = useState<{ layer: Layer; climb?: string } | null>(null);
  const wasOn = useRef(on);
  const root = useRef<HTMLDivElement>(null);
  const shownName = (inc?.layer ?? base)?.name;
  useLayoutEffect(() => {
    const was = wasOn.current;
    wasOn.current = on;
    if (!target || target.name === shownName) return;
    // 上一個過場還沒走完就又換了：先把它定下來，再從它開始。
    const settled = inc?.layer ?? base;
    const how = on && was && settled && !reducedMotion() ? changeOf(cam, settled, target) : null;
    if (!how || !settled) {
      setBase(target);
      setInc(null);
      return;
    }
    setBase(settled);
    setInc({ layer: target, climb: how === 'fade' ? undefined : how.climb });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.name, on]);

  // 過場：--dur-shadow 300ms、--ease-light，進度 p 由 rAF 推；新一層的圖都解碼好才開始，不閃空白。
  useEffect(() => {
    const el = root.current;
    if (!inc || !el) return;
    const layerEl = el.querySelector<HTMLElement>('.cam-layer[data-fx]');
    if (!layerEl) return;
    const dur = parseFloat(token(el, '--dur-shadow')) || 300;
    const ease = easeOf(token(el, '--ease-light'));
    const funcs = Array.from(
      el.querySelectorAll('.cam-defs feFuncR, .cam-defs feFuncG, .cam-defs feFuncB'),
    );
    const apply = (e: number) => {
      if (inc.climb) {
        const c = climbCoef(P_FROM + (P_TO - P_FROM) * e);
        for (const f of funcs) f.setAttribute('intercept', String(c.intercept));
      } else layerEl.style.opacity = String(e);
    };
    let raf = 0;
    let dead = false;
    const warm = [
      ...Array.from(layerEl.querySelectorAll('img')),
      ...(inc.climb ? [Object.assign(new Image(), { src: inc.climb })] : []),
    ].map((i) => (i.decode ? i.decode().catch(() => undefined) : Promise.resolve()));
    const go = () => {
      if (dead) return;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        apply(ease(t));
        if (t < 1) raf = requestAnimationFrame(step);
        else {
          setBase(inc.layer);
          setInc(null);
        }
      };
      raf = requestAnimationFrame(step);
    };
    void Promise.race([Promise.all(warm), new Promise((r) => setTimeout(r, 1000))]).then(go);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [inc]);

  const layers = [base, inc?.layer].filter((l): l is Layer => !!l);
  if (!m || !layers.length) return null;
  const box = {
    left: `${m.standee.x * 100}%`,
    top: `${m.standee.y * 100}%`,
    width: `${m.standee.w * 100}%`,
  };
  return (
    <div
      ref={root}
      className="cam-stage"
      data-cam={cam}
      data-on={on || undefined}
      style={
        { '--cx': crop[0], '--cy': crop[1], '--cw': crop[2], '--ch': crop[3] } as CSSProperties
      }
    >
      {inc?.climb && <ClimbDefs name={inc.layer.name} src={inc.climb} />}
      {layers.map((l) => (
        <CamLayer
          key={l.name}
          cam={cam}
          layer={l}
          look={look}
          turn={turn}
          rimUnits={rimUnits}
          catchSize={catchSize}
          box={box}
          fx={inc && l === inc.layer ? { mask: inc.climb } : undefined}
        />
      ))}
    </div>
  );
}

export function CourtCamera({
  shot,
  witness,
  state,
  patience,
  scene,
  mode,
  open = true,
  cues = [],
  ref,
}: {
  shot: Shot;
  /** 證人席上的人（劇本裡的名字，對到剪影組）。 */
  witness: string;
  state: WitnessState;
  patience: number;
  scene: string;
  /** strip：桌機中欄的 2.39:1 鏡頭條；insert：手機插入的 16:9。 */
  mode: 'strip' | 'insert';
  /** 手機插入的鏡頭只在招牌時刻打開。 */
  open?: boolean;
  /** 字幕列（設定集 10.1）：鏡頭裡的人說的話，由筆錄交出來。 */
  cues?: Cue[];
  /** 手機：筆錄要知道鏡頭蓋住它多少（最新那一行捲到鏡頭上面）。 */
  ref?: Ref<HTMLDivElement>;
}) {
  const t = useT();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // 標籤跟著目前的機位走；一刀黑的那一格沿用上一個。
  const [last, setLast] = useState<Cam>('witness');
  const cam: Cam = shot === 'black' ? last : shot;
  if (shot !== 'black' && shot !== last) setLast(shot);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slot = MANIFESTS['./cam/bench.json']?.slots?.[scene];
  const en = useLang((s) => s.lang) === 'en';
  const benchPick = benchNames(slot, patience, en);
  const witnessNames = [`witness-${state}`, 'witness-default'];
  const placeholder = MANIFESTS[`./cam/${cam}.json`]?.placeholder;

  // 兩個機位的圖一直先解碼好（異議一開始就載入法官席，在法官席時載入要切回去的證人席）；
  // 切鏡頭時新鏡頭每一層都解碼完才換，在那之前畫面停在舊鏡頭，不出現只剩剪影和字幕的黑格。
  const urls = {
    witness: layerUrls(resolve('witness', witnessNames)),
    bench: layerUrls(resolve('bench', benchPick)),
  };
  const warmKey = [...urls.witness, ...urls.bench].join('|');
  useEffect(() => {
    for (const u of warmKey.split('|')) if (u) void warm(u);
  }, [warmKey]);
  const need = shot === 'black' ? [] : urls[shot];
  const ready = need.every((u) => warmedDone.has(u));
  // 進場的第一個機位：圖還沒解碼完就先停在黑，剪影與字幕等圖到了才一起出現。
  const [seen, setSeen] = useState<Shot>(ready ? shot : 'black');
  const [entered, setEntered] = useState(ready);
  if (seen !== shot && ready) setSeen(shot);
  if (!entered && seen === shot) setEntered(true);
  useLayoutEffect(() => {
    if (seen === shot || ready) return;
    let dead = false;
    const go = () => !dead && setSeen(shot);
    const all = Promise.all(need.map(warm));
    // 進場（設計師 #285）：沒有舊鏡頭可停，圖沒好就一直黑，好了硬切進來；
    // 約 8 秒還沒好才先出字幕（字幕是無障礙），鏡頭仍黑，不出載了一半的層。
    // 切鏡頭：停在舊鏡頭，最多等 1.5 秒。
    if (!entered) {
      const timer = setTimeout(() => !dead && setEntered(true), ENTRY_CAP);
      void all.then(go);
      return () => {
        dead = true;
        clearTimeout(timer);
      };
    }
    void Promise.race([all, new Promise((r) => setTimeout(r, 1500))]).then(go);
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, warmKey]);

  return (
    <div ref={ref} className={`court-cam ${mode}`} data-open={open || undefined} aria-hidden>
      {placeholder && (
        <span className="tbd-label">
          <span>{t('待放 3D 機位')}</span>
          <span>{t(LABEL[cam])}</span>
        </span>
      )}
      <div className="cam-frame" ref={frame} data-shot={seen}>
        <Stage
          cam="witness"
          who={witness}
          names={witnessNames}
          on={seen === 'witness'}
          mode={mode}
          frameW={width}
          turn={state === 'fifth'}
        />
        <Stage
          cam="bench"
          who="法官"
          names={benchPick}
          on={seen === 'bench'}
          mode={mode}
          frameW={width}
        />
        <div className="cam-black" />
        <Subtitles cues={entered ? cues : []} />
      </div>
    </div>
  );
}

/**
 * 字幕列（設定集 10.1、RD-ART-1001）：鏡頭層上的介面，永遠不被調色、不被一刀黑蓋掉。
 * 說話者名 --cine-muted、台詞 Noto Sans TC 500；底框 rgb(6 8 11 / 72%)、6px 圓角、雙層文字陰影。
 * 一批裡的每句疊在同一格：各自在 --at 出現、在下一句的 --at 收掉，時間跟筆錄同一張節拍表，不另開計時器。
 * 被蓋掉的話（異議成立、自紀錄刪除）只剩一條黑條，條裡寫原因（第 1 章「默」：黑條只在字幕列與筆錄）。
 */
function Subtitles({ cues }: { cues: Cue[] }) {
  const t = useT();
  const scope = useScope();
  const box = useRef<HTMLDivElement>(null);
  // 設定裡的「字幕」字級（1／1.25／1.5）與底框，跟畫外字幕同一組。
  const voScale = useSettings((s) => s.voScale);
  const voBox = useSettings((s) => s.voBox);
  // 一行放得下幾 em、一張放得下幾行：量框寬與實際字級；行數看「下巴線到框底」放得下幾行（最少 1、最多 2，設計師 #257）。
  const [fit, setFit] = useState({ em: 30, emRaw: 32, lines: 2, insert: false, font: '' });
  const shown = cues.length > 0;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const frame = el.offsetParent as HTMLElement | null;
    const measure = () => {
      const insert = !!el.closest('.court-cam.insert');
      // 字幕字級：桌機 19px、手機特寫 17px，說話者名 14／13px，再乘設定裡的倍率（court.css 同一組數字）。
      const px = (insert ? 17 : 19) * voScale;
      const who = (insert ? 13 : 14) * 1.4 * voScale;
      // 下巴線約在鏡頭條高度的 47%；手機插入 70%（法官席立牌頭底在 69%，設定集第 10 章 :12 字幕在下三分之一），框底留 10px。
      const h = frame?.clientHeight ?? 0;
      const room = h - 10 - h * (insert ? 0.7 : 0.47) - who - 10;
      // 手機插入鏡頭一律一行（設定集第 10 章 :12）；鏡頭還沒打開量不到高度時也不退回兩行（關卡二 #6）。
      const lines = insert ? 1 : h ? Math.max(1, Math.min(2, Math.floor(room / (px * 1.5)))) : 2;
      setFit({
        em: subEm(el.clientWidth, px),
        emRaw: Math.floor((Math.min(el.clientWidth - 32, 36 * px) - 24) / px),
        lines,
        insert,
        font: `500 ${px}px ${probeFamily(el)}`,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (frame) ro.observe(frame);
    return () => ro.disconnect();
  }, [shown, voScale]);
  const cards = useMemo(() => {
    const flat: {
      key: string;
      who: string;
      text?: string;
      lines?: string[];
      blank?: boolean;
      redact?: Cue['redact'];
      at: string;
      cue: string;
      next?: string;
      until?: string;
    }[] = [];
    for (const c of cues) {
      if (c.blank) {
        flat.push({ key: c.key, who: '', blank: true, at: c.at, cue: c.key });
        continue;
      }
      if (c.redact) {
        flat.push({ key: c.key, who: c.who, redact: c.redact, at: c.at, cue: c.key });
        continue;
      }
      // 英文用實際字型量過整行寬度，行寬不必再留估算用的餘裕：一行放得下就不切。
      // 法官的話（切到法官席時出現）桌機也只放一行，字幕框才不蓋住法官的頭（關卡二 #1）。
      const latin = !/[\p{Script=Han}]/u.test(c.text);
      const parts = splitCards(
        c.text,
        latin ? fit.emRaw : fit.em,
        c.who === JUDGE ? 1 : fit.lines,
        latin ? measureOf(fit.font) : undefined,
      );
      // 每張讀得完才換下一張：漢字 1 單位、其他 0.35，至少 10 單位；從這句出現的時間累計（字幕比筆錄慢，不閃過）。
      let read = 0;
      parts.forEach((p, k) => {
        flat.push({
          key: `${c.key}.${k}`,
          who: c.who,
          text: p.text,
          lines: p.lines,
          cue: c.key,
          until: c.until,
          at: read > 0 ? `calc(${c.at} + ${read} * var(--dur-sub-unit))` : c.at,
        });
        read += Math.max(SUB_MIN_UNITS, readUnits(p.text));
      });
    }
    // 每張收在下一張出現時；下一句（別的人）先到，就在那一刻收，不讓長句的後幾張壓在新的一句上。
    flat.forEach((c, i) => {
      const nextCard = flat[i + 1];
      if (nextCard) {
        const nextCue = flat.slice(i + 1).find((x) => x.cue !== c.cue);
        c.next =
          nextCard.cue === c.cue && nextCue ? `min(${nextCard.at}, ${nextCue.at})` : nextCard.at;
      }
      // 有收掉時間的句子（異議裁定：切回證人就收）：到時間就收，不留在證人的畫面上（關卡二 #8）。
      if (c.until) c.next = c.next ? `min(${c.next}, ${c.until})` : c.until;
    });
    return flat;
  }, [cues, fit]);
  if (!cues.length) return null;
  return (
    <div
      className="cam-subs"
      ref={box}
      data-subbox={voBox ? 'on' : undefined}
      style={{ '--sub-scale': voScale } as CSSProperties}
    >
      {cards.map((c, i) =>
        c.blank ? null : (
          <p
            key={c.key}
            className="cam-sub"
            style={{ '--at': c.at, '--next': c.next } as CSSProperties}
            data-last={(i === cards.length - 1 && !c.until) || undefined}
          >
            <span className="who">{t(c.who, scope)}</span>
            {c.redact ? (
              <span className="sub-bar">
                <small>{t(c.redact)}</small>
              </span>
            ) : (
              <span className="tx">
                {c.lines
                  ? c.lines.map((l) => (
                      <span key={l} className="ln">
                        {l}
                      </span>
                    ))
                  : c.text}
              </span>
            )}
          </p>
        ),
      )}
    </div>
  );
}
