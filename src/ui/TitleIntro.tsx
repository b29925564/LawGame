import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useSettings } from '../engine/settings';
import { useT } from '../i18n';
import { reducedMotion } from './a11y';
import { useMenu } from './GameMenu';
import blindDA from './intro/blind-ep1-base-desktop.avif';
import blindDW from './intro/blind-ep1-base-desktop.webp';
import blindPA from './intro/blind-ep1-base-phone.avif';
import blindPW from './intro/blind-ep1-base-phone.webp';
import slitDA from './intro/blind-ep1-slit-screen-desktop.avif';
import slitDW from './intro/blind-ep1-slit-screen-desktop.webp';
import slitPA from './intro/blind-ep1-slit-screen-phone.avif';
import slitPW from './intro/blind-ep1-slit-screen-phone.webp';
import c17DA from './intro/court-0017wD.avif';
import c17DW from './intro/court-0017wD.webp';
import c17PA from './intro/court-0017wP.avif';
import c17PW from './intro/court-0017wP.webp';
import vigD from './intro/court-0017w-vignette-desktop.png';
import vigP from './intro/court-0017w-vignette-phone.png';
import c23DA from './intro/court-0023D.avif';
import c23DW from './intro/court-0023D.webp';
import c23PA from './intro/court-0023P.avif';
import c23PW from './intro/court-0023P.webp';
import c29DA from './intro/court-0029D.avif';
import c29DW from './intro/court-0029D.webp';
import c29PA from './intro/court-0029P.avif';
import c29PW from './intro/court-0029P.webp';
import './titleIntro.css';

/**
 * 片頭 40 秒（設定集 11.1）：冷開場之後、第一幕之前，取代集內「片頭」幕卡前面的那一段。
 * 0:00–0:38 是這裡的七個鏡頭（0:00 和 0:05 同一個機位，合成一格）；0:38 的集名卡是原本的幕卡（ActCard），
 * 停完切黑 83ms 進第一幕第一場。
 *
 * 底圖是場景光影 #3 的正式圖（art-bible/scenes/title-intro-v94/final/，設計師 11-07 PASS）：0:10 第一集百葉窗、
 * 0:17、0:23、0:29 法庭。圖已經分級過（titlegrade），這裡不再加濾鏡。每張有 AVIF、WebP 兩種，手機用直式機位。
 * 還沒換的：0:00 紙（黑條要對到紙上透視、景深裡的行，等設計師定做法）、0:10 第二集百葉窗（場景光影重算中），
 * 先用 HTML 畫的佔位，時間軸、黑條、螢光、標準字都不動。
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
          {shot === 'blind' && (ep2 ? <Blind lit={12} /> : <Blinds />)}
          {shot === 'court' && <Court />}
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

/** 手機（≤767px）用直式機位；兩種都先給 AVIF、再給 WebP。 */
type Src = readonly [avif: string, webp: string];
function Plate({ desk, phone, className }: { desk: Src; phone: Src; className?: string }) {
  const PHONE = '(max-width: 767px)';
  return (
    <picture className={['ti-plate', className].filter(Boolean).join(' ')}>
      <source media={PHONE} type="image/avif" srcSet={phone[0]} />
      <source media={PHONE} type="image/webp" srcSet={phone[1]} />
      <source type="image/avif" srcSet={desk[0]} />
      <img src={desk[1]} alt="" decoding="async" draggable={false} />
    </picture>
  );
}

/**
 * 0:10 第一集：塗黑的頁面立起來變成百葉窗（場景光影 #3 正式圖）。底圖的亮縫權重是 0，
 * 最上面那條（31 樓）的亮縫是另一層，黑底、screen 疊上去，2.4 秒起亮。整組從 1.3 倍拉到 1.0。
 */
function Blinds() {
  return (
    <div className="ti-blinds">
      <Plate desk={[blindDA, blindDW]} phone={[blindPA, blindPW]} />
      <Plate desk={[slitDA, slitDW]} phone={[slitPA, slitPW]} className="ti-slit" />
    </div>
  );
}

/**
 * 0:17：一張寬圖橫移（陪審席）。視窗左緣從圖寬的 0.310（手機 0.561）移到 0；寬螢幕的起點往回收，
 * 右邊不露出圖外。暗角是另一張圖，固定在視窗上、一般疊法（不烤進寬圖，橫移時暗角不跟著走）。
 */
function Court() {
  return (
    <>
      <div className="ti-pan">
        <Plate desk={[c17DA, c17DW]} phone={[c17PA, c17PW]} />
      </div>
      <picture className="ti-plate ti-vignette">
        <source media="(max-width: 767px)" srcSet={vigP} />
        <img src={vigD} alt="" decoding="async" draggable={false} />
      </picture>
    </>
  );
}

/** 0:23：證人席，麥克風、一杯水。浮出本集的關鍵物，黑條蓋上。 */
function Witness({ ep2 }: { ep2: boolean }) {
  const t = useT();
  return (
    <>
      <Plate desk={[c23DA, c23DW]} phone={[c23PA, c23PW]} className="still" />
      {ep2 ? (
        <>
          {/* 不是藏、刪、默（黑條的三種意思），是他自己按掉的：61 次紀錄都在（ep2.yaml app-log）。
              提醒卡像被手指按掉一樣往右滑出，原位留一行「已略過」和那一次的時間（設計師 #319）。 */}
          <div className="ti-note">
            <b>{t('卡爾德快遞', 'cold-open')}</b>
            <span className="ti-msg">
              {t('您已連續上線 10 小時。休息將使今日評分下降。', 'cold-open')}
            </span>
          </div>
          <p className="ti-skipped">
            {t('已略過')}
            <time>18:09</time>
          </p>
        </>
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

/**
 * 0:29：盧卡斯的背影（正式圖：立牌 v4 的輪廓光，手上那頁紙在房間裡實算），從 1.0 推到 1.12（中心在畫面正中）。
 * 一道螢光由左往右刷過紙上第 13 行：全片第一道黃。螢光的四角取自場景光影的 court-0029-ui.json（放大 1.0 時的
 * 底圖座標），畫在和底圖同尺寸、同裁切（cover＝slice）的 SVG 上，跟著一起推。
 */
function Lucas() {
  return (
    <div className="ti-push29">
      <Plate desk={[c29DA, c29DW]} phone={[c29PA, c29PW]} className="rack" />
      <svg className="ti-hl29 desk" viewBox="0 0 2880 1800" preserveAspectRatio="xMidYMid slice">
        <polygon
          className="ti-hl29-ink"
          points="1160.1,1277.8 1332.0,1303.0 1331.1,1308.8 1159.2,1283.4"
        />
      </svg>
      <svg className="ti-hl29 phone" viewBox="0 0 1620 2880" preserveAspectRatio="xMidYMid slice">
        <polygon
          className="ti-hl29-ink"
          points="223.7,2044.5 499.1,2084.8 497.7,2094.0 222.3,2053.4"
        />
      </svg>
    </div>
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
