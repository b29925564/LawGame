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
import { episodeOf } from '../engine/game';
import type { Progress } from '../engine/save';
import { useLang, useT } from '../i18n';
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
 */
export function useCourtEntries(
  log: readonly { who: string; text: string; struck?: boolean }[],
  witness: string,
  stricken = false,
): RecordEntry[] {
  const t = useT();
  const scope = useScope();
  const en = useLang((s) => s.lang) === 'en';
  // 法庭狀態每次重畫都是重新推出來的新陣列：用內容當 key，句子沒變就沿用同一份筆錄。
  const key = log.map((l) => `${l.who}\u0002${l.text}\u0002${l.struck ? 1 : 0}`).join('\u0001');
  return useMemo(() => {
    const kinds = kindsOf(log, witness, { judge: JUDGE, narrator: NARRATOR });
    const rulings = rulingsOf(log, { lawyer: YOU, judge: JUDGE, witness });
    return log.map((l, i) => {
      const kind = kinds[i];
      const name = t(SPEAKER[l.who] ?? l.who, 'record');
      const tag =
        kind === 'q'
          ? t('問', 'record')
          : kind === 'a'
            ? t('答', 'record')
            : kind === 'say'
              ? en
                ? `${name.toUpperCase()}:`
                : `${name}：`
              : '';
      const text = t(l.text, scope);
      const redact: Redaction | undefined = l.struck
        ? '異議成立'
        : stricken && l.who === witness
          ? '已自紀錄刪除'
          : undefined;
      // 旁白寫進筆錄是括號裡的說明；本來就有括號的不再包一層。
      const note = kind === 'note' && !/^[（(]/.test(text);
      return { kind, tag, text: note ? t('（{text}）', { text }) : text, redact, ...rulings[i] };
    });
    // t 每次重畫都是新的函式；跟著語言變就好。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, witness, stricken, scope, en]);
}

// 紙的左右（em）：行號欄＋雙直線＋內距、右內距，再留 0.3em 給還沒載完的退回字型。
const PAPER_X = 3 + 0.6 + 0.3;
// 一頁的高（行）：頁首一行、25 行、Bates 一行，再加紙底的內距。
const PAGE_ROWS = ROWS_PER_PAGE + 2.4;

/**
 * 字級與行距跟著框算：一行的字數固定（measureFor），所以字級＝框寬 ÷ 一行的 em，
 * 最大是 CSS 的 --rec-base（桌機 15、手機中文 14、英文 13）。
 * fit：框是版面給的固定高度（庭上的那份），行距收到一整頁 25 行剛好放得下，最密 1.5 倍、最鬆 2 倍。
 */
function useFit(box: RefObject<HTMLDivElement | null>, zh: boolean, fit: boolean) {
  const [size, setSize] = useState<{ fs: number; row: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(el);
      const base = parseFloat(cs.getPropertyValue('--rec-base')) || 15;
      const scale = parseFloat(cs.getPropertyValue('--text-scale')) || 1;
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w <= 0) return;
      const fs = Math.min(base * scale, w / (measureFor(zh) + PAPER_X));
      const row = fit && h > 0 ? Math.max(fs * 1.5, Math.min(fs * 2, h / PAGE_ROWS)) : fs * 2;
      const r = (n: number) => Math.floor(n * 100) / 100;
      setSize((s) => (s && s.fs === r(fs) && s.row === r(row) ? s : { fs: r(fs), row: r(row) }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, zh, fit]);
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

/**
 * 筆錄每頁右下的 Bates（設定集第 9 章）：本事務所留存的那份＝WH-，集數，T＝庭審筆錄第幾卷（這一集的第幾場庭審）。
 * 全域唯一的編號表歸 遊戲系統（差距表 P2-1）；筆錄用自己的 T 系列，不會撞號。
 */
export function batesOf(p: Progress, sceneId: string): string {
  const ep = episodeOf(p);
  const vol =
    ep.scenes
      .filter((s) => s.type === 'trial' || s.type === 'defense')
      .findIndex((s) => s.id === sceneId) + 1;
  return `WH-E${String(ep.number).padStart(2, '0')}-T${Math.max(1, vol)}-`;
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
 * bates：每頁右下的編號前綴（batesOf）；不給就不印。
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
  bates?: string;
  className?: string;
}) {
  const t = useT();
  const zh = useLang((s) => s.lang) === 'zh';
  const rows = useMemo(() => layout(entries, measureFor(zh), zh), [entries, zh]);
  const shown = rows.filter((r) => r.entry >= from && r.entry < until);
  const box = useRef<HTMLDivElement>(null);
  const size = useFit(box, zh, live && fit);
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

  // 新的一批進來：翻到最後一句所在的那一頁（一頁放得下時整頁對齊；放不下就讓最後一句剛好在底）。
  useEffect(() => {
    const el = box.current;
    const last = rows[rows.length - 1];
    if (!el || !live || !last) return;
    const top = el.getBoundingClientRect().top;
    const y = (n: Element) => el.scrollTop + n.getBoundingClientRect().top - top;
    const page = el.querySelector(`[data-page="${last.page}"]`);
    const lastEl = el.querySelector(`[data-row="${last.index}"]`);
    let target = page ? y(page) : 0;
    if (lastEl) {
      const bottom = y(lastEl) + lastEl.getBoundingClientRect().height;
      if (bottom > target + el.clientHeight) target = bottom - el.clientHeight + 8;
    }
    el.scrollTop = target;
    // 只在句數或行距變了的時候翻頁，不搶使用者往回翻的捲動位置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, live, size?.row]);

  // 頁首、行號、Bates 是紙上印好的東西：用屬性交給 CSS 畫，不進文字內容，報讀與搜尋都只讀到證詞本身。
  const pageHead = (page: number, first = false) => (
    <span
      className="rec-head"
      aria-hidden
      data-page={first ? page : undefined}
      data-l={t('審判筆錄')}
      data-r={t('第 {n} 頁', { n: page })}
    />
  );
  const pageFoot = (page: number) =>
    bates && (
      <span className="rec-foot" aria-hidden data-b={`${bates}${String(page).padStart(4, '0')}`} />
    );

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
  const current = live ? last?.index : undefined;
  const fresh = (i: number) => animate && i >= firstNew;

  return (
    <div
      className={`lines transcript record ${className}`}
      style={
        size
          ? ({ '--rec-fs': `${size.fs}px`, '--rec-row': `${size.row}px` } as CSSProperties)
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
      <div className="rec-scroll" ref={box} aria-live={live ? 'polite' : undefined}>
        <div className="rec-paper">
          {(shown[0] || live) && pageHead(shown[0]?.page ?? 1, true)}
          {groups.map((g) => {
            const e = entries[g[0].entry];
            const label = e.redact ? t(e.redact) : '';
            const endRow = g[g.length - 1].index;
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
                        <span className="rec-break" aria-hidden data-page={r.page}>
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
                          <span className="rec-bar" aria-hidden>
                            {r.first && <small>{label}</small>}
                          </span>
                        ) : (
                          <span className="rec-tx">
                            {zh ? punct(r.text) : r.text}
                            {/* 駁回：證人照答，蓋在這句上的黑條在章落下後抽走（只在剛發生的那一刻）。 */}
                            {e.unbar && isNew && <span className="rec-unbar" aria-hidden />}
                          </span>
                        )}
                        {r.space && ' '}
                        {e.ruling && r.index === endRow && (
                          <span
                            className={`stamp sm rec-stamp${isNew ? ' new' : ''}`}
                            role="img"
                            aria-label={t(e.ruling, 'record')}
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
