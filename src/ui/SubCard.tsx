import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Line } from '../engine/episode/schema';
import { useSettings } from '../engine/settings';
import { useT } from '../i18n';
import { useScope } from './lang';
import { prose } from './prose';
import { measureOf } from './court/subtitleMeasure';
import { subCards } from './subCards';

/** 字幕框裡放得下的字數：量卡片實際的內寬與字型（桌機 20px、手機 17px 由樣式決定，這裡不另存一份）。 */
interface Fit {
  em: number;
  emRaw: number;
  font: string;
}

/**
 * 底圖上的字幕（art bible 10.1）：下三分之一、最多兩行、一張卡一句，說話者的名字在上（亮字，不用黃）；旁白不掛名字。
 * 一句放不下兩行時拆成幾張，「繼續」先翻完這一句的卡，才往下一句（step 回傳 true 代表只翻了一張）。
 * line 換了（token 變了）從第一張重來；atEnd（正在選擇）停在最後一張。
 */
export function useSubs(line: Line | null, token: number, active: boolean, atEnd = false) {
  const t = useT();
  const scope = useScope();
  const voScale = useSettings((s) => s.voScale);
  const voBox = useSettings((s) => s.voBox);
  const ref = useRef<HTMLParagraphElement>(null);
  const text = line ? t(line.text, scope) : '';
  const [fit, setFit] = useState<Fit | null>(null);
  const [at, setAt] = useState({ token, ix: 0 });
  // 字型載好之前量到的是備用字型的寬度；載好了重算（同一組字型字串，所以要另外給一個記號）。
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const f = document.fonts;
    if (!f) return;
    const bump = () => setFonts((n) => n + 1);
    f.addEventListener('loadingdone', bump);
    return () => f.removeEventListener('loadingdone', bump);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const tx = el.querySelector('.tx') ?? el;
      const cs = getComputedStyle(tx);
      const box = getComputedStyle(el);
      const px = parseFloat(cs.fontSize) || 17;
      const inner = el.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
      const next = {
        // 中文照每字 1em 估，留 5% 餘裕；英文用實際字型量，只扣一點捨入。
        em: Math.max(8, Math.floor((inner / px) * 0.95)),
        emRaw: Math.max(8, Math.floor((inner / px) * 100 - 20) / 100),
        font: `${cs.fontWeight} ${px}px ${cs.fontFamily}`,
      };
      setFit((f) =>
        f && f.em === next.em && f.emRaw === next.emRaw && f.font === next.font ? f : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, voScale, text]);
  const cards = useMemo(() => {
    if (!text) return [];
    if (!fit) return [{ text, from: 0 }];
    const latin = !/\p{Script=Han}/u.test(text);
    return subCards(text, latin ? fit.emRaw : fit.em, latin ? measureOf(fit.font) : undefined);
  }, [text, fit, fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = Math.max(1, cards.length);
  const ix = atEnd ? count - 1 : at.token === token ? Math.min(at.ix, count - 1) : 0;
  const card = cards[ix];
  const node: ReactNode =
    line && card ? (
      <p
        ref={ref}
        className={line.who === '旁白' ? 'sub-card narration' : 'sub-card'}
        data-subbox={voBox ? 'on' : undefined}
        style={{ '--sub-scale': voScale } as React.CSSProperties}
        aria-live="polite"
      >
        {line.who !== '旁白' && <span className="who">{t(line.who)}</span>}
        <span className="tx">
          {card.lines
            ? card.lines.map((l) => (
                <span key={l} className="ln">
                  {prose(l)}
                </span>
              ))
            : prose(card.text)}
        </span>
      </p>
    ) : null;
  /** 還有下一張就翻過去（回傳 true）；這句的最後一張回傳 false，呼叫的人往下一句。 */
  const step = () => {
    if (ix >= count - 1) return false;
    setAt({ token, ix: ix + 1 });
    return true;
  };
  return { node, step, last: ix >= count - 1 };
}

/** 字幕模式的操作列：主要按鈕（繼續／選項）和「筆錄」抽屜鈕。 */
export function SubActions({
  action,
  rec,
  onRec,
}: {
  action: ReactNode;
  rec: boolean;
  onRec: () => void;
}) {
  const t = useT();
  return (
    <div className="sub-actions">
      {action}
      <button className="rec-toggle" aria-expanded={rec} onClick={onRec}>
        {rec ? t('收起筆錄') : t('筆錄')}
      </button>
    </div>
  );
}
