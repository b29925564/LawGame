import { useT } from '../i18n';
import { useScope } from './lang';
import { useHand, Stamp } from './Marks';
import { useCaseTerms } from './terms';

/**
 * 證物貼紙（設定集第 9 章 <ExhibitSticker>，視覺規格 v2.0 §16）。
 * 一張約 1.6:1 的標籤（128×80），四個欄位：類別（印刷）、編號（盧卡斯鉛筆寫在印好的線上）、案號（印刷）、日期（印好的空線）。
 * 辯方 --exhibit-def（＝--hl）、檢方 --exhibit-state 藍＋左上 6px 斜切；3px 圓角。
 * 先鉛筆寫「供辨識」；法官准了就劃一條鉛筆線，蓋 --stamp 靛藍「已採納」章，日期欄跟著章填上。
 * 完整貼紙就是那一格唯一的黃（useHand('sticker')：主按鈕降級、其他黃退成鉛筆）；
 * chip 是證據欄裡的索引：只留編號和狀態，實線外框，不填黃。
 * 貼上去的動作用 --dur-sticker，不彈、不震；減少動態時直接出現。
 */
export function ExhibitSticker({
  no,
  side = 'def',
  admitted = false,
  date,
  chip = false,
  still = false,
}: {
  /** 手寫編號：1、2、3（不用圈起來的數字：圓只給機器與機構）。 */
  no: string;
  side?: 'def' | 'state';
  /** false＝供辨識；true＝劃掉＋已採納章。 */
  admitted?: boolean;
  /** 裁定日期（MM/DD/YYYY），蓋「已採納」章時填上；劇本沒給就不印。 */
  date?: string;
  /** 證據欄的索引：編號＋狀態，外框、不填黃。 */
  chip?: boolean;
  /** 早就貼好的（重新載入、翻回上一頁）：不跑貼上去的動畫。 */
  still?: boolean;
}) {
  const t = useT();
  const scope = useScope();
  const { caseNo } = useCaseTerms();
  useHand('sticker', !chip && side === 'def');
  const cat = t(side === 'def' ? '辯方證物' : '檢方證物', scope);
  const status = t(admitted ? '已採納' : '供辨識', scope);
  const label = `${cat} ${no}，${status}`;
  const note = (
    <span className="xs-st" data-admitted={admitted || undefined}>
      {t('供辨識', scope)}
    </span>
  );
  if (chip)
    return (
      <span
        className={['xs-chip', !still && 'enter'].filter(Boolean).join(' ')}
        role="img"
        aria-label={label}
      >
        <span className="xs-no" aria-hidden>
          {no}
        </span>
        <span className="xs-st" aria-hidden data-admitted={admitted || undefined}>
          {t('供辨識', scope)}
        </span>
      </span>
    );
  return (
    <span className="xs-set" role="img" aria-label={date && admitted ? `${label} ${date}` : label}>
      <span
        className={['xs', side, admitted && 'admitted', !still && 'enter']
          .filter(Boolean)
          .join(' ')}
        aria-hidden
      >
        <span className="xs-cat">{cat}</span>
        <span className="xs-row">
          <i>{t('編號')}</i>
          <span className="xs-no">{no}</span>
          {note}
        </span>
        <span className="xs-case">{caseNo.replace(/^No\.\s*/, '')}</span>
        <span className="xs-row xs-date">
          <i>{t('日期／DATE')}</i>
          <span className="xs-dv" />
        </span>
      </span>
      {admitted && <Stamp text="已採納" date={date} still={still} />}
    </span>
  );
}
