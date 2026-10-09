import { create } from 'zustand';

/**
 * 光敏安全（設定集 10.6，開關一）：拿掉一切閃爍。燈管兩次脈衝改成單次漸亮、耐心歸零的「閃兩下」改漸暗；
 * 硬切保留但不帶白幀。和「減少動態」是兩個獨立開關，打開一個不會順便打開另一個。
 * 存取照 11.3：localStorage['rd.a11y.photosafe']（'1'／'0'），啟動時同步到 <html data-photosafe>；
 * 網址 ?photosafe=1 只在這一頁暫時開啟，不寫進設定。CSS 一律讀 html[data-photosafe='1']。
 */
const KEY = 'rd.a11y.photosafe';

function stored() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function fromUrl() {
  try {
    return new URLSearchParams(location.search).get('photosafe') === '1';
  } catch {
    return false;
  }
}

function apply(on: boolean) {
  document.documentElement.dataset.photosafe = on ? '1' : '0';
}

export const usePhotosafe = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: stored() || fromUrl(),
  setOn: (on) => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // 不能存就只在這一次有效。
    }
    apply(on);
    set({ on });
  },
}));

/** 啟動時呼叫一次，在第一格畫面之前：幕卡的燈管一進場就要讀到這個屬性。 */
export function restorePhotosafe() {
  apply(usePhotosafe.getState().on);
}
