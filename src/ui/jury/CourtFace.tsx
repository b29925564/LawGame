import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { castLook } from './cast';
import { svg } from './silhouette';

/** 在法庭畫面裡：說話者頭像換成剪影替身（P4-2）。桌上、訪談、取證照舊。 */
const InCourt = createContext(false);

export function CourtCast({ children }: { children: ReactNode }) {
  return <InCourt.Provider value>{children}</InCourt.Provider>;
}

export const useInCourt = () => useContext(InCourt);

/**
 * 剪影頭像：J1、受光 85（說話者不吃陪審團的心證曝光，第 1 章「說話者下限」），
 * 剪影就是定稿：不加標籤、不加虛線框（使用者 11-16）。名字由旁邊的說話者名字寫，這裡只畫剪影。對不到人就不畫。
 */
export function CourtFace({ who }: { who: string }) {
  const look = castLook(who);
  const html = useMemo(
    () => (look ? svg(look, { v: 85, pose: 'J1', uid: `face-${look.id}` }) : ''),
    [look],
  );
  if (!look) return null;
  return <span className="portrait sil" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}
