import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JUDGE, YOU } from '../engine/episode/trial';
import { useLang, useT } from '../i18n';
import { useScope } from './lang';
import {
  CJK_PUNCT,
  kindsOf,
  layout,
  MEASURE,
  ROWS_PER_PAGE,
  textWidth,
  type RecordEntry,
  type RecordRow,
  type Redaction,
} from './record';
import './court.css';

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
      return { kind, tag, text: note ? t('（{text}）', { text }) : text, redact };
    });
    // t 每次重畫都是新的函式；跟著語言變就好。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, witness, stricken, scope, en]);
}

/** 量紙上一行放得下幾個 em：行號欄外的寬 ÷ 字級。寬度變了才重排。 */
function useMeasure() {
  const probe = useRef<HTMLSpanElement>(null);
  const [measure, setMeasure] = useState(MEASURE);
  useLayoutEffect(() => {
    const el = probe.current;
    if (!el) return;
    const read = () => {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 15;
      const w = el.getBoundingClientRect().width;
      // 留 0.3em：字型還沒載完時退回的等寬字可能略寬。
      if (w > 0) setMeasure(Math.max(8, Math.min(MEASURE, Math.floor((w / fs - 0.3) * 10) / 10)));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { probe, measure };
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
 * 審判筆錄（設定集第 9 章 <Transcript>）：一張一張 25 行的紙，左側行號，問／答，
 * 新的話逐行出現，可以按「立即顯示全文」。異議成立與刪除的證詞是黑條，不是刪除線。
 *
 * from：只放第幾句之後（休庭頁的高潮段），行號照整份筆錄接續。
 * until：只放到第幾句之前（休庭頁折起來的前半段）。
 * live：庭上一邊進行一邊長的那份（逐行出現、自動捲動、紙張補滿 25 行）。
 */
export function CourtRecord({
  entries,
  from = 0,
  until = entries.length,
  live = false,
  className = '',
}: {
  entries: readonly RecordEntry[];
  from?: number;
  until?: number;
  live?: boolean;
  className?: string;
}) {
  const t = useT();
  const zh = useLang((s) => s.lang) === 'zh';
  const { probe, measure } = useMeasure();
  const rows = useMemo(() => layout(entries, measure, zh), [entries, measure, zh]);
  const shown = rows.filter((r) => r.entry >= from && r.entry < until);
  const box = useRef<HTMLDivElement>(null);

  // 這一批新進來的話從第幾句開始（掛載時已經有的話不重播），以及這一次才被蓋上黑條的句子
  // （刪除證詞：之前沒蓋的，依序蓋上；設定集 7-3）。照 React 的「由 props 推導狀態」寫法，
  // 句子換了才更新，捲動、展開「立即顯示全文」等重畫都不會把動畫打斷。
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
  const [skipped, setSkipped] = useState(-1);
  const [revealing, setRevealing] = useState(false);
  const animate = live && skipped !== batch;
  const firstNew = rows.find((r) => r.entry >= batch)?.index ?? rows.length;
  const lastNew = rows.length - 1;
  const redactFrom = rows.find((r) => snap.striking.includes(r.entry))?.index ?? 0;

  // 新的一批進來：捲到第一句新的，舊的往上留著；掛載時捲到最後一句。
  const mounted = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el || !live) return;
    const target = el.querySelector<HTMLElement>(
      `[data-row="${mounted.current ? firstNew : Math.max(0, rows.length - 1)}"]`,
    );
    if (target) {
      const off = target.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTop = mounted.current
        ? el.scrollTop + off - 12
        : el.scrollTop + off + target.offsetHeight - el.clientHeight + 24;
    }
    if (mounted.current && entries.length > batch) setRevealing(true);
    mounted.current = true;
    // 只在句數變了的時候捲；排版寬度變了不搶使用者的捲動位置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, live]);

  // 頁首與行號是紙上印好的東西：用屬性交給 CSS 畫，不進文字內容，報讀與搜尋都只讀到證詞本身。
  const pageHead = (page: number) => (
    <span
      className="rec-head"
      aria-hidden
      data-l={t('審判筆錄')}
      data-r={t('第 {n} 頁', { n: page })}
    />
  );

  // 依句子分段：一句話一個 <p>，報讀時整句念完；行號與換頁是裝飾。
  const groups: RecordRow[][] = [];
  for (const r of shown) {
    const g = groups[groups.length - 1];
    if (g && g[0].entry === r.entry) g.push(r);
    else groups.push([r]);
  }
  const last = shown[shown.length - 1];
  const pad =
    live && last && last.line < ROWS_PER_PAGE
      ? Array.from({ length: ROWS_PER_PAGE - last.line }, (_, i) => last.line + i + 1)
      : [];
  const labelW = (label: string) => textWidth(t(label), zh) * 0.75 + 1.2;

  return (
    <div
      className={`lines transcript record ${className}`}
      aria-live={live ? 'polite' : undefined}
      ref={box}
      onAnimationEnd={(e) => {
        if ((e.target as HTMLElement).dataset.row === String(lastNew)) setRevealing(false);
      }}
    >
      <div
        className="rec-paper"
        data-measure={measure}
        style={{ '--rec-measure': MEASURE } as CSSProperties}
      >
        <span className="rec-probe" ref={probe} aria-hidden />
        {shown[0] && pageHead(shown[0].page)}
        {groups.map((g) => {
          const e = entries[g[0].entry];
          const label = e.redact ? t(e.redact) : '';
          return (
            <p key={g[0].entry} className={`rec-entry ${e.kind}`}>
              {e.redact && <span className="sr-only">{t('（{text}）', { text: label })}</span>}
              {g.map((r) => {
                const fresh = animate && r.index >= firstNew;
                const bar = !!e.redact && snap.striking.includes(r.entry);
                const style = {
                  '--indent': `${r.indent}em`,
                  '--k': fresh ? r.index - firstNew : bar ? r.index - redactFrom : 0,
                  '--w': `${Math.max(r.width, r.first && label ? labelW(e.redact!) : 0)}em`,
                } as CSSProperties;
                return (
                  <span key={r.index} className="rec-line">
                    {r.line === 1 && r.index > 0 && r !== shown[0] && (
                      <span className="rec-break" aria-hidden>
                        {pageHead(r.page)}
                      </span>
                    )}
                    <span
                      className={`rec-row${fresh ? ' new' : ''}${e.redact ? ' redacted' : ''}${bar ? ' striking' : ''}`}
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
                        <span className="rec-tx">{zh ? punct(r.text) : r.text}</span>
                      )}
                      {r.space && ' '}
                    </span>
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
          </span>
        )}
      </div>
      {live && revealing && animate && (
        <button
          type="button"
          className="rec-skip"
          onClick={() => {
            setSkipped(batch);
            setRevealing(false);
          }}
        >
          {t('立即顯示全文')}
        </button>
      )}
    </div>
  );
}
