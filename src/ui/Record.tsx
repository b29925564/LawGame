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
import { cssOf, objectionBeat, tokensFrom, type ObjectionBeat, type Tok } from './court/beat';
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
  type Cue,
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
      return {
        kind: kinds[i],
        who: l.who,
        ...say(l, i, lang),
        redact,
        ...rulings[i],
        twin: say(l, i, other),
      };
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
 * onBeat：新進來的這一批有律師的異議時，交出這一拍的節拍表（鏡頭和輸入鎖照它走，第 10.3 章）。
 * beat：這一拍還在進行（頁邊的目前行記號換成黃，這時畫面上沒有主按鈕）。
 * cover：手機上鏡頭插進來蓋住筆錄底部多少 px：最新那一行要捲到它上面（設計師 P3 裁定）。
 * onCues：字幕列要放的句子與出現時間（鏡頭裡的人：證人與法官；設定集 10.1）。
 */
export function CourtRecord({
  entries,
  from = 0,
  until = entries.length,
  live = false,
  fit = false,
  bates,
  className = '',
  onBeat,
  beat: beatOn = false,
  cover = null,
  onCues,
}: {
  entries: readonly RecordEntry[];
  from?: number;
  until?: number;
  live?: boolean;
  fit?: boolean;
  bates?: Volume;
  className?: string;
  onBeat?: (beat: ObjectionBeat, read: (tok: Tok) => number) => void;
  beat?: boolean;
  cover?: HTMLElement | null;
  onCues?: (cues: Cue[]) => void;
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
  const paper = useRef<HTMLDivElement>(null);
  // 手機插入鏡頭打開時：紙的底邊停在鏡頭標籤的上緣，對齊行距，最後露出的是完整的一行（設計師 #247 第二輪）。
  const [cut, setCut] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    const out = paper.current;
    if (!cover || !el || !out || !size) {
      setCut(0);
      return;
    }
    const r = el.getBoundingClientRect();
    const padT = parseFloat(getComputedStyle(el).paddingTop) + el.clientTop;
    const rows = Math.max(
      0,
      Math.floor((cover.getBoundingClientRect().top - r.top - padT) / size.row),
    );
    setCut(
      Math.max(
        0,
        Math.round(out.getBoundingClientRect().bottom - (r.top + padT + rows * size.row)),
      ),
    );
  }, [cover, size]);

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
  // 這一批有律師的異議：整批照異議那一拍排（打字 → 黑條蓋上問題 → 一刀黑 → 法官的沉默 → 小章）。
  // 被異議的是前一句，早就在紙上；成立時它蓋上黑條留著，駁回時蓋上再抽走。
  const beat = useMemo(() => {
    if (!live) return null;
    const o = entries.findIndex((e, i) => i >= batch && e.ruling);
    if (o < 0) return null;
    const count = (f: (entry: number) => boolean) =>
      rows.filter((r) => r.entry >= batch && f(r.entry)).length;
    const t = objectionBeat(entries[o].ruling === '成立', {
      objection: count((x) => x <= o),
      judge: count((x) => x === o + 1),
      rest: count((x) => x > o + 1),
    });
    return { o, asked: o - 1, t };
  }, [live, entries, batch, rows]);
  // 一批只交一次（英文表載好重排時不重來）。
  const told = useRef(batch);
  useEffect(() => {
    if (!beat || told.current === batch) return;
    told.current = batch;
    onBeat?.(beat.t, tokensFrom(box.current ?? document.documentElement));
  });
  // 每一行從哪個時間點開始逐行出現：異議那一拍裡，法官的話等章落下、駁回後的回答等切回證人。
  const blockOf = (entry: number) =>
    !beat || entry <= beat.o
      ? { at: '0s', from: firstNew }
      : entry === beat.o + 1
        ? { at: cssOf(beat.t.judge), from: rows.find((r) => r.entry === entry)?.index ?? firstNew }
        : {
            at: cssOf(beat.t.rest),
            from: rows.find((r) => r.entry > beat.o + 1)?.index ?? firstNew,
          };
  // 刪除證詞的黑條：法官那句裁定打完才開始，照這一頁由上往下一行接一行蓋上（設定集 7-3）。
  // 只數這一頁上被蓋的行，前面幾頁看不到、直接蓋好；一頁蓋滿最多六拍，不讓最後幾行等好幾秒
  // （第一道關卡重跑 Q1：第 2 頁的「答」整整空白了五、六秒，看起來像沒蓋上黑條）。
  const lastPage = rows[rows.length - 1]?.page;
  const striking = snap.striking.filter((i) => i !== beat?.asked);
  const strikingHere = rows.filter(
    (r) => r.page === lastPage && (r.text || r.first) && striking.includes(r.entry),
  );
  const strikeStep = Math.min(1, 6 / Math.max(1, strikingHere.length));
  const strikeAfter = rows.length - firstNew;

  // 字幕列：這一批裡鏡頭拍得到的人說的話（證人、法官），在它第一行打出來的那一刻出現，留到下一句。
  // 律師在鏡頭外，問句只在筆錄上（玩家剛選的問題不再閃一次）。這一批沒有就留最後一句，不重播。
  const inShot = (e: RecordEntry) => e.kind === 'a' || e.who === JUDGE;
  const cues = useMemo<Cue[]>(() => {
    if (!live || !onCues) return [];
    const at = (i: number) => {
      const first = rows.find((r) => r.entry === i);
      if (!animate || !first || i < batch) return '0s';
      const b = blockOf(i);
      return `calc(${b.at} + ${first.index - b.from} * var(--dur-ui))`;
    };
    const cue = (e: RecordEntry, i: number): Cue => ({
      key: `${i}`,
      who: e.who ?? '',
      text: e.text,
      redact: e.redact,
      at: at(i),
      span: rows.filter((r) => r.entry === i).length,
    });
    // 字幕留到下一句開始為止：下一句是鏡頭外的人（律師的問句、旁白）就收成空，不讓上一句看起來像在答新問題（設計師 #257）。
    const fresh = entries.flatMap((e, i) =>
      i < batch
        ? []
        : [inShot(e) ? cue(e, i) : { ...cue(e, i), text: '', redact: undefined, blank: true }],
    );
    if (fresh.length) return fresh;
    const last = entries.length - 1;
    return last >= 0 && inShot(entries[last]) ? [{ ...cue(entries[last], last), at: '0s' }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, entries, batch, rows, animate, beat]);
  const cueKey = cues.map((c) => `${c.key}|${c.at}|${c.redact ?? ''}|${c.text}`).join('\n');
  useEffect(() => {
    onCues?.(cues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey]);

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
      // 鏡頭插進來時，框底被蓋住的那段不算看得到。
      const bottom = y(lastEl) + size.row;
      const hidden = cover
        ? Math.max(0, el.getBoundingClientRect().bottom - cover.getBoundingClientRect().top)
        : 0;
      const seen = el.clientHeight - padB - hidden;
      if (bottom > target + seen) target = bottom - seen;
    }
    el.scrollTop = Math.max(0, target);
    // 只在句數、框或鏡頭變了的時候翻頁，不搶使用者往回翻的捲動位置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, live, size?.row, size?.h, cover]);

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
  // 異議那一拍裡記號停在異議那一行（第 10.3 章：這一格唯一的黃），整拍走完才移到最後一行。
  const lastText = (rs: RecordRow[]) => [...rs].reverse().find((r) => r.text) ?? rs[rs.length - 1];
  const current = !live
    ? undefined
    : beatOn && beat
      ? lastText(shown.filter((r) => r.entry === beat.o))?.index
      : lastText(shown)?.index;
  const fresh = (i: number) => animate && i >= firstNew;

  return (
    <div
      ref={paper}
      className={`lines transcript record${live ? ' live' : ''} ${className}`}
      data-beat={beatOn || undefined}
      data-cut={cut > 0 || undefined}
      style={
        size
          ? ({
              '--rec-fs': `${size.fs}px`,
              '--rec-row': `${size.row}px`,
              '--rec-cut': `${cut}px`,
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
            // 裁定章蓋在有字的最後一行，不蓋在句尾補的空行上。
            const textEnd = ([...g].reverse().find((r) => r.text) ?? g[g.length - 1]).index;
            const block = blockOf(g[0].entry);
            // 異議那一拍裡被異議的問題：成立時蓋上黑條留著，駁回時蓋上再抽走（只在剛發生的那一刻）。
            const objected = animate && beat?.asked === g[0].entry ? beat.t : null;
            return (
              <p key={g[0].entry} className={`rec-entry ${e.kind}`}>
                {e.redact && <span className="sr-only">{t('（{text}）', { text: label })}</span>}
                {g.map((r) => {
                  const isNew = fresh(r.index);
                  const bar = animate && !!e.redact && striking.includes(r.entry);
                  const style = {
                    '--indent': `${r.indent}em`,
                    '--at0': isNew ? block.at : undefined,
                    '--k': isNew ? r.index - block.from : 0,
                    '--kr': bar ? Math.max(0, strikingHere.indexOf(r)) * strikeStep : 0,
                    '--kr0': strikeAfter,
                    '--w': `${Math.max(r.width, r.first && label ? labelW(e.redact!) : 0)}em`,
                    // 章：照節拍表落在法官的沉默之後；不在異議那一拍裡（不會發生）就等前面的行出完。
                    '--ats':
                      e.ruling && isNew
                        ? cssOf(beat?.o === r.entry ? beat.t.stamp : { ui: r.index - firstNew + 1 })
                        : undefined,
                    '--atb': objected ? cssOf(objected.bar) : undefined,
                    '--atl': objected ? cssOf(objected.stamp) : undefined,
                    '--atu': objected?.unbar ? cssOf(objected.unbar) : undefined,
                  } as CSSProperties;
                  return (
                    <span key={r.index} className="rec-line">
                      {r.line === 1 && r.index > 0 && r !== shown[0] && (
                        <span className="rec-break" aria-hidden>
                          {pageHead(r.page)}
                        </span>
                      )}
                      <span
                        className={`rec-row${isNew ? ' new' : ''}${e.redact ? ' redacted' : ''}${bar ? ' striking' : ''}${objected ? ' objected' : ''}${r.index === current ? ' cur' : ''}`}
                        data-row={r.index}
                        data-no={r.line}
                        style={style}
                      >
                        {r.first && e.tag && <b className="rec-tag">{e.tag} </b>}
                        {e.redact && (bar || objected) && (r.text || r.first) ? (
                          // 正在蓋的這一行：話先留在紙上，黑條從左邊蓋過去（看得到被刪的是哪一句）。
                          // 異議成立時條上的「異議成立」等章落下才出現。
                          <span className="rec-under" aria-hidden>
                            <span className="rec-tx">{zh ? punct(r.text) : r.text}</span>
                            <span className="rec-bar">{r.first && <small>{label}</small>}</span>
                          </span>
                        ) : e.redact ? (
                          (r.text || r.first) && (
                            <span className="rec-bar" aria-hidden>
                              {r.first && <small>{label}</small>}
                            </span>
                          )
                        ) : (
                          <span className="rec-tx">
                            {zh ? punct(r.text) : r.text}
                            {/* 駁回：「異議」打完時蓋上這個問題的黑條，在法官說完後從右邊抽走。 */}
                            {e.unbar && objected && r.text && (
                              <span className="rec-unbar" aria-hidden />
                            )}
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
