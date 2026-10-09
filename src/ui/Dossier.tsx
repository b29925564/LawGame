import { useEffect, useId, useRef, type ReactNode } from 'react';
import { episodeOf } from '../engine/game';
import type { Card, Episode } from '../engine/episode/schema';
import type { Progress } from '../engine/save';
import { useLang, useT } from '../i18n';
import { bates, pageAt } from './bates';
import { useScope } from './lang';
import { Redaction } from './Redaction';
import { caseTermsOf } from './terms';
import type { Burden } from '../engine/jury';

/**
 * 卷宗的三個標記元件（設定集第 9 章「九個標記元件」；設計師 P2-6 裁定）。
 * 只顯示劇本寫好的資料，不自動產生；字族：印好的表頭用介面字，編號、時間、案號、Bates 用 Courier Prime 700，
 * 手寫的保管鏈用 LXGW WenKai TC。
 */

export type PhotoRecord = NonNullable<Card['photo']>;
export type BagRecord = NonNullable<Card['bag']>;

/** 一張卡的卷宗資料：卡片在劇本裡有 photo 或 bag 才有。 */
export function dossierOf(ep: Episode, id: string): { photo?: PhotoRecord; bag?: BagRecord } {
  for (const s of ep.scenes) {
    if (s.type !== 'desk') continue;
    const c = s.cards.find((x) => x.id === id);
    if (c) return { photo: c.photo, bag: c.bag };
  }
  return {};
}

// ── <Docket> 案卷登錄表 ──

/** 登錄表的一行：每張寫了 docket 的幕卡或日卡一行，序號依卡的順序從 1 起。 */
export type DocketRow = { no: number; at: number; date: string; entry: string };

export function docketOf(ep: Episode): DocketRow[] {
  const rows: DocketRow[] = [];
  ep.scenes.forEach((s, at) => {
    if (s.type === 'card' && s.docket) rows.push({ no: rows.length + 1, at, ...s.docket });
  });
  return rows;
}

/** 目前那一行：走過的最後一張登錄卡。還沒走到第一張是 −1（每一行都還沒發生）。 */
export function currentRow(rows: readonly DocketRow[], scene: number) {
  return rows.reduce((cur, r, i) => (r.at <= scene ? i : cur), -1);
}

/**
 * 法院系統分頁頂端的案卷登錄表：法院紀錄的口吻，一行一個程序。
 * 目前那一行上螢光（--dur-hl 330ms steps(8)），還沒發生的整行是黑條。
 */
export function Docket({ progress }: { progress: Progress }) {
  const t = useT();
  const id = useId();
  const ep = episodeOf(progress);
  const rows = docketOf(ep);
  const cur = currentRow(rows, progress.scene);
  const terms = caseTermsOf(ep.scenes as { burden?: Burden }[]);
  return (
    <section className="docket" aria-labelledby={id}>
      <header className="docket-cap">
        <span className="ct">{t('卡爾德郡高等法院')}</span>
        <span className="vs">{t(terms.parties)}</span>
        <span className="no">{terms.caseNo}</span>
        <h3 id={id}>{t('案卷登錄表')}</h3>
      </header>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('序號', 'dossier')}</th>
            <th scope="col">{t('日期', 'dossier')}</th>
            <th scope="col">{t('事項', 'dossier')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            i > cur ? (
              <tr key={r.no} className="dk-future">
                <td colSpan={3}>
                  <Redaction label={t('尚未發生')} />
                </td>
              </tr>
            ) : (
              <tr
                key={r.no}
                className={i === cur ? 'dk-cur' : undefined}
                aria-current={i === cur ? 'step' : undefined}
              >
                <td className="dk-no">{r.no}</td>
                <td className="dk-date">{r.date}</td>
                <td className="dk-entry">{t(r.entry)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}

/**
 * 存檔欄的縮小版登錄表：每行一行字，放不下的淡進紙裡；下面一行 Bates 區間（設定集第 10 章）。
 * 只有玩家目前選中（滑過或鍵盤焦點）的那一欄，目前那一行上螢光；其他欄只加粗。整塊放在按鈕裡，
 * 對螢幕閱讀器隱藏：按鈕的名稱已經念出存檔名，進度在存檔標籤那一行。
 */
export function DocketMini({ progress }: { progress: Progress }) {
  const t = useT();
  const ep = episodeOf(progress);
  const rows = docketOf(ep);
  const cur = currentRow(rows, progress.scene);
  return (
    <span className="dk-mini" aria-hidden>
      {rows.map((r, i) =>
        i > cur ? (
          <span key={r.no} className="dk-row dk-future">
            <i className="dk-bar" />
          </span>
        ) : (
          <span key={r.no} className={i === cur ? 'dk-row dk-cur' : 'dk-row'}>
            <b>{r.no}</b>
            <time>{r.date.slice(0, 5)}</time>
            <span>{t(r.entry)}</span>
          </span>
        ),
      )}
      <span className="dk-bates">
        {bates(ep.number, 1)}–{bates(ep.number, pageAt(progress.scene)).slice(-6)}
      </span>
    </span>
  );
}

// ── <PhotoLog> 照片紀錄表 ──

/** 一行版（證據板照片卡的卡名下面）：放大時才讀。 */
export function PhotoLogLine({ photo }: { photo: PhotoRecord }) {
  const t = useT();
  return (
    <span className="photolog-line">
      {[photo.caseNo, `${photo.no}/${photo.of}`, photo.at, t(photo.by)].join('\u3000')}
    </span>
  );
}

/**
 * 白邊照片（零圓角）＋底邊四欄：案號、照片序號、時間、攝影者。
 * 沒有實物照片時是警方閃光燈的版式（中心過曝、四角快速變暗）；redacted 的照片畫「照片已遮蔽」黑條。
 */
export function PhotoLog({
  photo,
  image,
  redacted,
  children,
}: {
  photo: PhotoRecord;
  image?: string;
  redacted?: boolean;
  /** 照片上的標記層（例如證物牌）。 */
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <figure className="photolog">
      <span className="photolog-print">
        {redacted ? (
          <Redaction label={t('照片已遮蔽')} />
        ) : image ? (
          <img src={image} alt="" />
        ) : (
          <i className="cork-tent" />
        )}
        {children}
      </span>
      <dl className="photolog-strip">
        <div>
          <dt>{t('案號', 'dossier')}</dt>
          <dd>{photo.caseNo}</dd>
        </div>
        <div>
          <dt>{t('照片序號', 'dossier')}</dt>
          <dd>
            {String(photo.no).padStart(2, '0')}/{String(photo.of).padStart(2, '0')}
          </dd>
        </div>
        <div>
          <dt>{t('時間', 'dossier')}</dt>
          <dd>{photo.at}</dd>
        </div>
        <div>
          <dt>{t('攝影者', 'dossier')}</dt>
          <dd>{t(photo.by)}</dd>
        </div>
      </dl>
    </figure>
  );
}

// ── <EvidenceBag> 證物袋 ──

/**
 * 透明袋：兩道 CSS 漸層高光＋1px 白邊（設定集第 9 章，定案做法）。袋裡看得到卡片本身；
 * 袋上印好的表頭每袋一次，保管鏈每經手一次多一行手寫。版面跟著寬度：窄的時候每一手兩行。
 */
export function EvidenceBag({ bag, children }: { bag: BagRecord; children?: ReactNode }) {
  const t = useT();
  const zh = useLang((s) => s.lang) !== 'en';
  const head: [string, string, boolean][] = [
    ['案號', bag.caseNo, true],
    ['證物項次', t(bag.item), true],
    ['取得方式與單號', t(bag.acquiredBy), false],
    ['取得地點或提出人', t(bag.from), false],
    ['內容說明', t(bag.desc), false],
  ];
  return (
    <figure className="bag">
      {children && <div className="bag-window">{children}</div>}
      <div className="bag-label">
        {/* 袋子是美國警局與法院的實物，印的是英文；中文模式在前面加中文名。 */}
        <p className="bag-title">
          {zh && <b>證物</b>}
          <span lang="en">EVIDENCE</span>
        </p>
        <dl className="bag-head">
          {head.map(([k, v, code]) => (
            <div key={k}>
              <dt>{t(k, 'dossier')}</dt>
              <dd className={code ? 'code' : 'hand'}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="bag-chain-title">
          {zh && <b>保管鏈</b>}
          <span lang="en">CHAIN OF CUSTODY</span>
        </p>
        <ol className="bag-chain">
          <li className="bag-chain-cols" aria-hidden>
            <span>{t('日期時間', 'dossier')}</span>
            <span>{t('交出', 'dossier')}</span>
            <span>{t('收受', 'dossier')}</span>
            <span>{t('目的', 'dossier')}</span>
          </li>
          {bag.custody.map((c) => (
            <li key={c.at + c.from}>
              <span className="at">
                <span className="sr-only">{t('日期時間', 'dossier')}</span>
                {c.at}
              </span>
              <span className="from">
                <span className="sr-only">{t('交出', 'dossier')}</span>
                {t(c.from)}
              </span>
              <span className="to">
                <span className="sr-only">{t('收受', 'dossier')}</span>
                {t(c.to)}
              </span>
              <span className="why">
                <span className="sr-only">{t('目的', 'dossier')}</span>
                {t(c.purpose)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}

// ── 放大檢視 ──

export type ZoomItem = {
  id: string;
  name: string;
  kind: string;
  text: string;
  source: string;
  image?: string;
};

/** 卡片本身（紙）：放大檢視裡、證物袋的窗口裡。 */
function Sheet({ item }: { item: ZoomItem }) {
  const t = useT();
  const scope = useScope();
  return (
    <div className="zoom-sheet">
      <p>{t(item.text, scope)}</p>
      <p className="zoom-src">
        {t(item.kind)}
        {t('・')}
        {t(item.source, scope)}
      </p>
    </div>
  );
}

/**
 * 放大檢視（設計師 P2-6：完整的證物袋與照片紀錄表）：原生 <dialog>，Esc 或點外面關閉，焦點留在裡面。
 * 證據欄展開的卡片與證據板光圈裡的卡片都從這裡打開。
 */
export function EvidenceZoom({
  item,
  progress,
  onClose,
}: {
  item: ZoomItem;
  progress: Progress;
  onClose: () => void;
}) {
  const t = useT();
  const scope = useScope();
  const ref = useRef<HTMLDialogElement>(null);
  const { photo, bag } = dossierOf(episodeOf(progress), item.id);
  // 卸載時元素離開文件就自動關閉，不在清理函式裡 close()：那會排一個 close 事件，嚴格模式重掛時把自己關掉。
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const body = photo ? <PhotoLog photo={photo} image={item.image} /> : <Sheet item={item} />;
  return (
    <dialog
      ref={ref}
      className="zoom"
      aria-label={t('放大檢視 {name}', { name: t(item.name, scope) })}
      onClose={onClose}
      onClick={(e) => {
        // 只有點在框外（背幕）才關；框內的留白也算 dialog 自己，要看座標。
        const r = e.currentTarget.getBoundingClientRect();
        const out =
          e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (e.target === e.currentTarget && out) e.currentTarget.close();
      }}
      // Esc 只關放大檢視：不要再傳到底下的手機證據抽屜，一次關掉兩層。
      onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}
    >
      <header className="zoom-head">
        <h2>{t(item.name, scope)}</h2>
        <button className="link" onClick={() => ref.current?.close()}>
          {t('關閉')}
        </button>
      </header>
      {bag ? <EvidenceBag bag={bag}>{body}</EvidenceBag> : body}
      {photo && <Sheet item={item} />}
    </dialog>
  );
}
