import { create } from 'zustand';

/** 法庭光層試做（場景光影串的規格）：關鍵格相對門檻的位置，由暗到亮。 */
export const KEYS = [40, 55, 70, 80] as const;
const OFF = [-30, -15, 0, 10];

/** 每張關鍵格的不透明度：最底下那張永遠不透明，其餘只在自己的區間淡入。 */
export function opacities(avg: number, threshold: number): number[] {
  const k = OFF.map((o) => threshold + o);
  return k.map((_, i) =>
    i === 0 ? 1 : Math.min(1, Math.max(0, (avg - k[i - 1]) / (k[i] - k[i - 1]))),
  );
}

/** 被上面完全不透明的層蓋住的就不用合成。 */
export function hidden(op: number[]): boolean[] {
  return op.map((_, i) => op.slice(i + 1).some((o) => o >= 1));
}

const KEY = 'lawgame-court-light';

function stored() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** 試做開關：只存在這個瀏覽器，預設關。 */
export const useCourtLight = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: stored(),
  setOn: (on) => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // 不能存就只在這一次有效。
    }
    set({ on });
  },
}));
