import type { ReactNode } from 'react';
import { useT } from '../../i18n';

/**
 * 「待放 AI 立繪」標籤（設定集第 7 章 :9「待放 AI 立繪　{角色名}」、第 5 章 0502）：放在框外上方，
 * 細引線連回空框，不寫在框裡、不壓在姿勢層上。
 * - 單一人物的框（說話者、遴選人物卡、陪審團長）給 name：全名照寫不截字，放不下就換到第二行。
 * - 成排的小卡（陪審席、遴選名單）每張只畫虛線框，整排一個 row 標籤「待放 AI 立繪　陪審員」連到整排的外框。
 */
export function Tbd({
  name,
  row = false,
  bare = false,
  children,
}: {
  name?: string;
  row?: boolean;
  /** 整排已經在一個面板裡（遴選名單、陪審席方塊）：面板就是外框，不再加一圈。 */
  bare?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const label = (
    <span className="tbd-label" aria-hidden>
      <span>{t('待放 AI 立繪')}</span>
      <span>{name ?? t('陪審員')}</span>
    </span>
  );
  return row ? (
    <div className={bare ? 'tbd row bare' : 'tbd row'}>
      {label}
      {children}
    </div>
  ) : (
    <span className="tbd">
      {label}
      {children}
    </span>
  );
}
