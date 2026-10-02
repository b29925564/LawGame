import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Line } from '../engine/episode/schema';
import { useSettings } from '../engine/settings';
import { announce } from './Marks';
import { voTiming } from './voTiming';

/** 這一輪已經播過的字幕：回到同一畫面時只留筆錄，不再整段重播。 */
const played = new Set<string>();

const beatsOf = (line: Line) =>
  line.beats?.length ? line.beats : [{ text: line.text, hush: false }];
const plain = (t: string) => t.replace(/｜/g, '');

/**
 * 畫外字幕（設計稿 inner-voice 3）：以安沒說出口的話，不掛名字框。
 * 筆錄裡留一行 .vo-log；第一次出現時，世界退下、字從光縫漏出來。
 */
export function VoLine({ line }: { line: Line }) {
  const key = beatsOf(line)
    .map((b) => b.text)
    .join('/');
  const [open, setOpen] = useState(() => !played.has(key));
  const close = useCallback(() => {
    played.add(key);
    setOpen(false);
  }, [key]);
  return (
    <>
      {beatsOf(line).map((b, i) => (
        <p key={i} className="vo-log">
          <span className="vo-mark" aria-hidden />
          <span>{plain(b.text)}</span>
        </p>
      ))}
      {open && createPortal(<VoiceOver line={line} onDone={close} />, document.body)}
    </>
  );
}

export function VoiceOver({ line, onDone }: { line: Line; onDone: () => void }) {
  const { voAuto, voScale, voBox } = useSettings();
  const beats = beatsOf(line);
  const [i, setI] = useState(0);
  // waiting：拍與拍之間的靜默；typing：出字中；shown：出完了
  const [phase, setPhase] = useState<'waiting' | 'typing' | 'shown'>('waiting');
  const [p, setP] = useState(0);
  const shownAt = useRef(0);
  const beat = beats[i];
  const t = voTiming(beat.text);
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const next = () => {
    if (i + 1 < beats.length) {
      setI(i + 1);
      setP(0);
      setPhase('waiting');
    } else {
      announce.voiceEnd();
      onDone();
    }
  };
  // 出字途中點擊＝立刻出完；出完後 600ms 內點擊無效。
  const click = () => {
    if (phase === 'typing') setPhase('shown');
    else if (phase === 'shown' && performance.now() - shownAt.current >= 600) next();
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
    const id = setTimeout(() => setPhase('shown'), reduced ? 0 : t.type + 380);
    return () => clearTimeout(id);
  }, [phase, t.type, reduced]);

  // 出完：送一次播報；進度線走滿 H 之後，開了自動前進就自己走。
  useEffect(() => {
    if (phase !== 'shown') return;
    shownAt.current = performance.now();
    announce.voice(plain(beat.text));
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - shownAt.current) / t.hold);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const auto = voAuto ? setTimeout(() => next(), t.hold + 400) : undefined;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(auto);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      click();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  let n = 0;
  return (
    <div
      className="vo"
      role="dialog"
      aria-modal="true"
      aria-label="以安沒有說出口"
      data-subbox={voBox ? 'on' : undefined}
      style={{ '--sub-scale': voScale } as CSSProperties}
    >
      <div className="vo-veil" />
      <button className="vo-hit" aria-label="繼續" onClick={click} autoFocus />
      <div className="vo-frame" aria-hidden>
        <span className="vo-mark" />
        <p className={phase === 'shown' ? 'vo-text now' : 'vo-text'}>
          {phase !== 'waiting' &&
            beat.text.split('｜').map((seg, s) => (
              <span key={`${i}-${s}`} className="seg">
                {[...seg].map((c, j) => (
                  <span
                    key={j}
                    className="ch"
                    style={{ '--i': 0, '--p': `${t.starts[n++]}ms` } as CSSProperties}
                  >
                    {c}
                  </span>
                ))}
              </span>
            ))}
        </p>
        <span className="vo-progress" style={{ '--p': p } as CSSProperties} />
      </div>
      <span className={phase === 'shown' ? 'vo-cue on' : 'vo-cue'}>點擊繼續</span>
    </div>
  );
}
