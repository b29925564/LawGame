import { useT } from '../i18n';

type Lean = { all?: number; leans?: Partial<Record<string, number>> };

/** 理論把陪審團一開始推多遠，分成三格（UX 規格 decision-cost §二）：<10 一格、10–24 兩格、≥25 三格。 */
export function juryBars(j: Lean | undefined) {
  const all = j?.all ?? 0;
  return all >= 25 ? 3 : all >= 10 ? 2 : 1;
}

/**
 * 陪審團起點：三格條＋最多一行補充。不顯示內部數字。
 * 理論卡和結辯頭部共用，玩家在兩處看到同一種圖示，才連得起來。
 */
export function JuryStart({ jury, civil }: { jury: Lean | undefined; civil: boolean }) {
  const t = useT();
  if (!jury) return null;
  const n = juryBars(jury);
  const leans = Object.keys(jury.leans ?? {});
  const toward = civil ? t('判你方有責') : t('判你方有罪');
  return (
    <div className="jury-start">
      <span className="jury-start-key">{t('陪審團起點')}</span>
      <span
        className="bars"
        role="img"
        aria-label={t('一開始就偏向{toward}：{n} / 3', { toward, n })}
      >
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= n ? 'bar on' : 'bar'} />
        ))}
      </span>
      {leans.length > 0 && (
        <span className="jury-start-note">
          {t('{tags}取向的陪審員反彈', { tags: leans.map((x) => t(x)).join('、') })}
        </span>
      )}
    </div>
  );
}
