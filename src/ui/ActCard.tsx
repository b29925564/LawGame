import type { CSSProperties, ReactNode } from 'react';
import { useLang, useT } from '../i18n';
import { useCaseTerms } from './terms';
import './actcard.css';

export type Headline = { kicker: string; title: string; day?: string };

const CJK = /[㐀-鿿]/;

/**
 * 卡的標題切成幕序與幕名（設定集 11.3）。中文以全形空白切，英文照「Act Four: Trial, Day One」切。
 * 幕卡：「第四幕 庭審 第一天」→ 幕序「第四幕」、幕名「庭審」，「第一天」放到場記右欄。
 * 日卡（同一幕的第二張以後）：幕序降成「庭審」、幕名換成「第二天」。
 */
export function splitHeadline(text: string, mode: 'act' | 'day' = 'act'): Headline {
  let parts: string[];
  if (CJK.test(text)) parts = text.split('\u3000').filter(Boolean);
  else {
    const colon = text.indexOf(': ');
    parts = colon < 0 ? [text] : [text.slice(0, colon), ...text.slice(colon + 2).split(', ')];
  }
  if (parts.length === 1) return { kicker: '', title: parts[0] };
  if (mode === 'day' && parts.length >= 3)
    return { kicker: parts[parts.length - 2], title: parts[parts.length - 1] };
  return { kicker: parts[0], title: parts[1], day: parts[2] };
}

/** 幕序字距：「第四幕」寫成「第 四 幕」（四個字以內的中文才拉開）。 */
export function spaced(kicker: string) {
  const chars = [...kicker];
  return CJK.test(kicker) && chars.length <= 4 && !kicker.includes('\u3000')
    ? chars.join('\u3000')
    : kicker;
}

/** 場記：地點在左，日子與時刻在右（「惠特洛克的辦公室 週一 09:00」）。 */
export function splitSlate(place: string): [string, string] {
  const zh = /^(.*)\u3000((?:週|第.天|隔天|一週後|兩週後|\d{1,2}:\d{2}).*)$/.exec(place);
  if (zh) return [zh[1], zh[2]];
  const en = /^(.*?)[.,] ((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Day|The next|One week|Two weeks).*)$/.exec(
    place,
  );
  if (en) return [en[1], en[2]];
  return [place, ''];
}

/**
 * 地點的色溫（設定集 1、3 章：色溫只表示時間與地盤）。法院、看守所、走廊是機構燈管 4100K；
 * 律所白天是燈管、入夜是檯燈 2700K；檢察署是窗光 7000K；碼頭陰天 6500K。
 * 法庭依開庭日走燈組：第二天下午西窗 4800K、第三天陰天 6500K。
 */
export function kelvinOf(place: string, day?: string) {
  const hour = Number(/(\d{1,2}):\d{2}/.exec(place)?.[1] ?? 12);
  if (/法院|法庭|Court/.test(place)) {
    if (day && /第二|Two/.test(day)) return 4800;
    if (day && /第三|Three/.test(day)) return 6500;
    return 4100;
  }
  if (/看守所|Jail|Detention/.test(place)) return 4100;
  if (/檢察|District Attorney/.test(place)) return 7000;
  if (/港|碼頭|Harbor|Port|Dock/.test(place)) return 6500;
  if (/深夜|晚上|[Nn]ight|[Ee]vening/.test(place)) return 2700;
  return hour >= 19 || hour < 6 ? 2700 : 4100;
}

/**
 * 幕卡（設定集 11.3 RD-ART-1103A）：一份訴狀的案件標題欄，被一根燈管照著。2.35:1 黑底，卡寬窄於 900px 切 9:16。
 * 進場：燈管兩次脈衝 900ms，接著黑條每 83ms 抽走一條（標題欄前三行 → 後兩行 → 案號 → 幕序 → 幕名 → 場記左 → 場記右）。
 * 減少動態：整張卡 120ms 淡入、沒有黑條；光敏安全：燈管改單次 700ms 漸亮。
 * 卡下方的旁白與「繼續」不在卡裡：卡是鏡頭，按鈕是玩家的手。
 */
export function ActCard({
  headline,
  place,
  bates,
  lines,
  children,
}: {
  headline: Headline;
  /** 場記（已翻譯）：地點與日子、時刻。 */
  place?: string;
  bates: string;
  lines?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const en = useLang((s) => s.lang) === 'en';
  const { plaintiff, defendant, caseNo } = useCaseTerms();
  const [where, when] = place ? splitSlate(place) : ['', ''];
  // 日卡的「第二天」是大字，場記右欄不再寫，但色溫照那一天的燈組。
  const k = place ? kelvinOf(place, headline.day ?? headline.title) : undefined;
  const right = [headline.day, when, k && `${k}K`].filter(Boolean).join(en ? '  ' : '\u3000');
  const d = (n: number) => ({ '--d': n }) as CSSProperties;
  const [comma, stop] = en ? [',', '.'] : ['，', '。'];
  // 案件標題欄五行：當事人、身分（縮排）、「訴」；黑條前三行一起抽、後兩行一起抽。
  const rows: [string, boolean, number][] = [
    [t(plaintiff) + comma, false, 0],
    [t('原告', 'caption') + comma, true, 0],
    [t('訴', 'caption') + (en ? '' : comma), false, 0],
    [t(defendant) + comma, false, 1],
    [t('被告', 'caption') + stop, true, 1],
  ];
  return (
    <main className="scene title-card act-stage">
      <div className="act-wrap">
        <section className="act-card" aria-label={[headline.kicker, headline.title].join(' ')}>
          <span className="act-tube" aria-hidden />
          <span className="act-cone" aria-hidden />
          <div className="act-caption" aria-hidden>
            {rows.map(([text, indent, bar], i) => (
              <span
                key={i}
                className={indent ? 'act-l act-i' : 'act-l'}
                style={{ gridRow: i + 1, gridColumn: 1 }}
              >
                <span className="rd" style={d(bar)}>
                  {text}
                </span>
              </span>
            ))}
            {rows.map((_, i) => (
              <span key={i} className="act-p" style={{ gridRow: i + 1, gridColumn: 2 }}>
                {en ? ')' : '）'}
              </span>
            ))}
            <span className="act-no">
              <span className="rd" style={d(2)}>
                <i>{t('案號', 'caption')}</i>
                {caseNo.replace(/^No\.\s*/, '')}
              </span>
            </span>
          </div>
          <div className="act-head">
            {headline.kicker && (
              <p className="act-kick">
                <span className="rd" style={d(4)}>
                  {spaced(headline.kicker)}
                </span>
              </p>
            )}
            <h1 className="act-title">
              <span className="rd" style={d(5)}>
                <span
                  className="act-big"
                  style={{ '--n': [...headline.title].length } as CSSProperties}
                >
                  {headline.title}
                </span>
              </span>
            </h1>
          </div>
          {(where || right) && (
            <p className="act-slate">
              <span className="rd" style={d(6)}>
                {where}
              </span>
              {right && (
                <span className="rd" style={d(7)}>
                  <b>{right}</b>
                </span>
              )}
            </p>
          )}
          <span className="act-bates" aria-hidden>
            {bates}
          </span>
        </section>
      </div>
      {lines && <div className="act-lines">{lines}</div>}
      <div className="act-actions">{children}</div>
    </main>
  );
}

/**
 * 地點字卡（設定集 11.3）：換地點但沒有幕卡時，鏡頭左下一行場記，前面一段 14×2 的黃短槓。
 * 淡入 180ms、停 2.5 秒、淡出 180ms；不擋操作，讀屏照常唸。
 */
export function PlaceSlate({ place, kelvin }: { place: string; kelvin: number }) {
  const en = useLang((s) => s.lang) === 'en';
  const [where, when] = splitSlate(place);
  const sep = en ? '  ' : '\u3000';
  const text = [where, when, `${kelvin}K`].filter(Boolean).join(sep);
  return (
    <p className="place-slate" role="status">
      {text}
    </p>
  );
}
