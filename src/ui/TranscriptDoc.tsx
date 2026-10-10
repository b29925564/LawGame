import { useEffect, useMemo, type CSSProperties } from 'react';
import { straight } from '../i18n/curly';
import { preload, tIn, useCatalog, useLang, useT, type Lang } from '../i18n';
import { useScope } from './lang';
import { layout, measureFor, ROWS_PER_PAGE, type RecordEntry } from './record';
import { punct } from './Record';

/**
 * 卷宗裡的錄取逐字稿：和證人準備夾在卡後的影本、庭上的筆錄用同一套排版（record.ts layout），
 * 所以同一句話在每個畫面都落在同一頁同一行。紙是一整頁 25 行：頁首（類別與頁碼）、行號、頁尾 Bates，
 * 節錄以外的行是空的。每一句仍然是一顆按鈕：點一下標記，命中關鍵事實才成卡。
 */
export function TranscriptDoc({
  lines,
  page,
  line,
  bates,
  made,
  noted,
  onPick,
}: {
  lines: readonly { text: string }[];
  /** 第一句落在第幾頁第幾行（劇本資料）。 */
  page: number;
  line: number;
  bates: string;
  made: (i: number) => boolean;
  noted: (i: number) => boolean;
  onPick: (i: number) => void;
}) {
  const t = useT();
  const scope = useScope();
  const lang = useLang((s) => s.lang);
  const catalog = useCatalog((s) => s.n);
  const zh = lang === 'zh';
  // 兩種語言排在同一套頁行上：另一種語言的字表要先載好。
  useEffect(preload, []);
  const { entries, rows } = useMemo(() => {
    const other: Lang = zh ? 'en' : 'zh';
    const say = (zhText: string, in_: Lang) => {
      const m = /^([問答])[：:]\s*/.exec(zhText);
      return {
        tag: m ? tIn(in_, m[1], 'record') : '',
        // 筆錄是 Courier Prime 的打字稿：引號維持直的。
        text: straight(tIn(in_, m ? zhText.slice(m[0].length) : zhText, scope)),
      };
    };
    const entries: RecordEntry[] = lines.map((l) => {
      const q = l.text.startsWith('問');
      const a = l.text.startsWith('答');
      return { kind: q ? 'q' : a ? 'a' : 'note', ...say(l.text, lang), twin: say(l.text, other) };
    });
    const rows = layout(entries, measureFor(zh), zh, () => 0, {
      measure: measureFor(!zh),
      zh: !zh,
      stamp: () => 0,
    });
    return { entries, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, lang, scope, catalog]);

  // 整份筆錄的第幾行（從 0 起）：頁碼與行號由這裡算，每一頁補滿 25 行。
  const base = (page - 1) * ROWS_PER_PAGE + (line - 1);
  const firstPage = Math.floor(base / ROWS_PER_PAGE) + 1;
  const lastPage = Math.floor((base + rows.length - 1) / ROWS_PER_PAGE) + 1;
  const out = [];
  for (let p = firstPage; p <= lastPage; p++) {
    out.push(
      <span key={`s${p}`} className="sr-only">
        {t('本節錄只附第 {a}–{b} 行', {
          a: Math.max(1, base - (p - 1) * ROWS_PER_PAGE + 1),
          b: Math.min(ROWS_PER_PAGE, base + rows.length - (p - 1) * ROWS_PER_PAGE),
        })}
      </span>,
      <span
        key={`h${p}`}
        className="rec-head"
        aria-hidden
        data-l={t('錄取筆錄')}
        data-r={t('第 {n} 頁', { n: p })}
      />,
    );
    let n = 1;
    while (n <= ROWS_PER_PAGE) {
      const r = rows[(p - 1) * ROWS_PER_PAGE + n - 1 - base];
      if (!r) {
        // 節錄以外的行有字、只是玩家還沒拿到：黑條，長短固定地錯開，不寫字。
        const w = (measureFor(zh) * (0.6 + (0.4 * ((n * 7 + p * 3) % 10)) / 9)).toFixed(1);
        out.push(
          <span key={`${p}.${n}`} className="rec-row empty" aria-hidden data-no={n}>
            <span className="rec-bar" style={{ '--w': `${w}em` } as CSSProperties} />
          </span>,
        );
        n++;
        continue;
      }
      // 同一句落在這一頁的行，收進同一顆按鈕。
      const run = rows.filter(
        (x) => x.entry === r.entry && Math.floor((base + x.index) / ROWS_PER_PAGE) + 1 === p,
      );
      const e = r.entry;
      const key = `${p}.${n}`;
      out.push(
        <p key={key} className={`rec-entry ${entries[e].kind}`}>
          <button
            className={made(e) ? 'sentence made' : noted(e) ? 'sentence noted' : 'sentence'}
            aria-pressed={made(e) || noted(e)}
            onClick={() => onPick(e)}
          >
            {made(e) && <span className="sr-only">{t('已成卡')}</span>}
            {run.map((x, k) => (
              <span key={x.index} className="rec-line">
                <span
                  className="rec-row"
                  data-no={n + k}
                  style={{ '--indent': `${x.indent}em` } as CSSProperties}
                >
                  {x.first && entries[e].tag && <b className="rec-tag">{entries[e].tag} </b>}
                  <span className="rec-tx">{zh ? punct(x.text) : x.text}</span>
                  {x.space && ' '}
                </span>
              </span>
            ))}
          </button>
        </p>,
      );
      n += run.length;
    }
    out.push(<span key={`f${p}`} className="rec-foot" aria-hidden data-b={bates} />);
  }
  return (
    <div className="doc-record-box">
      <div className="record full doc-record">
        <div className="rec-paper">{out}</div>
      </div>
    </div>
  );
}
