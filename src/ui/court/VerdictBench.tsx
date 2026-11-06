import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLang, useT } from '../../i18n';
import { useScope } from '../lang';
import { CourtCamera, type Crop } from './CourtCamera';
import { verdictSlot, type VerdictOutcome } from './camNames';
import { readTokens } from './verdictBeats';

/** 進場等圖的保險上限（ms），和 CourtCamera 的 ENTRY_CAP 同一個數：到了還沒圖就不再等，直接進裁決書。 */
const ENTRY_CAP = 8000;
/** 判決那一格至少停多久（設計師 11-06：--dur-turn，短於 1.5 秒就 1.5 秒）。 */
const MIN_HOLD = 1500;
/** 判決時的耐心燈管：結辯沒有耐心，庭審最後一刻燈管是滿的（耐心每場重來）。 */
const VERDICT_PATIENCE = 5;

/**
 * 手機 ≤767 的裁切（設計師 11-06 第二輪）：原圖全高，橫向只取法官、桌燈到掛鐘那一段，讓鐘讀得出時刻。
 * 左緣放在第二、三根燈管（連燈座）之間的空隙：實量 1920 寬原圖上第二根燈座到 x 555、第三根從 x 572 開始（六格、耐心 0–5 都一樣），
 * 取正中 563.5；右緣 x 1901，掛鐘（到 x 1881）右邊留一點牆。這樣只露右邊三根燈管，每根都整根在框裡。
 */
export const PHONE_CROP: Crop = [563.5 / 1920, 0, (1901 - 563.5) / 1920, 1];

/** 地點只留房間名（中文取最後一個全形空格後面，「…高等法院」後的「第三法庭」；英文取最後一個逗號後面）。 */
export function roomOf(place: string, en: boolean) {
  const cut = place.lastIndexOf(en ? ', ' : '　');
  return cut > 0 ? place.slice(cut + (en ? 2 : 1)) : place;
}

function useQuery(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia(q);
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [q]);
  return on;
}

/**
 * 判決頁開頭的建立鏡頭（設計師 11-06）：法官席，判決窗光 A，掛鐘停在這個結果的時刻。
 * 每一層都解碼好才硬切進來（等的時候純黑）；停 max(--dur-turn, 1.5 秒)；切黑 --dur-cut-black 再交給裁決書。
 * 沒有推鏡、沒有淡入淡出；減少動態照樣出這一格（本來就是硬切）。場記只寫房間，不寫時刻、沒有黃短槓（這一格沒有黃）。
 * 「略過」、點一下、按鍵（Tab 除外）跳過這一格連同後面的四拍，直接到結論。
 */
export function VerdictBench({
  episode,
  outcome,
  place,
  onDone,
}: {
  episode: string;
  outcome: VerdictOutcome;
  /** 結辯那一場的地點（未翻譯的鍵）。 */
  place: string;
  /** skipped：玩家按了略過，後面的四拍一起跳過。 */
  onDone: (skipped: boolean) => void;
}) {
  const t = useT();
  const scope = useScope();
  const en = useLang((s) => s.lang) === 'en';
  const phone = useQuery('(max-width: 767px)');
  const [phase, setPhase] = useState<'wait' | 'hold' | 'black'>('wait');
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });
  const finished = useRef(false);
  const finish = (skipped: boolean) => {
    if (finished.current) return;
    finished.current = true;
    done.current(skipped);
  };

  // 圖一直沒好：不卡在黑畫面，到上限就進裁決書。
  useEffect(() => {
    if (phase !== 'wait') return;
    const cap = window.setTimeout(() => finish(false), ENTRY_CAP);
    return () => window.clearTimeout(cap);
  }, [phase]);

  useEffect(() => {
    if (phase === 'wait') return;
    const tk = readTokens();
    const id =
      phase === 'hold'
        ? window.setTimeout(() => setPhase('black'), Math.max(tk.turn, MIN_HOLD))
        : window.setTimeout(() => finish(false), tk.cutBlack);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.metaKey || e.ctrlKey || e.altKey) return;
      finish(true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const slot = verdictSlot(episode, outcome);
  return (
    <main className="vbench" data-phase={phase} data-slot={slot} onClick={() => finish(true)}>
      <div className="vbench-cam" aria-hidden>
        <CourtCamera
          shot="bench"
          witness=""
          state="default"
          patience={VERDICT_PATIENCE}
          scene={slot}
          mode={phone ? 'insert' : 'strip'}
          crop={phone ? PHONE_CROP : undefined}
          onShown={() => setPhase((p) => (p === 'wait' ? 'hold' : p))}
        />
      </div>
      {phase === 'hold' && (
        // 和定場場記同一個版型（短槓＋地點），但不淡入淡出、短槓用 --cine-muted：這一格沒有黃。內容只寫地點（10-17 裁定）。
        <p
          className={en ? 'place-slate en vbench-slate' : 'place-slate vbench-slate'}
          role="status"
        >
          <span className="ps-text">
            <span className="ps-where">
              <span className="ps-room">{roomOf(t(place, scope), en)}</span>
            </span>
          </span>
        </p>
      )}
      <button type="button" className="vstage-skip" onClick={() => finish(true)}>
        {t('略過')}
      </button>
    </main>
  );
}
