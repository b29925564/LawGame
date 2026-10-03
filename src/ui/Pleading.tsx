import type { ReactNode } from 'react';
import type { MotionAttempt } from '../engine/episode/desk';
import type { Motion } from '../engine/episode/schema';
import { useT } from '../i18n';
import { useScope } from './lang';
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
  const topic =
    label
      .split(/[：:]\s*/)
      .slice(1)
      .join('：') || label;
  return (
    <article className={received ? 'plead received' : 'plead'} aria-label={label}>
      <div className="ln" aria-hidden>
        {Array.from({ length: 30 }, (_, i) => (
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
        <span className="topic">（{topic}）</span>
      </header>
      <div className="body">
        <p>
          {t('聲請人請求本院')}
          {request}
          {t('，')}
        </p>
        <p>
          {t('理由：依')}
          {basis}
          {t('，')}
        </p>
        <p>
          {t('並提出')}
          {support.map((s, i) => (
            <span key={i}>
              {i > 0 && '、'}
              {s}
            </span>
          ))}
          <span className="nw">{t('為證。')}</span>
        </p>
      </div>
      {ruling && (
        <div className={ruling.ok ? 'judge ok' : 'judge no'}>
          <small>{t('裁定・雷耶斯法官')}</small>
          {ruling.quote ?? t(ruling.ok ? '准。' : '駁回。')}
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
  const state = a.ruling === 'granted' ? t('已准') : a.ruling === 'denied' ? t('駁回') : t('未遞');
  const filled = !!a.request && !!a.basis;
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
            <text
              x="17"
              y={a.ruling === 'granted' ? 21 : 20}
              textAnchor="middle"
              fill="currentColor"
              fontSize={a.ruling === 'granted' ? 11 : 7}
              fontWeight="900"
            >
              {a.ruling === 'granted' ? '准' : '駁回'}
            </text>
          </svg>
        </span>
      )}
      <span className="k">{t('聲請 {n}', { n })}</span>
    </button>
  );
}
