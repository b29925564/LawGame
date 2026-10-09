import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { castLook } from './cast';
import { svg } from './silhouette';
import { Tbd } from './Tbd';

/** 在法庭畫面裡：說話者頭像換成剪影替身（P4-2）。桌上、訪談、取證照舊。 */
const InCourt = createContext(false);

export function CourtCast({ children }: { children: ReactNode }) {
  return <InCourt.Provider value>{children}</InCourt.Provider>;
}

export const useInCourt = () => useContext(InCourt);

/**
 * 剪影頭像：J1、受光 85（說話者不吃陪審團的心證曝光，第 1 章「說話者下限」），
 * 虛線框＋框外上方「待放 AI 立繪\u3000{全名}」永遠可見（第 7.6 章、第 7 章 :9）。對不到人就不畫。
 */
export function CourtFace({ who }: { who: string }) {
  const t = useT();
  const look = castLook(who);
  const html = useMemo(
    () => (look ? svg(look, { v: 85, pose: 'J1', frame: true, uid: `face-${look.id}` }) : ''),
    [look],
  );
  if (!look) return null;
  return (
    <Tbd name={t(who)}>
      <span className="portrait sil" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
    </Tbd>
  );
}
