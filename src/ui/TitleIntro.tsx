import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useSettings } from '../engine/settings';
import { useT } from '../i18n';
import { reducedMotion } from './a11y';
import { useMenu } from './GameMenu';
import courtDesk40 from './court/court-desktop-40.webp';
import courtDesk55 from './court/court-desktop-55.webp';
import courtPhone40 from './court/court-phone-40.webp';
import courtPhone55 from './court/court-phone-55.webp';
import witnessStand from './court/cam/witness-default.webp';
import './titleIntro.css';

/**
 * 片頭 40 秒（設定集 11.1）：冷開場之後、第一幕之前，取代集內「片頭」幕卡前面的那一段。
 * 0:00–0:38 是這裡的七個鏡頭（0:00 和 0:05 同一個機位，合成一格）；0:38 的集名卡是原本的幕卡（ActCard），
 * 停完切黑 83ms 進第一幕第一場。
 *
 * 圖還沒算出來（場景光影）：0:00 紙、0:10 百葉窗用 HTML 畫的佔位；0:17、0:23、0:29 先用現有的法庭機位圖。
 * 圖到了以後換成 <img>，時間軸、黑條、螢光、標準字都不動。
 *
 * - 每次從頭開始一集都播；讀檔讀到片頭之後不播（片頭是那一張卡的前半段，過了就不在了）。
 * - 第二次播起右下角有「跳過」，直接到 0:38 的集名卡（不跳過集名）。看過與否每一集分開記，存在設定裡。
 * - 減少動態：推軌、後拉改成不動，黑條直接出現，每個鏡頭 120ms 淡入，鏡頭之間不插黑格。
 * - 光敏安全：0:34 燈管兩次脈衝改單次 700ms 漸亮（titleIntro.css 讀 html[data-photosafe]）。
 * - 沒有音樂（音效另外提案）。
 * - 片頭期間右上角照樣有「選單」（第一次不能跳過，玩家要能去改光敏安全、減少動態）；選單打開時片頭暫停，Esc 也能打開。
 * - **正式圖到齊前玩家版不播**（設計師 #319 審查 1）：預設關，走原本的片頭幕卡。審查、關卡用網址 `?intro=1`
 *   （只在那一頁）或 localStorage['rd.dev.intro']＝'1' 打開。圖換上、設計師通過後把 INTRO_DEFAULT 改成 true。
 */

type ShotId = 'paper' | 'blind' | 'court' | 'witness' | 'lucas' | 'mark';

/** 每個鏡頭的長度（ms）。paper 包含 0:00 的紙和 0:05 的黑條（同一個機位、不切）。 */
export const SHOTS: readonly (readonly [ShotId, number])[] = [
  ['paper', 10000],
  ['blind', 7000],
  ['court', 6000],
  ['witness', 6000],
  ['lucas', 5000],
  ['mark', 4000],
];
/** 0:38：集名卡出現的時間。 */
export const INTRO_MS = SHOTS.reduce((n, [, ms]) => n + ms, 0);
/** 鏡頭之間的硬切：2 格黑（--dur-cut-black），從前一個鏡頭的尾巴扣，總長不變。 */
const CUT_BLACK = 83;

/** 玩家版播不播片頭：正式圖到齊、設計師通過以前是 false。 */
const INTRO_DEFAULT = false;
export function introOn() {
  try {
    const q = new URLSearchParams(location.search).get('intro');
    if (q === '1' || q === '0') return q === '1';
    const v = localStorage.getItem('rd.dev.intro');
    if (v === '1' || v === '0') return v === '1';
  } catch {
    // 讀不到就照預設。
  }
  return INTRO_DEFAULT;
}

export function TitleIntro({ episode, onDone }: { episode: string; onDone: () => void }) {
  const t = useT();
  // 第二次播起才能跳過：看的是開始播的那一刻，這一次播到一半不會冒出按鈕。
  const [canSkip] = useState(() => !!useSettings.getState().introSeen[episode]);
  const [at, setAt] = useState(0);
  const [black, setBlack] = useState(false);
  const paused = useMenu((m) => m.open !== null);
  /** 這個鏡頭已經播了多久（暫停前播掉的）。 */
  const spent = useRef(0);
  useEffect(() => {
    const seen = useSettings.getState().introSeen;
    if (!seen[episode]) useSettings.getState().set({ introSeen: { ...seen, [episode]: true } });
  }, [episode]);
  // Esc 打開選單（開著的時候 Esc 由選單自己收起來）：在捕獲階段先接，選單的 Esc 不會同時把它關掉。
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useMenu.getState().open) return;
      e.stopImmediatePropagation();
      useMenu.getState().setOpen('save');
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, []);
  useEffect(() => {
    spent.current = 0;
  }, [at]);
  useEffect(() => {
    if (paused) return;
    const rm = reducedMotion();
    const last = at === SHOTS.length - 1;
    const left = SHOTS[at][1] - spent.current;
    const start = Date.now();
    const timers: number[] = [];
    if (!last && !rm)
      timers.push(window.setTimeout(() => setBlack(true), Math.max(0, left - CUT_BLACK)));
    timers.push(
      window.setTimeout(() => {
        setBlack(false);
        if (last) onDone();
        else setAt(at + 1);
      }, left),
    );
    return () => {
      spent.current += Date.now() - start;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // onDone 每次 render 都是新的：計時只看鏡頭換了沒有、停了沒有。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, paused]);
  const [shot] = SHOTS[at];
  const ep2 = episode === 'ep2';
  return (
    <main
      className="title-intro"
      data-shot={shot}
      data-episode={episode}
      data-paused={paused ? '' : undefined}
      aria-label={t('片頭')}
    >
      {!black && (
        <div key={shot} className={`ti-shot shot-${shot}`} aria-hidden>
          {shot === 'paper' && <Paper />}
          {shot === 'blind' && <Blind lit={ep2 ? 12 : 0} />}
          {shot === 'court' && <Plate desk={courtDesk55} phone={courtPhone55} />}
          {shot === 'witness' && <Witness ep2={ep2} />}
          {shot === 'lucas' && <Lucas />}
          {shot === 'mark' && <Mark />}
        </div>
      )}
      {canSkip && (
        <button className="ti-skip" onClick={onDone}>
          {t('跳過')}
        </button>
      )}
    </main>
  );
}

const ROWS = 28;
/**
 * 0:05 的黑條：先慢後快（設計師 #319 審查 4，24 格／秒）。第 1 條蓋第 11 行；第 2、3 條各隔 8 格（333ms）；
 * 其餘 25 條各隔 2 格（83ms），跳著蓋。每條 167ms steps(4)。最後一條 0:07.9 蓋完，停到 0:10。
 */
export const barDelay = (i: number) => (i < 3 ? i * 333 : 2 * 333 + (i - 2) * 83);
/** 每一行是第幾條黑條（0 起）。 */
const BAR_ORDER = (() => {
  const rest = Array.from({ length: ROWS }, (_, n) => n).filter((n) => n !== 10);
  rest.sort((a, b) => ((a * 11) % ROWS) - ((b * 11) % ROWS));
  const order = new Array<number>(ROWS);
  [10, ...rest].forEach((row, i) => (order[row] = i));
  return order;
})();
/** 每一行字的長度（紙寬比例），看起來像一頁真的訴狀：段落尾行短。 */
const INK = [
  0.42, 0.3, 0, 0.86, 0.92, 0.9, 0.58, 0, 0.88, 0.93, 0.87, 0.91, 0.4, 0, 0.9, 0.86, 0.92, 0.89,
  0.66, 0, 0.91, 0.88, 0.9, 0.52, 0, 0.84, 0.9, 0.35,
];

/** 0:00–0:10：訴狀紙微距。行號一拍二逐行亮起，紅邊線由上往下；0:05 起黑條一條一條蓋上。 */
function Paper() {
  return (
    <div className="ti-paper">
      <div className="ti-sheet">
        <i className="ti-margin" />
        {INK.map((w, n) => (
          <div key={n} className="ti-row" style={{ '--n': n } as CSSProperties}>
            <span className="ti-no">{n + 1}</span>
            <span className="ti-ink" style={{ '--w': w } as CSSProperties} />
            <span
              className="ti-bar"
              style={{ '--bd': `${barDelay(BAR_ORDER[n])}ms` } as CSSProperties}
            />
          </div>
        ))}
      </div>
      <i className="ti-rake" />
    </div>
  );
}

/**
 * 0:10：塗黑的頁面立起來變成百葉窗，4800K 從縫打進霧裡；31 條縫（＝31 層樓），lit 那一條（由上往下數，0 起）亮起。
 * 第一集是最上面那條（31 樓）；第二集是合約第 7.3 條那一行。
 */
function Blind({ lit }: { lit: number }) {
  return (
    <div className="ti-blind">
      <div className="ti-slats">
        {Array.from({ length: 31 }, (_, n) => (
          <i key={n} className={n === lit ? 'ti-gap lit' : 'ti-gap'} />
        ))}
      </div>
      <i className="ti-fog" />
    </div>
  );
}

function Plate({ desk, phone, className }: { desk: string; phone: string; className?: string }) {
  return (
    <picture className={['ti-plate', className].filter(Boolean).join(' ')}>
      <source media="(max-width: 767px)" srcSet={phone} />
      <img src={desk} alt="" decoding="async" draggable={false} />
    </picture>
  );
}

/** 0:23：證人席，麥克風、一杯水。浮出本集的關鍵物，黑條蓋上。 */
function Witness({ ep2 }: { ep2: boolean }) {
  const t = useT();
  return (
    <>
      <Plate desk={witnessStand} phone={witnessStand} className="still" />
      {ep2 ? (
        <div className="ti-note">
          <b>{t('卡爾德快遞', 'cold-open')}</b>
          <span className="ti-msg">
            {t('您已連續上線 10 小時。休息將使今日評分下降。', 'cold-open')}
            {/* 不是藏也不是刪：他自己按了「略過」，61 次紀錄都在（劇本與內容 #2，ep2.yaml:57–62）。 */}
            <i className="ti-msg-bar">
              <em>{t('已略過')}</em>
            </i>
          </span>
        </div>
      ) : (
        <div className="ti-bubble">
          <b>{t('葛蘭特・沃斯', 'cold-open')}</b>
          <span className="ti-msg">
            {t('十點四十五分上來，把筆電帶來。我們私下解決。', 'cold-open')}
            <i className="ti-msg-bar">
              <em>{t('此訊息已被收回')}</em>
            </i>
          </span>
        </div>
      )}
    </>
  );
}

/** 0:29：盧卡斯的背影（替身剪影），西窗輪廓光；手上一頁筆錄，一道螢光刷過一行。全片第一道黃。 */
function Lucas() {
  return (
    <>
      <Plate desk={courtDesk40} phone={courtPhone40} className="rack" />
      <svg className="ti-back" viewBox="0 0 200 220" preserveAspectRatio="xMidYMax meet">
        {/* 後腦、碎髮、脖子、兩肩：無臉替身，只有剪影。右緣一道西窗輪廓光。 */}
        <path
          className="ti-back-body"
          d="M100 18c-24 0-40 18-40 42 0 16 6 28 15 36l-3 20c-22 4-48 12-60 26-8 10-12 40-12 78h200c0-38-4-68-12-78-12-14-38-22-60-26l-3-20c9-8 15-20 15-36 0-24-16-42-40-42z"
        />
        <path
          className="ti-back-rim"
          d="M128 34c8 8 12 18 12 26 0 16-6 28-15 36M131 120c21 5 40 12 50 24 6 8 9 30 10 66"
        />
      </svg>
      <div className="ti-page">
        {[0.8, 0.7, 0.86, 0.62, 0.78, 0.84, 0.5].map((w, n) => (
          <span key={n} className={n === 3 ? 'ti-line hl' : 'ti-line'}>
            <i style={{ '--w': w } as CSSProperties} />
          </span>
        ))}
      </div>
    </>
  );
}

/** 0:34：標準字直排。每個字先是一條黑條，燈管亮起的同時依序抽走；「疑」字旁留下螢光直線。 */
function Mark() {
  const t = useT();
  return (
    <div className="ti-mark">
      <span className="ti-tube" />
      <span className="ti-cone" />
      <h1 aria-label={t('合理懷疑')}>
        {[...'合理懷疑'].map((c, i) => (
          <span key={i} className="ti-ch" style={{ '--i': i } as CSSProperties}>
            {c}
          </span>
        ))}
        <i className="ti-hl" />
      </h1>
    </div>
  );
}
