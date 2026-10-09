import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { episodeOf, useEpisode } from '../engine/game';
import { useLang, useT } from '../i18n';
import { reducedMotion } from './a11y';
import { kelvinOf, rigOf } from './rigs';
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

/** 幕名的字寬，以中文字為 1：拉丁字母約半個字寬。 */
const width = (s: string) => [...s].reduce((n, c) => n + (CJK.test(c) ? 1 : 0.55), 0);

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
  const en =
    /^(.*?)[.,] ((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Day|The next|One week|Two weeks|\d{1,2}:\d{2}).*)$/.exec(
      place,
    );
  if (en) return [en[1], en[2]];
  return [place, ''];
}

/** 場記的地點：raw 是中文原文（判斷燈組與色溫用），text 是畫面語言的寫法。 */
export type Place = { raw: string; text: string };

/** 場記一行：左欄地點，右欄「日、時刻、色溫」。法庭讀燈組（11.3），其他地點讀地點自帶的日子時刻。 */
function useSlate(place: Place | undefined, day?: string): [string, string] {
  const t = useT();
  const en = useLang((s) => s.lang) === 'en';
  if (!place) return ['', ''];
  const [where, when] = splitSlate(place.text);
  const rig = rigOf(place.raw, day);
  const k = rig?.kelvin ?? kelvinOf(place.raw);
  const right = [rig ? `${t(rig.label)} ${rig.time}` : when, `${k}K`]
    .filter(Boolean)
    .join(en ? '  ' : '\u3000');
  return [where, right];
}

/**
 * 幕卡的時間（11.3 進場時間）：燈管 900ms，黑條每 83ms 一條、共 8 條，每條抽 500ms；停 2.5 秒；切黑 83ms。
 * 減少動態：整張卡 120ms 淡入、沒有黑條，一樣停 2.5 秒。
 */
const HOLD = 2500;
const CUT = 83;
const ENTER = 900 + 7 * 83 + 500;
const ENTER_RM = 120;

function useHeld(on: boolean) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = window.setTimeout(() => setHeld(true), (reducedMotion() ? ENTER_RM : ENTER) + HOLD);
    return () => clearTimeout(id);
  }, [on]);
  return held;
}

/** 選單開著時，幕卡不切走、按鍵也不跳過。 */
const menuOpen = () => !!document.querySelector('dialog[open], [role="dialog"]');

function useCut(onDone?: () => void) {
  const [black, setBlack] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const auto = !!onDone;
  useEffect(() => {
    if (!auto) return;
    let id = 0;
    const fire = () => {
      if (menuOpen()) id = window.setTimeout(fire, 500);
      else setBlack(true);
    };
    id = window.setTimeout(fire, (reducedMotion() ? ENTER_RM : ENTER) + HOLD);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (menuOpen()) return;
      // 焦點在按鈕上（例如選單鈕）時，按鍵是那顆按鈕的。
      if (e.target instanceof HTMLElement && e.target.closest('button, a, input, select, textarea'))
        return;
      e.preventDefault();
      setBlack(true);
    };
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', key);
    };
  }, [auto]);
  useEffect(() => {
    if (!black) return;
    const id = window.setTimeout(() => done.current?.(), CUT);
    return () => clearTimeout(id);
  }, [black]);
  return { black, skip: () => auto && setBlack(true) };
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
  onDone,
}: {
  headline: Headline;
  /** 場記：下一場戲的地點。 */
  place?: Place;
  bates: string;
  lines?: ReactNode;
  children?: ReactNode;
  /** 有這個就是鏡頭：進場完停 2.5 秒，硬切（83ms 黑）進下一場；點一下、Enter、空白鍵可以跳過。 */
  onDone?: () => void;
}) {
  const cut = useCut(onDone);
  // 集尾卡：進場跑完、停 2.5 秒後不切場，選項才出現在卡下的介面層（卡上不放按鈕）。
  const held = useHeld(!onDone && !!children);
  const t = useT();
  const en = useLang((s) => s.lang) === 'en';
  const { plaintiff, defendant, caseNo } = useCaseTerms();
  const [where, right] = useSlate(place, headline.day ?? headline.title);
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
    <main
      className={cut.black ? 'scene title-card act-stage cut' : 'scene title-card act-stage'}
      onClick={cut.skip}
      data-auto={onDone ? '' : undefined}
    >
      <div className="act-wrap">
        <section
          className={CJK.test(headline.title) ? 'act-card' : 'act-card latin'}
          aria-label={[headline.kicker, headline.title].join(' ')}
        >
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
                <span className="act-big" style={{ '--n': width(headline.title) } as CSSProperties}>
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
      {children && held && <div className="act-actions">{children}</div>}
    </main>
  );
}

/**
 * 地點字卡（設定集 11.3）：換地點但沒有幕卡時，鏡頭左下一行場記，前面一段 14×2 的黃短槓。
 * 淡入 180ms、停 2.5 秒、淡出 180ms；不擋操作，讀屏照常唸。
 */
export function PlaceSlate({ id, place }: { id?: string; place: Place | null }) {
  const en = useLang((s) => s.lang) === 'en';
  const [where, right] = useSlate(place ?? undefined);
  if (!place) return null;
  return (
    <p key={id} className="place-slate" role="status">
      {[where, right].join(en ? '  ' : '\u3000')}
    </p>
  );
}

/**
 * 幕卡上的回顧與目標（「緩刑五年……」「先選出十二位陪審員……」）不寫在卡上（設定集 11.3：卡是鏡頭），
 * 移到下一場第一則旁白區塊，一字不刪。和場記重複的地點不再寫一次。
 */
export function Recap() {
  const { progress } = useEpisode();
  const t = useT();
  const ep = episodeOf(progress);
  const card = ep.scenes[progress.scene - 1];
  if (card?.type !== 'card') return null;
  const here = ep.scenes[progress.scene];
  const place = here && 'place' in here ? (here.place ?? '') : '';
  const lines = (card.act === '片頭' ? card.lines.slice(1) : card.lines).filter(
    (l) => !(place && place.startsWith(l)),
  );
  if (lines.length === 0) return null;
  return (
    <div className="recap">
      {lines.map((l) => (
        <p key={l} className="narration">
          {t(l, card.id)}
        </p>
      ))}
    </div>
  );
}
