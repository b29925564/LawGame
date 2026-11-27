import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { castLook } from './cast';
import { svg } from './silhouette';

/** 在法庭畫面裡（P4-2）。頭像在法庭內外都是同一張剪影（#446）；這個 context 現在只管法庭對白的排字。 */
const InCourt = createContext(false);

export function CourtCast({ children }: { children: ReactNode }) {
  return <InCourt.Provider value>{children}</InCourt.Provider>;
}

export const useInCourt = () => useContext(InCourt);

/**
 * 剪影頭像：J1、受光 85（說話者不吃陪審團的心證曝光，第 1 章「說話者下限」）。法庭內外、桌上、會見、談判一律這張（#446）。
 * 剪影就是定稿：不加標籤、不加虛線框（使用者 11-16）。名字由旁邊的說話者名字寫，這裡只畫剪影。對不到人就不畫。
 */
export function CourtFace({ who, label }: { who: string; label?: string }) {
  const look = castLook(who);
  const html = useMemo(
    () => (look ? svg(look, { v: 85, pose: 'J1', uid: `face-${look.id}` }) : ''),
    [look],
  );
  if (!look) return null;
  // 旁邊沒寫名字的地方（label）：剪影用名字當替代文字（#446 第 6 點）；旁邊有名字就不再念一次。
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  return <span className="portrait sil" {...a11y} dangerouslySetInnerHTML={{ __html: html }} />;
}
