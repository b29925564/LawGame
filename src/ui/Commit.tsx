import type { ReactNode } from 'react';
import { useT } from '../i18n';

/**
 * 定案列：不可逆的決定都用這一種（UX 決策代價規格三）。你選了什麼、🔒 選了就不能改、代價，
 * 然後一顆深底金邊的定案鈕，文字寫動作本身。
 */
export function CommitBar({
  what,
  cost,
  action,
  onCommit,
  detail,
}: {
  what: string;
  cost: string;
  action: string;
  onCommit: () => void;
  /** 代價的逐條清單（EffectLines），放在一句話代價底下。 */
  detail?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="commit-bar" role="group" aria-label={t('定案')}>
      <p className="commit-what">
        <strong>{what}</strong>
        <span className="muted small">🔒 {t('選了就不能改')}</span>
      </p>
      <p className="commit-cost small">{cost}</p>
      {detail && <div className="commit-detail">{detail}</div>}
      <button className="commit" onClick={onCommit}>
        <span aria-hidden>🔒 </span>
        {action}
      </button>
    </div>
  );
}
