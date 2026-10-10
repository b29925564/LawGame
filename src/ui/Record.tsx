import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { JUDGE, YOU } from '../engine/episode/trial';
import { batesAt } from '../engine/bates';
import { episodeOf } from '../engine/game';
import type { Progress } from '../engine/save';
import { preload, tIn, useCatalog, useLang, useT, type Lang } from '../i18n';
import { useScope } from './lang';
import {
  CJK_PUNCT,
  kindsOf,
  layout,
  measureFor,
  ROWS_PER_PAGE,
  rulingsOf,
  textWidth,
  type RecordEntry,
  type RecordRow,
  type Redaction,
} from './record';

const NARRATOR = '旁白';
// 筆錄上的發言人寫職稱，不寫名字（真的筆錄是「THE COURT:」「MR. GREY:」）。
const SPEAKER: Record<string, string> = { [JUDGE]: '法官', [YOU]: '葛雷律師' };

/**
 * 庭上的話轉成筆錄的句子。stricken＝法官下令整段刪除這位證人的證詞：她說過的每一句都蓋上黑條。
 * 每句另帶另一種語言的版本（twin），排版時兩種語言共用同一套頁行。中文模式也要英文表，
 * 所以這裡先載進來；載好之前照中文排，載好後重排一次。
 */
export function useCourtEntries(
  log: readonly { who: string; text: string; struck?: boolean }[],
  witness: string,
  stricken = false,
): RecordEntry[] {
  const scope = useScope();
  const lang = useLang((s) => s.lang);
  const catalog = useCatalog((s) => s.n);
  useEffect(preload, []);
  // 法庭狀態每次重畫都是重新推出來的新陣列：用內容當 key，句子沒變就沿用同一份筆錄。
  const key = log.map((l) => `${l.who}\u0002${l.text}\u0002${l.struck ? 1 : 0}`).join('\u0001');
  return useMemo(() => {
    const kinds = kindsOf(log, witness, { judge: JUDGE, narrator: NARRATOR });
    const rulings = rulingsOf(log, { lawyer: YOU, judge: JUDGE, witness });
    const say = (l: (typeof log)[number], i: number, in_: Lang) => {
      const t = (zh: string, arg?: string | Record<string, string>) => tIn(in_, zh, arg);
      const kind = kinds[i];
      const name = t(SPEAKER[l.who] ?? l.who, 'record');
      const tag =
        kind === 'q'
          ? t('問', 'record')
          : kind === 'a'
            ? t('答', 'record')
            : kind === 'say'
              ? in_ === 'en'
                ? `${name.toUpperCase()}:`
                : `${name}：`
              : '';
      const text = t(l.text, scope);
      // 旁白寫進筆錄是括號裡的說明；本來就有括號的不再包一層。
      const note = kind === 'note' && !/^[（(]/.test(text);
      return { tag, text: note ? t('（{text}）', { text }) : text };
    };
    const other: Lang = lang === 'zh' ? 'en' : 'zh';
    return log.map((l, i) => {
      const redact: Redaction | undefined = l.struck
        ? '異議成立'
        : stricken && l.who === witness
          ? '已自紀錄刪除'
          : undefined;
      return { kind: kinds[i], ...say(l, i, lang), redact, ...rulings[i], twin: say(l, i, other) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, witness, stricken, scope, lang, catalog]);
}

// 紙的左右（em）：行號欄＋雙直線＋內距、右內距，再留一個字給行尾掛出去的標點（中文全形 1em、英文 0.6em），
// 括號說明縮排再深，掛出去的「。）」也不貼紙邊（設計師 10-09）。CSS 的 --rec-hang 是同一個數。
const paperX = (zh: boolean) => 3 + 0.6 + (zh ? 1 : 0.6);
// 一頁的高（行）：頁首一行、25 行、Bates 一行，再加紙底的內距。
const PAGE_ROWS = ROWS_PER_PAGE + 2.4;
// 手機上框至少放得下頁首加 5 個整行（設計師 10-09）。
const MIN_ROWS = 6;

/**
 * 字級與行距跟著框算：一行的字數固定（measureFor），所以字級＝框寬 ÷ 一行的 em，
 * 最大是 CSS 的 --rec-base（桌機 15、手機中文 14、英文 13）。
 * fit：框是版面給的固定高度（庭上的那份），行距收到一整頁 25 行剛好放得下，最密 1.5 倍、最鬆 2 倍。
 */
/**
 * 裁定章佔的寬（em，以筆錄字級 fs 計）：章上的字最小 11px（court.css），所以先算 px 再換回 em。
 * 字（中文 0.9fs、英文 Courier 0.8fs×0.6 加字距）＋左距 0.8em＋框、內距與外框約 18px。
 */
const stampEm = (label: string, zh: boolean, fs: number) => {
  const px = zh ? Math.max(11, fs * 0.9) : Math.max(11, fs * 0.8) * 0.6 * 1.06;
  return 0.8 + (label.length * px + 18) / fs;
};

interface Fit {
  fs: number;
  row: number;
  /** 手機：捲動框的高＝頁首＋整數行（px）；整張筆錄的最小高＝按鈕列＋頁首＋5 行。 */
  h?: number;
  min?: number;
}

/**
 * whole：庭上那份在手機（CSS 在 ≤1023px 給 .record --rec-whole: 1）。框是看紙的視窗，
 * 框高收成頁首加整數行，捲動也對齊整行，不會有半行（或半條黑條）露在頁首下或框底（設計師 10-09）。
 * 這時筆錄外框的高由版面決定（court.css 的 contain: size），量外框不會跟著框高打轉。
 */
function useFit(box: RefObject<HTMLDivElement | null>, zh: boolean, fit: boolean, live: boolean) {
  const [size, setSize] = useState<Fit | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const root = el?.parentElement;
    if (!el || !root) return;
    const read = () => {
      const cs = getComputedStyle(el);
      const base = parseFloat(cs.getPropertyValue('--rec-base')) || 15;
      const scale = parseFloat(cs.getPropertyValue('--text-scale')) || 1;
      const whole = live && cs.getPropertyValue('--rec-whole').trim() === '1';
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const bar =
        el.previousElementSibling instanceof HTMLElement ? el.previousElementSibling : null;
      const barH = bar?.offsetHeight ?? 0;
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = (whole ? root.clientHeight - barH : el.clientHeight) - padY;
      if (w <= 0) return;
      const fs = Math.min(base * scale, w / (measureFor(zh) + paperX(zh)));
      const row = fit && h > 0 ? Math.max(fs * 1.5, Math.min(fs * 2, h / PAGE_ROWS)) : fs * 2;
      const r = (n: number) => Math.floor(n * 100) / 100;
      // 手機的行高取整數 px：每一行、每個捲動停點都落在整數上，頁首下與框底不會露出零點幾 px 的上一行。
      const next: Fit = { fs: r(fs), row: whole ? Math.ceil(row) : r(row) };
      if (whole) {
        next.h = Math.max(MIN_ROWS, Math.floor(h / next.row + 0.01)) * next.row;
        next.min = Math.ceil(barH + padY + MIN_ROWS * next.row);
      }
      setSize((s) =>
        s && s.fs === next.fs && s.row === next.row && s.h === next.h && s.min === next.min
          ? s
          : next,
      );
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(root);
    return () => ro.disconnect();
  }, [box, zh, fit, live]);
  return size;
}

// 「立即顯示全文」是玩家的偏好：按下去之後新的話直接整段出現，換場景、重開遊戲都記得。
const INSTANT = 'lawgame-record-instant';
function useInstant() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(INSTANT) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      if (v) localStorage.setItem(INSTANT, '1');
      else localStorage.removeItem(INSTANT);
    } catch {
      /* 無痕視窗存不了：這一場有效就好 */
    }
  };
  return [on, set] as const;
}

/** 一卷筆錄印在紙上的東西：卷號（頁首），以及第幾張紙的 Bates（頁首與頁尾都用這一個）。 */
export interface Volume {
  vol: number;
  bates: (sheet: number) => string;
}

/**
 * 筆錄的卷與 Bates（設定集第 9 章；計畫 p2-1/bates-plan.md）：卷＝這一集的第幾場庭審（含辯方證人）；
 * Bates 是本所序列，那一場頁段的第一頁加第幾張（engine/bates.ts）。紙上印的頁碼另外算，庭審從第 1 頁起。
 */
export function batesOf(p: Progress, sceneId: string): Volume {
  const ep = episodeOf(p);
  const at = ep.scenes.findIndex((s) => s.id === sceneId);
  const vol =
    ep.scenes
      .filter((s) => s.type === 'trial' || s.type === 'defense')
      .findIndex((s) => s.id === sceneId) + 1;
  return { vol: Math.max(1, vol), bates: (sheet) => batesAt(ep, at, sheet) };
}

/** 中文的刪節號、破折號、彎引號換回中文字型（寬度在 record.ts 已經照全形算）。 */
function punct(text: string) {
  if (!CJK_PUNCT.test(text)) return text;
  return text.split(/([…—“”‘’]+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="rec-cjk">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/**
 * 審判筆錄（設定集第 9 章 <Transcript>、10.3 異議）：一張一張 25 行的紙，左側行號，問／答，
 * 新的話逐行出現，「立即顯示全文」常駐。異議成立與刪除的證詞是黑條，不是刪除線；
 * 裁定是一枚靛藍小章蓋在異議那一行右邊，駁回時蓋在證詞上的黑條抽走。
 * 頁邊的目前行記號是筆錄層唯一的黃；每頁右下 Bates。
 *
 * from：只放第幾句之後（休庭頁的高潮段），行號照整份筆錄接續。
 * until：只放到第幾句之前（休庭頁折起來的前半段）。
 * live：庭上一邊進行一邊長的那份（逐行出現、翻到目前這一頁、紙張補滿 25 行）。
 * fit：框的高度由版面決定，行距收到一頁 25 行一次放得下（法庭左欄）。
 * bates：卷號與每頁的 Bates（batesOf）；不給就不印。
 */
export function CourtRecord({
  entries,
  from = 0,
  until = entries.length,
  live = false,
  fit = false,
  bates,
  className = '',
}: {
  entries: readonly RecordEntry[];
  from?: number;
  until?: number;
  live?: boolean;
  fit?: boolean;
  bates?: Volume;
  className?: string;
}) {
  const t = useT();
  const zh = useLang((s) => s.lang) === 'zh';
  // 裁定章在最後一行要留的寬：照章上的字最小 11px 時算（字級越小章越寬），各種寬度都放得下，
  // 行號也不會因為字級不同而跑掉。
  const granted = stampEm(t('成立', 'record'), zh, 11);
  const overruled = stampEm(t('駁回', 'record'), zh, 11);
  // 另一種語言的章寬：兩種語言排在同一套頁行上（見 useCourtEntries）。
  const other = zh ? 'en' : 'zh';
  const twinGranted = stampEm(tIn(other, '成立', 'record'), !zh, 11);
  const twinOverruled = stampEm(tIn(other, '駁回', 'record'), !zh, 11);
  const catalog = useCatalog((s) => s.n);
  const rows = useMemo(
    () =>
      layout(entries, measureFor(zh), zh, (r) => (r === '成立' ? granted : overruled), {
        measure: measureFor(!zh),
        zh: !zh,
        stamp: (r) => (r === '成立' ? twinGranted : twinOverruled),
      }),
    // catalog：英文表載好後章上的英文字才對。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, zh, granted, overruled, twinGranted, twinOverruled, catalog],
  );
  const shown = rows.filter((r) => r.entry >= from && r.entry < until);
  const box = useRef<HTMLDivElement>(null);
  const size = useFit(box, zh, live && fit, live);
  const [instant, setInstant] = useInstant();

  // 這一批新進來的話從第幾句開始（掛載時已經有的話不重播），以及這一次才被蓋上黑條的句子
  // （刪除證詞：之前沒蓋的，依序蓋上；設定集 7-3）。照 React 的「由 props 推導狀態」寫法，
  // 句子換了才更新，捲動、按「立即顯示全文」等重畫都不會把動畫打斷。
  const [snap, setSnap] = useState(() => ({
    entries,
    batch: entries.length,
    striking: [] as number[],
  }));
  if (snap.entries !== entries) {
    const before = snap.entries;
    const grew = entries.length > before.length;
    const struckBefore = new Set(before.flatMap((e, i) => (e.redact ? [i] : [])));
    const striking = entries.flatMap((e, i) =>
      e.redact && !struckBefore.has(i) && i < before.length ? [i] : [],
    );
    setSnap({
      entries,
      batch: grew ? before.length : snap.batch,
      striking: grew || striking.length ? striking : snap.striking,
    });
  }
  const batch = snap.batch;
  // 播到一半按「立即顯示全文」：這一批直接攤開，之後的也是。
  const [skipped, setSkipped] = useState(-1);
  const animate = live && !instant && skipped !== batch;
  const firstNew = rows.find((r) => r.entry >= batch)?.index ?? rows.length;
  const redactFrom = rows.find((r) => snap.striking.includes(r.entry))?.index ?? 0;
  const lastRowOf = (entry: number) => {
    let last = -1;
    for (const r of rows) if (r.entry === entry) last = r.index;
    return last;
  };

  // 新的一批進來：翻到最後一句所在的那一頁，從那頁的頁首放起；放不下就讓最後一行剛好在框底。
  // 頁首正好一行高、在第 1 行正上方，所以用第 1 行的位置往上推一行（手機的頁首是黏住的，量它會量到黏住的位置）。
  useEffect(() => {
    const el = box.current;
    const last = rows[rows.length - 1];
    if (!el || !live || !last || !size) return;
    const cs = getComputedStyle(el);
    const padT = parseFloat(cs.paddingTop);
    const padB = parseFloat(cs.paddingBottom);
    const top = el.getBoundingClientRect().top + el.clientTop;
    const y = (n: Element) => el.scrollTop + n.getBoundingClientRect().top - top;
    const head = rows.find((r) => r.page === last.page) ?? last;
    const headEl = el.querySelector(`[data-row="${head.index}"]`);
    const lastEl = el.querySelector(`[data-row="${last.index}"]`);
    let target = headEl ? y(headEl) - size.row - padT : 0;
    if (lastEl) {
      const bottom = y(lastEl) + size.row;
      if (bottom > target + el.clientHeight - padB) target = bottom - el.clientHeight + padB;
    }
    el.scrollTop = Math.max(0, target);
    // 只在句數或框變了的時候翻頁，不搶使用者往回翻的捲動位置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, live, size?.row, size?.h]);

  // 頁首、行號、Bates 是紙上印好的東西：用屬性交給 CSS 畫，不進文字內容，報讀與搜尋都只讀到證詞本身。
  // 每張頁首都帶卷、頁、Bates；手機上每張都黏在框頂，下一頁的頁首捲上來時蓋掉上一張，
  // 所以頁首上的頁碼永遠是它底下那幾行的頁（設計師 10-09）。
  // 庭審筆錄從第 1 頁起，紙上印的頁碼就是第幾張；節錄（證詞錄取）的起始頁是內容資料，Bates 照樣是第幾張。
  const pageHead = (page: number) => (
    <span
      className="rec-head"
      aria-hidden
      data-l={t('審判筆錄')}
      data-v={bates ? t('第 {n} 卷', { n: bates.vol }) : undefined}
      data-r={t('第 {n} 頁', { n: page })}
      data-b={bates?.bates(page)}
    />
  );
  const pageFoot = (page: number) =>
    bates && <span className="rec-foot" aria-hidden data-b={bates.bates(page)} />;

  // 依句子分段：一句話一個 <p>，報讀時整句念完；行號與換頁是裝飾。
  const groups: RecordRow[][] = [];
  for (const r of shown) {
    const g = groups[groups.length - 1];
    if (g && g[0].entry === r.entry) g.push(r);
    else groups.push([r]);
  }
  // 庭上的那份把這一頁補滿 25 行：行號是紙上印好的，還沒寫到的行也在。還沒開口時是一張空白的第 1 頁。
  const last = shown[shown.length - 1];
  const upTo = last?.line ?? 0;
  const pad =
    live && upTo < ROWS_PER_PAGE
      ? Array.from({ length: ROWS_PER_PAGE - upTo }, (_, i) => upTo + i + 1)
      : [];
  const labelW = (label: string) => textWidth(t(label), zh) * 0.75 + 1.2;
  // 目前行：庭上那份的最後一行，跟著那一行一起出現。
  // 句尾為了對齊另一種語言補的空行不算（見 useCourtEntries）。
  const current = live ? ([...shown].reverse().find((r) => r.text) ?? last)?.index : undefined;
  const fresh = (i: number) => animate && i >= firstNew;

  return (
    <div
      className={`lines transcript record${live ? ' live' : ''} ${className}`}
      style={
        size
          ? ({
              '--rec-fs': `${size.fs}px`,
              '--rec-row': `${size.row}px`,
              minHeight: size.min,
            } as CSSProperties)
          : undefined
      }
    >
      {live && (
        <div className="rec-bar-top">
          <button
            type="button"
            className="rec-skip"
            aria-pressed={instant}
            onClick={() => {
              setInstant(!instant);
              setSkipped(batch);
            }}
          >
            {t('立即顯示全文')}
          </button>
        </div>
      )}
      <div
        className="rec-scroll"
        ref={box}
        aria-live={live ? 'polite' : undefined}
        style={size?.h ? { height: size.h, flex: 'none' } : undefined}
      >
        <div className="rec-paper">
          {(shown[0] || live) && pageHead(shown[0]?.page ?? 1)}
          {groups.map((g) => {
            const e = entries[g[0].entry];
            const label = e.redact ? t(e.redact) : '';
            const endRow = g[g.length - 1].index;
            // 裁定章蓋在有字的最後一行，不蓋在句尾補的空行上。
            const textEnd = ([...g].reverse().find((r) => r.text) ?? g[g.length - 1]).index;
            // 章在法官那一句出現之後落下（打字 → 一刀黑 → 法官的沉默 → 小章）；黑條在章落下後抽走。
            const benchEnd = lastRowOf(g[0].entry + 1);
            const stampK = (benchEnd >= 0 ? benchEnd : endRow) - firstNew + 1;
            const unbarK = lastRowOf(g[0].entry - 1) - firstNew + 1;
            return (
              <p key={g[0].entry} className={`rec-entry ${e.kind}`}>
                {e.redact && <span className="sr-only">{t('（{text}）', { text: label })}</span>}
                {g.map((r) => {
                  const isNew = fresh(r.index);
                  const bar = !!e.redact && snap.striking.includes(r.entry);
                  const style = {
                    '--indent': `${r.indent}em`,
                    '--k': isNew ? r.index - firstNew : bar ? r.index - redactFrom : 0,
                    '--w': `${Math.max(r.width, r.first && label ? labelW(e.redact!) : 0)}em`,
                    '--ks': stampK,
                    '--ku': unbarK,
                  } as CSSProperties;
                  return (
                    <span key={r.index} className="rec-line">
                      {r.line === 1 && r.index > 0 && r !== shown[0] && (
                        <span className="rec-break" aria-hidden>
                          {pageHead(r.page)}
                        </span>
                      )}
                      <span
                        className={`rec-row${isNew ? ' new' : ''}${e.redact ? ' redacted' : ''}${bar ? ' striking' : ''}${r.index === current ? ' cur' : ''}`}
                        data-row={r.index}
                        data-no={r.line}
                        style={style}
                      >
                        {r.first && e.tag && <b className="rec-tag">{e.tag} </b>}
                        {e.redact ? (
                          (r.text || r.first) && (
                            <span className="rec-bar" aria-hidden>
                              {r.first && <small>{label}</small>}
                            </span>
                          )
                        ) : (
                          <span className="rec-tx">
                            {zh ? punct(r.text) : r.text}
                            {/* 駁回：證人照答，蓋在這句上的黑條在章落下後抽走（只在剛發生的那一刻）。 */}
                            {e.unbar && isNew && <span className="rec-unbar" aria-hidden />}
                          </span>
                        )}
                        {r.space && ' '}
                        {e.ruling && r.index === textEnd && (
                          <span
                            className={`stamp sm rec-stamp${isNew ? ' new' : ''}${
                              // 這一行已經寫到紙邊、章放不下：章貼著紙的右緣蓋，壓到句尾也不出紙（第一道關卡：英文 SUSTAINED 出界）。
                              r.indent +
                                (r.first && e.tag ? textWidth(e.tag, zh) + 0.6 : 0) +
                                r.width +
                                stampEm(t(e.ruling, 'record'), zh, size?.fs ?? 15) >
                              measureFor(zh)
                                ? ' tight'
                                : ''
                            }`}
                            role="img"
                            aria-label={t(e.ruling, 'record')}
                            // 每枚章轉的角度不一樣（±3°），照句子算，重畫不會跳。
                            style={{ '--rot': `${((g[0].entry * 5) % 7) - 3}deg` } as CSSProperties}
                          >
                            <b>{t(e.ruling, 'record')}</b>
                          </span>
                        )}
                      </span>
                      {r.line === ROWS_PER_PAGE && pageFoot(r.page)}
                    </span>
                  );
                })}
              </p>
            );
          })}
          {pad.length > 0 && (
            <span className="rec-pad" aria-hidden>
              {pad.map((n) => (
                <span key={n} className="rec-row empty" data-no={n} />
              ))}
              {pageFoot(last?.page ?? 1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
