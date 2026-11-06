import {
  createContext,
  useContext,
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import { useLang, type Lang } from '../i18n';
import plateData from './plates/plates.json';
import standeeData from './plates/standees.json';
import { RIGS } from './rigs';
import './scenePlate.css';

/**
 * 場景底圖（src/ui/plates/plates.json）：場景光影算好的桌機、手機兩版，一張底圖屬於一場戲。
 * 這裡只做三件事：
 * 1. 照「集:場景 id」找圖。圖的燈組（rig）必須跟場景自己寫的 rig 一樣，不一樣就當沒有（色溫不在程式裡寫死，
 *    永遠是 rigs.yaml 經場景的 rig: 來的；plates.test.ts 另外在 CI 擋住兩邊不一致）。
 * 2. 石楣、告示照介面語言：有 lang 的圖只在同一種語言用。
 * 3. 圖沒解碼完以前是純黑（不是桌面、不是半張圖）：定場那一格連場記都等，圖到了才開始計時。
 */
type Entry = {
  id: string;
  scene: string;
  rig: string;
  lang?: Lang;
  files: Record<'desktop' | 'phone', { file: string }>;
  focus?: { y?: number };
  /** 窄視窗裁左右時：圖上的 at（圖寬比例）落在視窗寬的 to 處（和立牌組的 anchor 同一個意思）。 */
  anchor?: Partial<Record<'desktop' | 'phone', { at: number; to: number }>>;
  subjects?: Record<'desktop' | 'phone', Subject[]>;
  /** 盡量不蓋的亮處（22:49 的門縫光）：主體先不蓋，再挑蓋這些最少的位置；cover 是目標，做不到時取最少。 */
  clear?: Record<'desktop' | 'phone', Subject[]>;
};

/**
 * 圖上不能被介面蓋住的東西（主體框，圖寬高的比例 [x0, y0, x1, y1]）：cover 是最多可以被蓋掉的面積比例
 * （0＝整個要露出來）。字幕框和按鈕照這個避開（useAvoidSubjects）。
 */
export type Subject = { id: string; box: [number, number, number, number]; cover: number };

const ENTRIES = (plateData as { plates: Entry[] }).plates;
const urls = import.meta.glob<string>('./plates/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * 人物立牌（standees.json，tools/standee/render.py 畫的透明 PNG）：站在底圖上的剪影，位置是圖上的像素，
 * 顯示時換成百分比跟著圖走。人形和邊光是場景光影的設定（身體 #07090c、每人最多一條邊光），腳落在底圖原有的接觸影子上，
 * 這裡不另外畫影子、不加任何標籤。
 */
type Standee = {
  id: string;
  desktop: StandeeFile;
  phone: StandeeFile;
};
type StandeeFile = {
  file: string;
  box: [number, number, number, number];
  ink: [number, number];
  head: [number, number];
};
type StandeeSet = {
  plates: string[];
  size: Record<Variant, [number, number]>;
  /** 窄視窗裁左右時舞台怎麼對齊：圖上的 at（圖寬的比例）落在視窗寬的 to 處（人群中心對視窗中心，或羈押室手機的右緣）。 */
  anchor: Record<Variant, { at: number; to: number }>;
  people: Standee[];
};
type Variant = 'desktop' | 'phone';

const STANDEES = Object.values(
  (standeeData as unknown as { sets: Record<string, StandeeSet> }).sets,
);
const standeeUrls = import.meta.glob<string>('./plates/standee/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
/** 底圖的像素尺寸（舞台的長寬比）：桌機 1440×900，手機 720×1280；plates 的 jpg 一律這兩個尺寸。 */
const PLATE_PX: Record<Variant, [number, number]> = { desktop: [1440, 900], phone: [720, 1280] };

export type Plate = {
  id: string;
  rig: string;
  /** 這張圖算圖用的色溫，讀燈組（rigs.yaml）。 */
  kelvin: number;
  desktop: string;
  phone: string;
  /** 視窗比圖扁、要裁上下時，圖上 y 這一點對齊視窗的同一個比例（0.5＝置中，1＝對齊底部）。 */
  focusY: number;
  anchor?: Entry['anchor'];
  subjects?: Record<Variant, Subject[]>;
  clear?: Record<Variant, Subject[]>;
};

/** 手機版：窄螢幕，或直放（直放的裝置用 9:16 那張，不從橫圖裡切中間一條）。 */
const PHONE = '(max-width: 767px), (orientation: portrait)';

export function plateFor(
  episode: string,
  scene: { id: string; rig?: string },
  lang: Lang,
): Plate | null {
  if (!scene.rig) return null;
  const hits = ENTRIES.filter((p) => p.scene === `${episode}:${scene.id}` && p.rig === scene.rig);
  const hit = hits.find((p) => p.lang === lang) ?? hits.find((p) => !p.lang);
  const rig = RIGS[scene.rig];
  if (!hit || !rig) return null;
  const url = (f: { file: string }) => urls[`./plates/${f.file}`];
  const [desktop, phone] = [url(hit.files.desktop), url(hit.files.phone)];
  return desktop && phone
    ? {
        id: hit.id,
        rig: scene.rig,
        kelvin: rig.kelvin,
        desktop,
        phone,
        focusY: hit.focus?.y ?? 0.5,
        anchor: hit.anchor,
        subjects: hit.subjects,
        clear: hit.clear,
      }
    : null;
}

/** 這一場戲的底圖（跟著介面語言）；沒有就是 null。 */
export function useScenePlate(
  episode: string,
  scene: { id: string; rig?: string } | undefined,
): Plate | null {
  const lang = useLang((s) => s.lang);
  return scene ? plateFor(episode, scene, lang) : null;
}

function usePhone() {
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

type State = 'wait' | 'ok' | 'fail';
const settled = new Map<string, State>();
/** 這張圖在字幕帶的判斷結果（圖解碼完算一次，見 bandNeedsScrim）。 */
const scrims = new Map<string, boolean>();

/** 字幕帶：64×8 降採樣的第 3、4 列（畫面高 37.5%–62.5%，畫外字幕固定在 46%）。 */
const BAND_ROWS = [3, 4];
const GRID = { w: 64, h: 8 };

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * 自適應襯底的判斷式（art bible 10.1）：字幕帶（場景本身的，不含畫外字幕那層 58% 壓暗；壓暗之後最亮也只到約 0.16，
 * 永遠到不了門檻）相對亮度平均 > 0.35，或最亮的一格 > 0.7，才加 --sub-scrim。data 是 64×8 的 RGBA。
 */
export function bandNeedsScrim(data: ArrayLike<number>): boolean {
  let sum = 0;
  let max = 0;
  let n = 0;
  for (const row of BAND_ROWS)
    for (let x = 0; x < GRID.w; x++) {
      const i = (row * GRID.w + x) * 4;
      const [r, g, b] = [0, 1, 2].map((k) => lin(data[i + k] / 255));
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += y;
      max = Math.max(max, y);
      n++;
    }
  return sum / n > 0.35 || max > 0.7;
}

/** 照現在的視窗比例（object-fit: cover）把圖降採樣成 64×8；做不到（沒有 canvas）就回 null，當作不需要襯底。 */
function sampleBand(img: HTMLImageElement): Uint8ClampedArray | null {
  try {
    const vw = globalThis.innerWidth || img.naturalWidth;
    const vh = globalThis.innerHeight || img.naturalHeight;
    const scale = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
    const [sw, sh] = [vw / scale, vh / scale];
    const [sx, sy] = [(img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2];
    // 兩段降採樣：一次縮到 64×8 會跳過大部分像素。
    const mid = document.createElement('canvas');
    [mid.width, mid.height] = [GRID.w * 4, GRID.h * 4];
    const m = mid.getContext('2d');
    const out = document.createElement('canvas');
    [out.width, out.height] = [GRID.w, GRID.h];
    const o = out.getContext('2d', { willReadFrequently: true });
    if (!m || !o) return null;
    m.imageSmoothingQuality = o.imageSmoothingQuality = 'high';
    m.drawImage(img, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
    o.drawImage(mid, 0, 0, GRID.w, GRID.h);
    return o.getImageData(0, 0, GRID.w, GRID.h).data;
  } catch {
    return null;
  }
}
const loading = new Map<string, Promise<State>>();

function decoded(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return (
    img.decode
      ? img.decode()
      : new Promise<void>((ok, no) => {
          img.onload = () => ok();
          img.onerror = () => no(new Error('img'));
        })
  ).then(() => img);
}

/** 這張底圖上站的人（立牌）的圖檔位址：和底圖一起解碼完才算好，人不會晚一拍才冒出來。 */
function standeeSrcs(plateId: string, variant: Variant): string[] {
  return (STANDEES.find((x) => x.plates.includes(plateId))?.people ?? []).map(
    (p) => standeeUrls[`./plates/standee/${p[variant].file}`],
  );
}

/** 載好並解碼（底圖加上面的人）；同一張只做一次。圖壞掉算 fail（不記住，下次再試）。 */
export function warmPlate(url: string, extra: string[] = []): Promise<State> {
  const known = settled.get(url);
  if (known) return Promise.resolve(known);
  let p = loading.get(url);
  if (!p) {
    p = Promise.all([decoded(url), ...extra.map(decoded)]).then(
      ([img]) => {
        const band = sampleBand(img);
        scrims.set(url, band ? bandNeedsScrim(band) : false);
        settled.set(url, 'ok');
        return 'ok' as const;
      },
      () => 'fail' as const,
    );
    loading.set(url, p);
    void p.then(() => loading.delete(url));
  }
  return p;
}

/** 太久不來就放棄（慢網路、壞檔）：定場照舊放黑底場記，不卡住玩家。 */
const GIVE_UP = 5000;

export type Shown = { plate: Plate; url: string; state: State; scrim: boolean; phone: boolean };

/** 照螢幕挑那一版，等它解碼完。已經解碼過的第一個畫面就是 ok，不閃黑。 */
export function useShown(plate: Plate | null): Shown | null {
  const phone = usePhone();
  const url = plate ? (phone ? plate.phone : plate.desktop) : '';
  // 同一個 url 一定是同一張底圖、同一個版本，所以上面站的人也只由 url 決定。
  const extra = plate ? standeeSrcs(plate.id, phone ? 'phone' : 'desktop') : [];
  const key = extra.join('|');
  const [got, setGot] = useState<{ url: string; state: State }>();
  useEffect(() => {
    if (!url || settled.has(url)) return;
    let live = true;
    const stop = setTimeout(() => live && setGot({ url, state: 'fail' }), GIVE_UP);
    void warmPlate(url, key ? key.split('|') : []).then((state) => {
      clearTimeout(stop);
      if (live) setGot({ url, state });
    });
    return () => {
      live = false;
      clearTimeout(stop);
    };
  }, [url, key]);
  if (!plate) return null;
  const state = settled.get(url) ?? (got?.url === url ? got.state : 'wait');
  return state === 'fail' ? null : { plate, url, state, scrim: scrims.get(url) ?? false, phone };
}

/**
 * 底圖層：釘在視窗後面，圖沒好以前是純黑。圖不放在介面前面，介面（台詞框、按鈕）自己讓出上半部。
 * 燈組與色溫寫在 data 上（驗收截圖與 e2e 讀它，不讀圖檔）。
 */
export function ScenePlate({ shown, dim }: { shown: Shown; dim?: boolean }) {
  const { plate, url, state: warm, phone } = shown;
  // 畫面上這幾張 <img> 自己解碼完才亮：warmPlate 解碼的是另一個 Image 物件，這邊的元件掛上去時還沒畫，
  // 小的立牌圖會先出來、底圖晚幾格（第二道關卡 v93 第 1 處：立牌單獨浮在黑底上）。底圖、立牌一起亮，從黑淡入。
  const stage = useRef<HTMLDivElement>(null);
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (warm !== 'ok') return;
    let live = true;
    const imgs = [...(stage.current?.querySelectorAll('img') ?? [])];
    void Promise.all(imgs.map((i) => i.decode().catch(() => undefined))).then(
      () => live && setPainted(true),
    );
    return () => {
      live = false;
    };
  }, [warm]);
  const state: State = warm === 'ok' && !painted ? 'wait' : warm;
  const variant: Variant = phone ? 'phone' : 'desktop';
  const [w, h] = PLATE_PX[variant];
  const set = STANDEES.find((x) => x.plates.includes(plate.id));
  const people = set?.people ?? [];
  return (
    <div
      className="scene-plate"
      data-plate={plate.id}
      data-rig={plate.rig}
      data-kelvin={plate.kelvin}
      data-state={state}
      data-dim={dim ? '' : undefined}
      data-subjects={plate.subjects ? JSON.stringify(plate.subjects[variant]) : undefined}
      data-clear={plate.clear ? JSON.stringify(plate.clear[variant]) : undefined}
      aria-hidden
    >
      <div
        ref={stage}
        className="plate-stage"
        style={
          {
            '--ar': `${w} / ${h}`,
            '--hw': h / w,
            '--fy': plate.focusY,
            '--f': (set?.anchor[variant] ?? plate.anchor?.[variant])?.at ?? 0.5,
            '--a': (set?.anchor[variant] ?? plate.anchor?.[variant])?.to ?? 0.5,
          } as CSSProperties
        }
      >
        <img className="plate-bg" src={url} alt="" decoding="async" draggable={false} />
        {people.map((p) => {
          const { file, box } = p[variant];
          return (
            <img
              key={p.id}
              className="standee"
              data-standee={p.id}
              src={standeeUrls[`./plates/standee/${file}`]}
              alt=""
              decoding="async"
              draggable={false}
              style={{
                left: `${(box[0] / w) * 100}%`,
                top: `${(box[1] / h) * 100}%`,
                width: `${(box[2] / w) * 100}%`,
                height: `${(box[3] / h) * 100}%`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * 這一場有底圖在背後：畫外字幕（VoiceOver）改走鏡頭層的版本（data-layer='scene'）——圖只壓暗到 58%、字用鏡頭層的白，
 * 不用整頁的紙色／墨色把圖蓋掉。
 */
export const OnPlate = createContext<{ scrim: boolean } | null>(null);
/** Provider 的值：沒有底圖是 null；字幕帶太亮就帶 scrim（畫外字幕自己加襯底）。 */
export const onPlateOf = (shown: Shown | null) => (shown ? { scrim: shown.scrim } : null);
export const useOnPlate = () => useContext(OnPlate);

/**
 * 底圖上的眉標：縮成一條場記，規則和定場場記（PlaceSlate）一樣——手機永遠一行，放不下就整段拿掉前面的場所名／幕名，
 * 不在字中間斷；房間才是這一場的資訊，永遠留著。讀屏照常唸整句（拿掉的那段只是不畫）。
 */
/** 眉標右邊留給選單鈕的寬度（styles.css 的 .plate-eyebrow max-width 同一個值）。 */
const EYEBROW_MENU = 96;

export function PlateEyebrow({ text }: { text: string }) {
  const en = useLang((s) => s.lang) === 'en';
  const sep = en ? ', ' : '\u3000';
  const cut = text.lastIndexOf(sep);
  const [lead, room] =
    cut > 0 ? [text.slice(0, cut + sep.length), text.slice(cut + sep.length)] : ['', text];
  const ref = useRef<HTMLParagraphElement>(null);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box || !lead) return;
    // 整句（含前面那段；拿掉的那段只是不畫，量得到寬度）放不放得下：可用寬度同 CSS 的 max-width（右上角留給選單鈕）。
    const fit = () => {
      const cs = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const full = [...el.children].reduce((w, c) => w + (c as HTMLElement).offsetWidth, 0);
      const pad =
        el.offsetWidth - el.clientWidth + 2 * parseFloat(getComputedStyle(el).paddingLeft);
      setShort(full + pad > room - EYEBROW_MENU);
    };
    fit();
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(fit);
    return () => window.removeEventListener('resize', fit);
  }, [lead, room]);
  return (
    <p ref={ref} className={short ? 'eyebrow plate-eyebrow short' : 'eyebrow plate-eyebrow'}>
      {lead && <span className="ps-lead">{lead}</span>}
      <span className="ps-room">
        {short && en ? room.charAt(0).toUpperCase() + room.slice(1) : room}
      </span>
    </p>
  );
}

/**
 * 底圖是整個畫面共用的一層（PlateHost，App 掛一個），不跟著哪一場的介面掛上卸下：地點字卡→場景、理論開場→選理論，
 * 同一張底圖整段不卸載，所以切換時不會黑一下、立牌不會單獨浮在黑底上（第二道關卡 v93 第 1 處）；換另一張底圖才重新掛、重新淡入。
 * 場景自己的介面用 usePlate 說「我這一格要這張圖」：over='beat' 是定場（圖在場記後面、黑底的定場卡讓出來），
 * over='scene' 是場景介面後面。
 */
type PlateLayer = { shown: Shown; dim: boolean; over: 'beat' | 'scene' };
const usePlateStore = create<{ layer: PlateLayer | null }>(() => ({ layer: null }));

export function usePlate(shown: Shown | null, over: 'beat' | 'scene', dim = false) {
  const key = shown ? `${shown.url}|${shown.state}|${shown.scrim}` : '';
  useLayoutEffect(() => {
    if (!shown) return;
    const mine: PlateLayer = { shown, dim, over };
    usePlateStore.setState({ layer: mine });
    return () => {
      // 換場時舊的先卸、新的才掛（同一個 commit）：只清自己的，不蓋掉接手的那一層。
      if (usePlateStore.getState().layer === mine) usePlateStore.setState({ layer: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dim, over]);
}

export function PlateHost() {
  const layer = usePlateStore((s) => s.layer);
  if (!layer) return null;
  return (
    <div className="plate-host" data-over={layer.over}>
      <ScenePlate key={layer.shown.url} shown={layer.shown} dim={layer.dim} />
    </div>
  );
}

/** 字幕框、按鈕和主體框之間留的距離。 */
const AVOID_GAP = 12;
/** 放到主體旁邊時字幕框至少要這麼寬，不然改放到主體上面。 */
const SIDE_MIN = 320;

type Box = { l: number; t: number; r: number; b: number };

/** 這張底圖的主體方框（plates.json subjects），換成現在視窗裡的座標；沒有主體或圖還沒擺好回傳空的。 */
export function subjectRects(shown: Shown | null): Box[] {
  const subjects = shown?.plate.subjects?.[shown.phone ? 'phone' : 'desktop'];
  const host = document.querySelector('.plate-host .plate-stage');
  if (!subjects?.length || !host) return [];
  const stage = host.getBoundingClientRect();
  return subjects.map((x) => ({
    l: stage.left + x.box[0] * stage.width,
    t: stage.top + x.box[1] * stage.height,
    r: stage.left + x.box[2] * stage.width,
    b: stage.top + x.box[3] * stage.height,
  }));
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
  Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
/**
 * 主體框 a 看不到的比例：跑出視窗的部分，加上被每一個介面框蓋住的部分（介面框彼此不重疊；重疊時算多了，偏嚴）。
 * e2e/cold-open-plate.spec.ts 用同一個算法驗收。
 */
export const hiddenShare = (a: Box, ui: Box[], view: Box) => {
  const area = Math.max(1, (a.r - a.l) * (a.b - a.t));
  const seen: Box = {
    l: Math.max(a.l, view.l),
    t: Math.max(a.t, view.t),
    r: Math.min(a.r, view.r),
    b: Math.min(a.b, view.b),
  };
  const vis = overlap(a, view) - ui.reduce((n, u) => n + overlap(seen, u), 0);
  return 1 - Math.max(0, vis) / area;
};

/**
 * 字幕框和按鈕避開圖上的主體（獎盃、手指、手；設計師 #316 審查 1），再盡量不蓋亮處（門縫光；設計師 e771fcf 舊問題裁定 2）。
 * 圖已經照 focus／anchor 先擺過了。依序試幾個位置，主體不蓋（cover 以內）的才算數，挑蓋亮處最少的；一樣少取先試的：
 * 1. 原位；2. 整組移到主體右邊（還在下三分之一，字幕卡不准因此變高）；3. 整組抬到主體上面；
 * 4. 抬到主體上面、再移到亮處右邊；5. 抬到主體上面、只用亮處左邊那一段寬度。4、5 的寬度至少 SIDE_MIN。
 * 直接改 DOM 的屬性（不經過 React 的 state），量、決定、套用在同一個畫格裡，不會先蓋上去再跳開。
 */
export function useAvoidSubjects(
  shown: Shown | null,
  token: unknown,
): RefObject<HTMLElement | null> {
  const main = useRef<HTMLElement>(null);
  const variant = shown?.phone ? 'phone' : 'desktop';
  const subjects = shown?.plate.subjects?.[variant];
  const soft = shown?.plate.clear?.[variant];
  // 同一個鏡頭只挑一次位置（設計師裁定 25376da 第 4 項）：記下這張圖、這個視窗大小、這個字級挑到第幾個位置，換卡直接套用。
  const picked = useRef<{ key: string; best: number } | null>(null);
  const url = shown?.url;
  useLayoutEffect(() => {
    const el = main.current;
    if (!el || !subjects?.length) return;
    const rect = (e: Element): Box => {
      const r = e.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const reset = () => {
      delete el.dataset.avoid;
      delete el.dataset.shift;
      el.style.removeProperty('--avoid-left');
      el.style.removeProperty('--avoid-width');
      el.style.removeProperty('--avoid-pad');
    };
    const run = () => {
      reset();
      const host = document.querySelector('.plate-host .plate-stage');
      if (!host) return;
      const stage = host.getBoundingClientRect();
      const view: Box = { l: 0, t: 0, r: innerWidth, b: innerHeight };
      const place = (x: Subject) => ({
        cover: x.cover,
        r: {
          l: stage.left + x.box[0] * stage.width,
          t: stage.top + x.box[1] * stage.height,
          r: stage.left + x.box[2] * stage.width,
          b: stage.top + x.box[3] * stage.height,
        },
      });
      const boxes = subjects.map(place);
      const lights = (soft ?? []).map(place);
      const ui = () =>
        [...el.querySelectorAll(':scope > .sub-card, :scope > .sub-actions')].map(rect);
      // 主體不蓋，而且字幕卡和按鈕彼此不疊（第二道關卡 25376da 第 1 項：手機橫拿「繼續」壓在字幕上）。
      const clear = () => {
        const u = ui();
        if (u.length > 1 && overlap(u[0], u[1]) > 0.5) return false;
        return boxes.every((x) => hiddenShare(x.r, u, view) <= x.cover + 1e-3);
      };
      // 亮處被介面蓋掉的比例（只算介面，不算跑出視窗的部分）。
      const lit = () => {
        const u = ui();
        return Math.max(
          0,
          ...lights.map(
            (x) =>
              u.reduce((n, b) => n + overlap(x.r, b), 0) /
              Math.max(1, (x.r.r - x.r.l) * (x.r.b - x.r.t)),
          ),
        );
      };
      const ok = (x: number) => lights.every((y) => x <= y.cover + 1e-3);
      const card = el.querySelector<HTMLElement>(':scope > .sub-card');
      const key = `${url}|${innerWidth}x${innerHeight}|${card ? getComputedStyle(card).fontSize : ''}|${document.documentElement.lang}`;
      // 位置只看版面、不看這一張卡有幾行：試的時候字幕卡一律當兩行高（字幕最多兩行），同一句的每一張卡挑到同一個位置，
      // 換卡時字幕不跳（第二道關卡 25376da 第 2 項：1280 英文 150% 第 1 張在獎盃上方、第 2 張跳到右下）。
      if (card) {
        const tx = card.querySelector('.tx') ?? card;
        const cc = getComputedStyle(card);
        const lh = parseFloat(getComputedStyle(tx).lineHeight) || 0;
        const who = card.querySelector('.who')?.getBoundingClientRect().height ?? 0;
        const h =
          2 * lh +
          who +
          parseFloat(cc.paddingTop) +
          parseFloat(cc.paddingBottom) +
          parseFloat(cc.borderTopWidth) +
          parseFloat(cc.borderBottomWidth);
        card.style.minHeight = `${h}px`;
      }
      const cs = getComputedStyle(el);
      const pad0 = parseFloat(cs.paddingBottom);
      const box0 = el.getBoundingClientRect();
      const left = box0.left + parseFloat(cs.paddingLeft);
      const right = box0.right - parseFloat(cs.paddingRight);
      // 抬到主體上面：加大下內距。版面不一定一比一跟著動（最小高度、格線），量了再補，最多三次。
      const lift = () => {
        const top = Math.min(...boxes.map((x) => x.r.t)) - AVOID_GAP;
        el.dataset.avoid = 'above';
        let pad = pad0;
        for (let i = 0; i < 3; i++) {
          const over = Math.max(...ui().map((u) => u.b)) - top;
          if (over <= 0.5) break;
          pad += over;
          el.style.setProperty('--avoid-pad', `${pad}px`);
        }
      };
      const tries: (() => boolean)[] = [
        () => true,
        () => {
          // 主體右邊：場景先放開最大寬度（整個視窗寬），量主體右緣到內容右緣夠不夠寬；移過去字幕卡不准變高。
          el.dataset.avoid = 'side';
          const b = el.getBoundingClientRect();
          const l = b.left + parseFloat(cs.paddingLeft);
          const r = b.right - parseFloat(cs.paddingRight);
          const edge = Math.max(...boxes.map((x) => x.r.r)) + AVOID_GAP;
          if (r - edge < SIDE_MIN) return false;
          el.style.setProperty('--avoid-left', `${edge - l}px`);
          // 窄了放不下兩行也沒關係：字幕卡照實際寬度重新分張（SubCard 量卡寬），每張仍是最多兩行。
          // 但字幕卡本身至少要 SIDE_MIN 寬（手機橫拿時按鈕佔掉右邊一欄，卡會被擠到一百多 px）。
          return (card?.getBoundingClientRect().width ?? 0) >= SIDE_MIN - 1;
        },
        () => {
          lift();
          return true;
        },
        () => {
          if (!lights.length) return false;
          const edge = Math.max(...lights.map((x) => x.r.r)) + AVOID_GAP;
          if (right - edge < SIDE_MIN) return false;
          el.dataset.shift = '';
          el.style.setProperty('--avoid-left', `${edge - left}px`);
          el.style.setProperty('--avoid-width', `${right - edge}px`);
          lift();
          return true;
        },
        () => {
          if (!lights.length) return false;
          const edge = Math.min(...lights.map((x) => x.r.l)) - AVOID_GAP;
          if (edge - left < SIDE_MIN) return false;
          el.dataset.shift = '';
          el.style.setProperty('--avoid-left', '0px');
          el.style.setProperty('--avoid-width', `${edge - left}px`);
          lift();
          return true;
        },
      ];
      const done = picked.current?.key === key;
      let best = done ? picked.current!.best : -1;
      let bestLit = Infinity;
      for (let i = 0; !done && i < tries.length; i++) {
        reset();
        if (!tries[i]() || !clear()) continue;
        const x = lit();
        if (x < bestLit - 1e-3) {
          best = i;
          bestLit = x;
        }
        if (ok(x)) break;
      }
      reset();
      // 都蓋到主體（不該發生）：照舊抬到主體上面。
      if (best < 0) best = 2;
      picked.current = { key, best };
      tries[best]();
      if (card) card.style.removeProperty('min-height');
    };
    run();
    addEventListener('resize', run);
    // 字型載入後重挑一次（行高、卡寬可能變了）。
    void document.fonts?.ready.then(() => {
      picked.current = null;
      run();
    });
    return () => {
      removeEventListener('resize', run);
      reset();
    };
  }, [subjects, soft, token, url]);
  return main;
}
