import {
  createContext,
  useContext,
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
};

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
    ? { id: hit.id, rig: scene.rig, kelvin: rig.kelvin, desktop, phone }
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
  const { plate, url, state, phone } = shown;
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
      aria-hidden
    >
      <div
        className="plate-stage"
        style={
          {
            '--ar': `${w} / ${h}`,
            '--f': set?.anchor[variant].at ?? 0.5,
            '--a': set?.anchor[variant].to ?? 0.5,
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
