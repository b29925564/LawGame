import { useT } from '../i18n';
import { useScope } from './lang';
import { Stamp } from './Marks';

/**
 * 證物貼紙（設定集第 9 章 <ExhibitSticker>，視覺規格 v2.0 §16）。
 * 辯方 --exhibit-def（＝--hl）、檢方 --exhibit-state 藍＋左上 6px 斜切；3px 圓角。
 * 先鉛筆寫「供辨識」，法官准了才劃掉並蓋「已採納」章（--stamp 靛藍，永不紅）。
 * 編號是盧卡斯的鉛筆字（--font-hand、--pencil）；貼上去的動作用 --dur-sticker，不彈、不震。
 */
export function ExhibitSticker({
  no,
  side = 'def',
  admitted = false,
  still = false,
}: {
  /** 手寫編號：①②③。 */
  no: string;
  side?: 'def' | 'state';
  /** false＝供辨識；true＝劃掉＋已採納章。 */
  admitted?: boolean;
  /** 早就貼好的（重新載入、翻回上一頁）：不跑貼上去的動畫。 */
  still?: boolean;
}) {
  const t = useT();
  const scope = useScope();
  const cat = t(side === 'def' ? '辯方證物' : '檢方證物', scope);
  const status = t(admitted ? '已採納' : '供辨識', scope);
  return (
    <span className="xs-set" role="img" aria-label={`${cat} ${no}，${status}`}>
      <span
        className={['xs', side, admitted && 'admitted', !still && 'enter']
          .filter(Boolean)
          .join(' ')}
        aria-hidden
      >
        <span className="xs-cat">{cat}</span>
        <span className="xs-no">{no}</span>
        {admitted ? (
          <s className="xs-st">{t('供辨識', scope)}</s>
        ) : (
          <span className="xs-st">{t('供辨識', scope)}</span>
        )}
      </span>
      {/* 章壓在貼紙右緣，大半印在紙上（中英文章面寬度不同，所以放進同一排，不寫死位置）。 */}
      {admitted && <Stamp text="已採納" sm still={still} />}
    </span>
  );
}
