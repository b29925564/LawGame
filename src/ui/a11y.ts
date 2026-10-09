import { create } from 'zustand';

/**
 * 兩個獨立的輔助開關（設定集 10.6）：打開一個不會順便打開另一個。
 * 只怕閃的人可以保留完整的動態；只怕晃的人燈管照樣脈衝。
 */

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // 不能存就只在這一次有效。
  }
}

/**
 * 開關一：光敏安全。拿掉一切閃爍：燈管兩次脈衝改成單次漸亮、耐心歸零的「閃兩下」改漸暗；
 * 硬切保留但不帶白幀。存取照 11.3：localStorage['rd.a11y.photosafe']（'1'／'0'），
 * 啟動時同步到 <html data-photosafe>；網址 ?photosafe=1 只在這一頁暫時開啟，不寫進設定。
 * CSS 一律讀 html[data-photosafe='1']。
 */
const PHOTOSAFE = 'rd.a11y.photosafe';

function fromUrl() {
  try {
    return new URLSearchParams(location.search).get('photosafe') === '1';
  } catch {
    return false;
  }
}

function applyPhotosafe(on: boolean) {
  document.documentElement.dataset.photosafe = on ? '1' : '0';
}

export const usePhotosafe = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: read(PHOTOSAFE) === '1' || fromUrl(),
  setOn: (on) => {
    write(PHOTOSAFE, on);
    applyPhotosafe(on);
    set({ on });
  },
}));

/**
 * 開關二：減少動態。位移、縮放、推鏡全部改成 --dur-rm 120ms 透明度淡入或直接切；黑條與章直接出現。
 * 預設跟隨系統的 prefers-reduced-motion；玩家在選項頁設定後存 localStorage['rd.a11y.reducedmotion']
 * （'1'／'0'），同步到 <html data-reduced-motion>。沒設定過就不寫這個屬性，一切照系統。
 * 樣式照舊寫 @media (prefers-reduced-motion: …)，建置時改寫成兩個來源都認（vite.config.ts 的 reducedMotionCss）。
 * 程式裡要判斷的地方一律呼叫 reducedMotion()，不要自己問 matchMedia。
 */
const MOTION = 'rd.a11y.reducedmotion';
const QUERY = '(prefers-reduced-motion: reduce)';

function chosen() {
  const v = read(MOTION);
  return v === '1' ? true : v === '0' ? false : null;
}

function system() {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

function applyMotion(on: boolean | null) {
  const html = document.documentElement;
  if (on === null) delete html.dataset.reducedMotion;
  else html.dataset.reducedMotion = on ? '1' : '0';
}

type Motion = { chosen: boolean | null; system: boolean; setOn: (on: boolean) => void };

const useMotion = create<Motion>((set) => ({
  chosen: chosen(),
  system: system(),
  setOn: (on) => {
    write(MOTION, on);
    applyMotion(on);
    set({ chosen: on });
  },
}));

/** 選項頁用：目前是否減少動態（玩家設定優先，沒設定就照系統）與切換。 */
export function useReducedMotion() {
  const on = useMotion((s) => s.chosen ?? s.system);
  const setOn = useMotion((s) => s.setOn);
  return { on, setOn };
}

/** 程式裡判斷要不要減少動態：玩家設定優先，沒設定就照系統。 */
export function reducedMotion() {
  const s = useMotion.getState();
  return s.chosen ?? s.system;
}

/** 介面權杖 --dur-ui（180ms），從樣式表讀，JS 補間和 CSS 用同一個時長。 */
export function durUi() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-ui'));
  return Number.isFinite(v) ? v : 180;
}

/** 啟動時呼叫一次，在第一格畫面之前：幕卡的燈管一進場就要讀到這兩個屬性。 */
export function restoreA11y() {
  applyPhotosafe(usePhotosafe.getState().on);
  applyMotion(useMotion.getState().chosen);
  if (typeof matchMedia === 'function') {
    // 沒設定過的玩家中途改了系統設定，跟著變。
    matchMedia(QUERY).addEventListener('change', (e) => useMotion.setState({ system: e.matches }));
  }
}
