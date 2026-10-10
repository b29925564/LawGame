import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useT } from '../../i18n';
import { reducedMotion } from '../a11y';
import { beatsOf, landingAt, LANDING, readTokens, type Verdict } from './verdictBeats';

export type Phase = 'form' | 'cut' | 'record' | 'card' | 'cut2' | 'light' | 'done';

/** 裁決書上現場寫的最後一筆（讀 pen() 排進 style 的 CSS 變數）：字數、提筆次數、有沒有寫。 */
function handEnd(root: Element) {
  let u = 0;
  let k = -1;
  root.querySelectorAll<HTMLElement>('.hw, .hw-chk').forEach((el) => {
    const s = (el as HTMLElement | SVGElement).style;
    const at = parseFloat(s.getPropertyValue('--at')) || 0;
    const w = parseFloat(s.getPropertyValue('--u')) || 0;
    u = Math.max(u, at + w);
    k = Math.max(k, parseFloat(s.getPropertyValue('--k')) || 0);
  });
  return { u, lifts: Math.max(0, k), any: k >= 0 };
}

/**
 * 判決四拍的導演（設定集 10.5）：裁決書手寫 → 切黑 → 筆錄頁黑條 → 黑底字卡 → 窗光 → 才出現結論帶與評議欄。
 * 時間來自 beatsOf（權杖拼出來）；減少動態時沒有四拍，直接到最後；點一下、按鍵（Tab 除外）、Esc 跳到最後。
 */
export function useVerdictRun(v: Verdict, root: React.RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<Phase>(() => (reducedMotion() ? 'done' : 'form'));
  const [pull, setPull] = useState(false);
  const [recover, setRecover] = useState(false);
  const [landed, setLanded] = useState(false);
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = [];
  };
  const skip = useCallback(() => {
    clear();
    setPhase('done');
  }, []);

  useLayoutEffect(() => {
    if (phase !== 'form' || !root.current) return;
    const b = beatsOf(v, handEnd(root.current), readTokens());
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    at(b.black, () => setPhase('cut'));
    at(b.record, () => setPhase('record'));
    at(b.pull, () => setPull(true));
    if (b.recover) at(b.recover[0], () => setRecover(true));
    at(b.card[0], () => setPhase('card'));
    at(b.card[1], () => setPhase('cut2'));
    at(b.light, () => setPhase('light'));
    at(b.lightLanded, () => setLanded(true));
    at(b.done, () => setPhase('done'));
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'done') return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.metaKey || e.ctrlKey || e.altKey) return;
      skip();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase, skip]);

  return { phase, pull, recover, landed, skip };
}

/**
 * 判決的鏡頭（黑底，蓋住整個畫面）：筆錄頁、字卡、窗光三種畫面輪流。
 * 筆錄頁的黑條照結果停：無罪抽完、有罪抽完後被告姓名那一行再蓋上、僵局卡在 6/12；
 * 字卡三種結果同字級同停留（--dur-turn），不配音效；窗光落點由結果決定，移動用 --dur-lightmove。
 * 窗光是 3D 機位的位置：算圖來之前用示意畫面占位（標「待放 3D 機位」），光柱、落點、地圖照設定集座標。
 */
export function VerdictStage({
  v,
  word,
  run,
  line,
  defendant,
}: {
  v: Verdict;
  /** 字卡與筆錄上的結果字（已翻譯）。 */
  word: string;
  run: ReturnType<typeof useVerdictRun>;
  /** 筆錄第 21 行：「就第一項罪名，被告」。 */
  line: string;
  /** 被告姓名（筆錄第 22 行）。 */
  defendant: string;
}) {
  const t = useT();
  const { phase, pull, recover, landed, skip } = run;
  if (phase === 'form' || phase === 'done') return null;
  const at = landed || v === '無罪' ? landingAt(v) : landingAt('無罪');
  const style = { '--stop': LANDING[v].n } as CSSProperties;
  return (
    <>
      <div className="vstage" data-phase={phase} data-verdict={v} style={style} aria-hidden>
        {phase === 'record' && (
          <section className="vs-page">
            <p className="vs-head">{t('審判筆錄')}</p>
            <p className="vs-row" data-n="19">
              {t('法官', 'record')}
              {t('：', 'record')}
              {t('陪審團是否已經作出裁決？')}
            </p>
            <p className="vs-row" data-n="20">
              {t('陪審長')}
              {t('：', 'record')}
              {t('是的，庭上。')}
            </p>
            <p className="vs-row" data-n="21">
              {line}
              <span
                className="vs-res"
                data-pull={pull || undefined}
                data-stop={v === '陪審團僵局' ? 6 : 12}
              >
                <span className="vs-word">{word}</span>
                <span className="vs-bar" />
              </span>
            </p>
            <p className="vs-row" data-n="22">
              <span className="vs-name" data-cover={recover || undefined}>
                {defendant}
                <span className="vs-bar" />
              </span>
            </p>
          </section>
        )}
        {phase === 'card' && <p className="vs-card">{word}</p>}
        {phase === 'light' && (
          <div className="vs-light">
            <span className="vs-tbd">
              {t('待放 3D 機位')} {t('判決')}
            </span>
            <div className="vs-frame">
              <span className="vs-table" data-side="defense" />
              <span className="vs-table" data-side="state" />
              <span className="vs-shaft" style={{ '--x': at } as CSSProperties} />
            </div>
            <div className="vs-map">
              <span className="vs-table" data-side="defense" />
              <span className="vs-table" data-side="state" />
              <span className="vs-dot" style={{ '--x': at } as CSSProperties} />
            </div>
          </div>
        )}
      </div>
      <button type="button" className="vstage-skip" onClick={skip}>
        {t('略過')}
      </button>
    </>
  );
}
