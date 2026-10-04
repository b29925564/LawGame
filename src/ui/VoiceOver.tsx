import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { Line } from '../engine/episode/schema';
import { useSettings } from '../engine/settings';
import { useT } from '../i18n';
import { useScope } from './lang';
import { announce } from './Marks';
import { voTiming } from './voTiming';

/** 這一輪已經播過的字幕：回到同一畫面時只留筆錄，不再整段重播。 */
const played = new Set<string>();

const beatsOf = (line: Line) =>
  line.beats?.length ? line.beats : [{ text: line.text, hush: false }];
/** 兩邊都是英數標點時，｜拿掉要補一個空格，不然英文句子黏在一起（"him.I only"）。 */
const latin = (c?: string) => !!c && /[\x21-\x7e]/.test(c);
const plain = (t: string) =>
  t.replace(
    /(\S?)\s*｜\s*(\S?)/g,
    (_, a: string, b: string) => a + (latin(a) && latin(b) ? ' ' : '') + b,
  );

/**
 * 畫外字幕（設計稿 inner-voice 3）：盧卡斯沒說出口的話，不掛名字框。
 * 筆錄裡留一行 .vo-log；第一次出現時，世界退下、字從光縫漏出來。
 */
export function VoLine({ line }: { line: Line }) {
  const t = useT();
  const scope = useScope();
  const key = beatsOf(line)
    .map((b) => b.text)
    .join('/');
  const [open, setOpen] = useState(() => !played.has(key));
  const close = useCallback(() => {
    played.add(key);
    setOpen(false);
    // 字幕收掉後，焦點和視線交給這個畫面的主要動作（休庭的「繼續」、回報的「回到桌面」）。
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('main .primary.next')?.focus({ preventScroll: true }),
    );
  }, [key]);
  return (
    <>
      {beatsOf(line).map((b, i) => (
        <p key={i} className="vo-log">
          <span className="vo-mark" aria-hidden />
          <span>{plain(t(b.text, scope))}</span>
        </p>
      ))}
      {open && createPortal(<VoiceOver line={line} onDone={close} />, document.body)}
    </>
  );
}

/** 獨白蓋住的那顆主要按鈕（繼續、回到桌面）；點在別的地方就不算。 */
function buttonUnder(x: number, y: number): HTMLButtonElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest('.vo')) continue;
    const b = el.closest('button');
    return b && b.matches('button.primary, button.next') && !b.disabled ? b : null;
  }
  return null;
}

export function VoiceOver({ line, onDone }: { line: Line; onDone: () => void }) {
  const { voAuto, voScale, voBox } = useSettings();
  const t = useT();
  const scope = useScope();
  const beats = useMemo(
    () => beatsOf(line).map((b) => ({ ...b, text: t(b.text, scope) })),
    [line, t, scope],
  );
  const [i, setI] = useState(0);
  // waiting：拍與拍之間的靜默；typing：出字中；shown：出完了
  const [phase, setPhase] = useState<'waiting' | 'typing' | 'shown'>('waiting');
  // 進度線每一幀直接改 style，不經過 React：停留最長 7 秒，每幀重繪整個覆蓋層太浪費（上線前審查 P1）。
  const bar = useRef<HTMLSpanElement>(null);
  const setP = (k: number) => bar.current?.style.setProperty('--p', String(k));
  const shownAt = useRef(0);
  const beat = beats[i];
  const tm = useMemo(() => voTiming(beat.text), [beat.text]);
  const [reduced] = useState(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const next = (at?: { x: number; y: number }) => {
    if (i + 1 < beats.length) {
      setI(i + 1);
      setP(0);
      setPhase('waiting');
    } else {
      // 收掉最後一拍的那一下如果正好點在底下的「繼續」「回到桌面」上，就順便按下去
      // （體驗評測：第一下只收掉獨白，畫面看起來沒變，玩家以為按鈕壞了）。選項不轉，免得誤選。
      const under = at && buttonUnder(at.x, at.y);
      announce.voiceEnd();
      onDone();
      if (under) setTimeout(() => under.click(), 0);
    }
  };
  // 出字途中點擊＝立刻出完。防的是連點：上一下點擊 400ms 內的第二下不算。
  // 以前是「出完後 600ms 內一律不算」，字自己出完時玩家點下去也會被吃掉，看起來像按了沒反應。
  const lastClick = useRef(-Infinity);
  // 玩家自己往下一拍點過，這段獨白就不再自動前進：讀得慢的人不會漏句（無障礙審查第 5 條）。
  // 出字途中點一下只是想讓字快點出完，不算接手（體驗評測）。
  const manual = useRef(false);
  const click = (e?: { clientX: number; clientY: number }) => {
    if (phase === 'shown') manual.current = true;
    const now = performance.now();
    const double = now - lastClick.current < 400;
    lastClick.current = now;
    // 拍與拍之間的靜默裡點一下＝這一拍立刻開始出字（以前會被吃掉，看起來像沒反應）。
    if (phase === 'waiting' && !double) setPhase('typing');
    else if (phase === 'typing') setPhase('shown');
    else if (phase === 'shown' && !double) next(e && { x: e.clientX, y: e.clientY });
  };
  // 拍前的靜默：第一拍 0，之後 700ms，重句前 1200ms。
  useEffect(() => {
    if (phase !== 'waiting') return;
    const wait = i === 0 ? 0 : beat.hush ? 1200 : 700;
    const id = setTimeout(() => setPhase('typing'), wait);
    return () => clearTimeout(id);
  }, [phase, i, beat.hush]);

  // 出字：時間到就算出完；減少動態時整段直接出現。
  useEffect(() => {
    if (phase !== 'typing') return;
    const id = setTimeout(() => setPhase('shown'), reduced ? 0 : tm.type + 380);
    return () => clearTimeout(id);
  }, [phase, tm.type, reduced]);

  // 出完：送一次播報；進度線走滿 H 之後，開了自動前進就自己走。
  useEffect(() => {
    if (phase !== 'shown') return;
    shownAt.current = performance.now();
    announce.voice(plain(beat.text));
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - shownAt.current) / tm.hold);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const auto = voAuto && !manual.current ? setTimeout(() => next(), tm.hold + 400) : undefined;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(auto);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 鍵盤監聽只掛一次，透過 ref 呼叫最新的 click。
  const clickRef = useRef(click);
  useLayoutEffect(() => {
    clickRef.current = click;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // 獨白中打開的選單自己吃鍵盤，不要同時把字幕往前推。
      if ((e.target as Element | null)?.closest?.('.game-menu')) return;
      e.preventDefault();
      clickRef.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  let n = 0;
  return (
    <div
      className="vo"
      role="dialog"
      aria-modal="true"
      aria-label={t('盧卡斯沒有說出口')}
      data-subbox={voBox ? 'on' : undefined}
      style={{ '--sub-scale': voScale } as CSSProperties}
    >
      <div className="vo-veil" />
      <button className="vo-hit" aria-label={t('繼續')} onClick={(e) => click(e)} autoFocus />
      <div className="vo-frame" aria-hidden>
        <span className="vo-mark" />
        <p className={phase === 'shown' ? 'vo-text now' : 'vo-text'}>
          {phase !== 'waiting' &&
            beat.text.split('｜').map((seg, s, all) => (
              <Fragment key={`${i}-${s}`}>
                {/* 英文的詞組之間要有空白，才不會黏在一起，也才能在這裡換行。 */}
                {s > 0 && latin(all[s - 1].trimEnd().slice(-1)) && latin(seg.trimStart()[0]) && ' '}
                <span className="seg">
                  {[...seg].map((c, j) => (
                    <span
                      key={j}
                      className="ch"
                      style={{ '--i': 0, '--p': `${tm.starts[n++]}ms` } as CSSProperties}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              </Fragment>
            ))}
        </p>
        <span ref={bar} className="vo-progress" style={{ '--p': 0 } as CSSProperties} />
      </div>
      <span className={phase === 'shown' ? 'vo-cue on' : 'vo-cue'}>{t('點擊繼續')}</span>
    </div>
  );
}
