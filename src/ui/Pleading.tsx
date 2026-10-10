import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MotionAttempt } from '../engine/episode/desk';
import type { Motion } from '../engine/episode/schema';
import { useT } from '../i18n';
import { useScope } from './lang';
import { prose } from './prose';
import { useCaseTerms } from './terms';

/** 證物格的編號：①②③。 */
export const exhibitNo = (i: number) => String.fromCharCode(0x2460 + i);

/** 一張證物在狀紙上的樣子：列內證物標籤，論點前面放 ◆。 */
export function ExhibitTag({ name, arg }: { name: string; arg: boolean }) {
  return (
    <span className={arg ? 'etag row arg' : 'etag row'}>
      <span aria-hidden className="etag-hole" />
      {arg && <span aria-hidden>◆</span>}
      {/* 論點只寫名稱：「論點 A：」前綴和 ◆ 重複。 */}
      {arg ? name.replace(/^[^：:]{1,14}[：:]\s*/, '') : name}
    </span>
  );
}

/** 法院的准／駁回大章（視覺規格 §17，圖樣同 stamps.svg）。 */
export function CourtStamp({ ok }: { ok: boolean }) {
  const t = useT();
  const scope = useScope();
  const shown = ok ? t('准') : t('駁回', scope);
  const latin = /^[A-Za-z]/.test(shown);
  const word = latin ? shown.toUpperCase() : shown;
  const ring = `ringp-${ok ? 'ok' : 'no'}`;
  return (
    <span className={ok ? 'stamp-big ok' : 'stamp-big no'} role="img" aria-label={word}>
      <svg viewBox="0 0 132 132" aria-hidden>
        <defs>
          <path id={ring} d="M66,66 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0" />
        </defs>
        <circle cx="66" cy="66" r="62" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="66" cy="66" r="44" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text className="ring" fill="currentColor">
          <textPath href={`#${ring}`}>CALDER COUNTY · SUPERIOR COURT · ORDER ·</textPath>
        </text>
        <text
          x="66"
          y={latin ? 72 : ok ? 81 : 77}
          textAnchor="middle"
          fill="currentColor"
          className={latin ? 'word latin' : 'word'}
          fontSize={latin ? 16 : ok ? 42 : 30}
        >
          {word}
        </text>
      </svg>
    </span>
  );
}

/**
 * 聲請狀（UX board-spec §10、視覺規格 §17）：一句有三個空格的話。
 * 空格怎麼填由呼叫的人給（桌面上可以點，裁定畫面上只是字）；遞出後蓋收文章，裁定回來蓋大章。
 */
export function Pleading({
  m,
  n,
  request,
  basis,
  support,
  received,
  ruling,
  foot,
}: {
  m: Motion;
  n: number;
  request: ReactNode;
  basis: ReactNode;
  support: ReactNode[];
  received?: boolean;
  ruling?: { ok: boolean; quote?: string } | null;
  foot?: ReactNode;
}) {
  const t = useT();
  const scope = useScope();
  const { caseNo, parties } = useCaseTerms();
  // 題目是「聲請傳票：死者手錶的健康資料」，抬頭只放冒號後面那段。
  const label = t(m.label, scope);
  // 行號只寫整行：紙多高就寫幾行，最後一個號碼不要被切一半。
  // 32px 格線對齊內文：量第一行的基線，格線和行號跟著它走，抬頭多高、哪種寬度都一樣（設計師第二輪）。
  const paper = useRef<HTMLElement>(null);
  const base = useRef<HTMLSpanElement>(null);
  const [grid, setGrid] = useState({ lines: 16, y: 20 });
  useEffect(() => {
    const el = paper.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const b = base.current;
      // 探針是 0 高的 inline-block：它的底邊就是基線。
      const y = b ? (((b.offsetTop - 31) % 32) + 32) % 32 : 20;
      const lines = Math.max(1, Math.floor((el.clientHeight - y - 24) / 32));
      setGrid((g) => (g.y === y && g.lines === lines ? g : { lines, y }));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    // 字型載入後抬頭的高度會變，紙不一定跟著變高。
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);
  const topic =
    label
      .split(/[：:]\s*/)
      .slice(1)
      .join('：') || label;
  return (
    <article
      ref={paper}
      className={received ? 'plead received' : 'plead'}
      aria-label={label}
      style={{ '--grid-y': `${grid.y}px` } as CSSProperties}
    >
      <div className="ln" aria-hidden>
        {Array.from({ length: grid.lines }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      {received && (
        <div className="stamp-rcv" aria-label={t('已收文')}>
          <b>{t('收　文')}</b>
          {t('卡爾德郡高等法院')}
        </div>
      )}
      <header className="cap">
        <span className="ct">{t('卡爾德郡高等法院')}</span>
        <span className="vs">{t(parties)}</span>
        <span className="no">{caseNo}</span>
        <h2>{t('聲請狀')}</h2>
        <span className="topic">{t('（{topic}）', { topic })}</span>
      </header>
      <div className="body">
        <p>
          <span ref={base} className="baseline" aria-hidden />
          {t('聲請人請求本院')}
          {/* 空格和逗號綁在一起：逗號不要單獨掉到下一行。 */}
          <span className="glue">
            {request}
            {t('，')}
          </span>
        </p>
        <p>
          {t('理由：依')}
          <span className="glue">
            {basis}
            {t('，')}
          </span>
        </p>
        <p>
          {t('並提出')}
          {support.map((s, i) => (
            <span key={i}>
              {i > 0 && t('、')}
              {s}
            </span>
          ))}
          <span className="nw">{t('為證。')}</span>
        </p>
      </div>
      {ruling && (
        // 裁定和具狀人也坐在 32px 格線上：每一行的行框用內文的字型撐（17px／32px），小字只是行內的 span，
        // 基線就和上面的內文落在同一組格線上（設計師 #225 第三輪：「整張紙都算」）。
        <div className={ruling.ok ? 'judge ok' : 'judge no'}>
          <small>{t('裁定・雷耶斯法官')}</small>
          <span className="q">{prose(ruling.quote ?? t(ruling.ok ? '准。' : '駁回。'))}</span>
          <CourtStamp ok={ruling.ok} />
        </div>
      )}
      <div className="sig">
        <span>
          {t('具狀人')} <b>{t('盧卡斯・葛雷')}</b>
        </span>
      </div>
      {foot && <div className="commit-row">{foot}</div>}
      <span className="bates2">MOT-{String(n).padStart(4, '0')}</span>
    </article>
  );
}

/** 已填好的字（裁定畫面、已准的狀紙）：手寫藍黑墨水。 */
export function Written({ text }: { text?: string | null }) {
  return <span className="blank filled">{text ?? '—'}</span>;
}

/** 狀紙縮圖：未遞、已遞、准、駁回四種，用章分。 */
export function FilingThumb({
  a,
  n,
  on,
  onPick,
}: {
  a: MotionAttempt;
  n: number;
  on: boolean;
  onPick: () => void;
}) {
  const t = useT();
  const scope = useScope();
  const raw = a.ruling === 'granted' ? t('已准') : a.ruling === 'denied' ? t('駁回') : t('未遞');
  // 英文的「駁回」是章上的全大寫 DENIED；報讀時改成和 Granted 一樣只大寫字首。
  const state = /^[A-Z]+$/.test(raw) ? raw[0] + raw.slice(1).toLowerCase() : raw;
  const filled = !!a.request && !!a.basis;
  // 小圓章：中文寫准／駁回；英文寫不下，畫勾／叉。
  const word = a.ruling === 'granted' ? t('准') : t('駁回', scope);
  const latin = /^[A-Za-z]/.test(word);
  return (
    <button
      className={on ? 'fthumb on' : 'fthumb'}
      aria-pressed={on}
      aria-label={t('聲請 {n}', { n }) + t('・') + state}
      onClick={onPick}
    >
      <i />
      <i />
      <i className={filled ? undefined : 'open'} />
      <i />
      <i className={filled ? undefined : 'open'} />
      {a.ruling && <span className="rcv" aria-hidden />}
      {a.ruling && (
        <span className={a.ruling === 'granted' ? 'mini ok' : 'mini no'} aria-hidden>
          <svg viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="17" cy="17" r="11" fill="none" stroke="currentColor" strokeWidth="0.8" />
            {latin ? (
              // 英文字放不進 22px 的內圈：改用勾和叉，形狀就分得出准與駁回，不只靠顏色。
              <path
                d={a.ruling === 'granted' ? 'M11 17.5l4 4 8-9' : 'M12 12l10 10M22 12l-10 10'}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <text
                x="17"
                y={a.ruling === 'granted' ? 21 : 20}
                textAnchor="middle"
                fill="currentColor"
                fontSize={a.ruling === 'granted' ? 11 : 7}
                fontWeight="900"
              >
                {word}
              </text>
            )}
          </svg>
        </span>
      )}
      <span className="k">{t('聲請 {n}', { n })}</span>
    </button>
  );
}
