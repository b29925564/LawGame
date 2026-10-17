import { createContext, useContext, useEffect, useState } from 'react';
import { useLang, type Lang } from '../i18n';
import plateData from './plates/plates.json';
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
const loading = new Map<string, Promise<State>>();

/** 載好並解碼；同一張只做一次。圖壞掉算 fail（不記住，下次再試）。 */
export function warmPlate(url: string): Promise<State> {
  const known = settled.get(url);
  if (known) return Promise.resolve(known);
  let p = loading.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    const done = img.decode
      ? img.decode()
      : new Promise<void>((ok, no) => {
          img.onload = () => ok();
          img.onerror = () => no(new Error('img'));
        });
    p = done.then(
      () => {
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

export type Shown = { plate: Plate; url: string; state: State };

/** 照螢幕挑那一版，等它解碼完。已經解碼過的第一個畫面就是 ok，不閃黑。 */
export function useShown(plate: Plate | null): Shown | null {
  const phone = usePhone();
  const url = plate ? (phone ? plate.phone : plate.desktop) : '';
  const [got, setGot] = useState<{ url: string; state: State }>();
  useEffect(() => {
    if (!url || settled.has(url)) return;
    let live = true;
    const stop = setTimeout(() => live && setGot({ url, state: 'fail' }), GIVE_UP);
    void warmPlate(url).then((state) => {
      clearTimeout(stop);
      if (live) setGot({ url, state });
    });
    return () => {
      live = false;
      clearTimeout(stop);
    };
  }, [url]);
  if (!plate) return null;
  const state = settled.get(url) ?? (got?.url === url ? got.state : 'wait');
  return state === 'fail' ? null : { plate, url, state };
}

/**
 * 底圖層：釘在視窗後面，圖沒好以前是純黑。圖不放在介面前面，介面（台詞框、按鈕）自己讓出上半部。
 * 燈組與色溫寫在 data 上（驗收截圖與 e2e 讀它，不讀圖檔）。
 */
export function ScenePlate({ shown }: { shown: Shown }) {
  const { plate, url, state } = shown;
  return (
    <div
      className="scene-plate"
      data-plate={plate.id}
      data-rig={plate.rig}
      data-kelvin={plate.kelvin}
      data-state={state}
      aria-hidden
    >
      <img src={url} alt="" decoding="async" draggable={false} />
    </div>
  );
}

/**
 * 這一場有底圖在背後：畫外字幕（VoiceOver）改走鏡頭層的版本（data-layer='scene'）——圖只壓暗到 58%、字用鏡頭層的白，
 * 不用整頁的紙色／墨色把圖蓋掉。
 */
export const OnPlate = createContext(false);
export const useOnPlate = () => useContext(OnPlate);
