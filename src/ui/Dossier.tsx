import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { branchContext, caseClosed, custodyOf, episodeOf } from '../engine/game';
import { matches } from '../engine/episode/branch';
import type { Card, Episode } from '../engine/episode/schema';
import type { Progress } from '../engine/save';
import { useLang, useT } from '../i18n';
import { cardHighlights, Hl } from './Marks';
import { bates, pageAt } from './bates';
import { useScope } from './lang';
import { hasPrint, Print, type PrintUse } from './prints';
import { prose } from './prose';
import { Redaction } from './Redaction';
import { caseTermsOf } from './terms';
import type { Burden } from '../engine/jury';

/**
 * 卷宗的三個標記元件（設定集第 9 章「九個標記元件」；設計師 P2-6 裁定）。
 * 只顯示劇本寫好的資料，不自動產生。字族照紙本的規則（設定集第 9 章；設計師 P2-6 r1 更正）：
 * 紙上印的東西用 Courier Prime（拉丁字母、數字）加 Noto Serif TC（中文），就是 --font-court 那一串；
 * 手寫的一律 LXGW WenKai TC，數字、時間、英文都一樣。「三套字族」算的是每一張紙。
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

/** 登錄表的一行。done 是已經發生（寫出日期與事項）；沒發生的畫黑條「尚未發生」。 */
export type DocketRow = { no: number; date: string; entry: string; done: boolean };

/**
 * 案卷登錄表照進度（劇本與內容 #234 的規則）：
 * - 每張寫了 docket 的幕卡一行，那張卡的 filings 排在它前面；序號依列出來的順序從 1 起。
 * - 走過的卡：filings 寫了 when 的，條件成立才列；沒成立的分支行不列，也不畫黑條。
 * - 還沒走到的卡：卡本身和沒寫 when 的 filings 畫黑條；寫了 when 的先不列，免得暴露分支。
 * - 提前收場（協商成交、撤回起訴）跳過的卡不列。
 * - 最後一行是 disposition：判決或收場前一條黑條，之後列第一個符合的。
 */
export function docketOf(p: Progress): DocketRow[] {
  const ep = episodeOf(p);
  const ctx = branchContext(p);
  const closed = caseClosed(p);
  const rows: Omit<DocketRow, 'no'>[] = [];
  ep.scenes.forEach((s, at) => {
    if (s.type !== 'card' || (closed && at > closed.at)) return;
    const done = at <= p.scene;
    for (const f of s.filings ?? [])
      if (!f.when || (done && matches(f.when, ctx)))
        rows.push({ date: f.date, entry: f.entry, done });
    if (s.docket) rows.push({ ...s.docket, done });
  });
  if (ep.disposition) {
    const decided = ctx.verdict !== null || ctx.outcome !== null;
    const hit = decided ? ep.disposition.find((d) => matches(d.when, ctx)) : undefined;
    if (hit) rows.push({ date: hit.date, entry: hit.entry, done: true });
    else if (!decided) rows.push({ date: '', entry: '', done: false });
  }
  return rows.map((r, i) => ({ no: i + 1, ...r }));
}

/** 目前那一行：已經發生的最後一行。一行都還沒發生是 −1。 */
export function currentRow(rows: readonly DocketRow[]) {
  return rows.reduce((cur, r, i) => (r.done ? i : cur), -1);
}

/**
 * 法院系統分頁頂端的案卷登錄表：法院紀錄的口吻，一行一個程序。
 * 目前那一行上螢光（--dur-hl 330ms steps(8)）。還沒發生的行不論幾行都只畫一條黑條：
 * 黑條的數量會洩漏玩家還沒走到的分支（設計師 P2-6 r2）。
 */
export function Docket({ progress }: { progress: Progress }) {
  const t = useT();
  const id = useId();
  const ep = episodeOf(progress);
  const rows = docketOf(progress);
  const cur = currentRow(rows);
  const terms = caseTermsOf(ep.scenes as { burden?: Burden }[]);
  // 手機：只看目前那一行和前一行，加一條黑條，聲請卡的標題和第一行留在第一屏；「展開全部」看整張。
  // r1 定的是最近三行；英文第三幕三行就把聲請卡擠出 412×915 的第一屏，所以改成兩行（設計師 P2-6 r2 第 1 條）。
  const [all, setAll] = useState(false);
  const old = (i: number) => i < cur - 1;
  const hidden = old(0);
  return (
    <section className={all ? 'docket all' : 'docket'} aria-labelledby={id}>
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
          {rows.slice(0, cur + 1).map((r, i) => (
            <tr
              key={r.no}
              className={i === cur ? 'dk-cur' : old(i) ? 'dk-old' : undefined}
              aria-current={i === cur ? 'step' : undefined}
            >
              <td className="dk-no">{r.no}</td>
              <td className="dk-date">{r.date}</td>
              <td className="dk-entry">{prose(t(r.entry))}</td>
            </tr>
          ))}
          {cur < rows.length - 1 && (
            <tr className="dk-future">
              <td colSpan={3}>
                <Redaction label={t('尚未發生')} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {hidden && !all && (
        <button type="button" className="dk-all" onClick={() => setAll(true)}>
          {t('展開全部')}
        </button>
      )}
    </section>
  );
}

/** 英文縮寫的句點（No.、Dr.…）不是句子結束。 */
const ABBR = /(?:^|[\s(])(?:No|Nos|Dr|Mr|Mrs|Ms|St|Jr|Sr|Inc|Co|Corp|Ltd|v|vs|Det|Sgt|Lt)\.$/;
/**
 * 迷你登錄表一行只放事項的第一個分句（切在第一個「：；。」，英文切在第一個「: 」「; 」「. 」）。
 * 括號裡的補充說明不算；還是太長就換行；不用省略號，也不用漸隱（設計師 P2-6 r2）。
 * 行尾一律不放句尾標點，切在分句的行和整句的行看起來一樣（設計師 P2-6 r3 第 5 條）。
 */
export function firstClause(text: string) {
  let depth = 0;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '（') {
      // 括號裡是補充說明，不算第一個分句：在括號前面斷。
      if (depth === 0 && c === '(' && text[i - 1] === ' ') return text.slice(0, i - 1);
      if (depth === 0 && c === '（') return text.slice(0, i);
      depth++;
    } else if (c === ')' || c === '）') depth = Math.max(0, depth - 1);
    if (depth) continue;
    if ('：；。'.includes(c)) return text.slice(0, i);
    if (/[:;.]/.test(c) && text[i + 1] === ' ') {
      // 「No. 26-…」「Dr. Brooks」這種縮寫的句點不是句子結束。
      if (c === '.' && ABBR.test(text.slice(0, i + 1))) continue;
      return text.slice(0, i);
    }
  }
  return ABBR.test(text) ? text : text.replace(/[。．.！？!?]+$/, '');
}

/**
 * 存檔欄的縮小版登錄表：每行只放第一個分句；還沒發生的行合成一條黑條（設定集第 10 章；設計師 P2-6 r1、r2）。
 * 只有玩家選中（鍵盤焦點）的那一欄，目前那一行上螢光；其他欄只加粗。存檔卡是介面，事項用介面字。
 * 整塊放在按鈕裡，對螢幕閱讀器隱藏：按鈕的名稱已經念出存檔名，進度在存檔標籤那一行。
 */
export function DocketMini({ progress }: { progress: Progress }) {
  const t = useT();
  const rows = docketOf(progress);
  const cur = currentRow(rows);
  return (
    <span className="dk-mini" aria-hidden>
      {rows.slice(0, cur + 1).map((r, i) => (
        <span key={r.no} className={i === cur ? 'dk-row dk-cur' : 'dk-row'}>
          <b>{r.no}</b>
          <time>{r.date.slice(0, 5)}</time>
          <span>{prose(firstClause(t(r.entry)))}</span>
        </span>
      ))}
      {cur < rows.length - 1 && (
        <span className="dk-row dk-future">
          <i className="dk-bar" />
        </span>
      )}
    </span>
  );
}

/** 存檔欄的 Bates 區間：從這一集的第一頁（和幕卡同一個 pageAt）到存檔那一場。放在章節那一行下面。 */
export function SaveBates({ progress }: { progress: Progress }) {
  const ep = episodeOf(progress);
  return (
    <span className="dk-bates" aria-hidden>
      {bates(ep.number, pageAt(0))}–{bates(ep.number, pageAt(progress.scene)).slice(-6)}
    </span>
  );
}

// ── <PhotoLog> 照片紀錄表 ──

/** 照片序號補成兩位數：07/24。 */
const serial = (photo: PhotoRecord) =>
  `${String(photo.no).padStart(2, '0')}/${String(photo.of).padStart(2, '0')}`;

/**
 * 一行版（證據板照片卡的卡名下面）：只放案號、序號、時間，兩個半形空格分開（「ME-26-0311  14/46  03/14 09:40」）。
 * 攝影者只在抽屜和放大檢視。放不下就整段換行，不漸隱。
 */
export function PhotoLogLine({ photo }: { photo: PhotoRecord }) {
  return (
    <span className="photolog-line">
      {[photo.caseNo, serial(photo), photo.at].map((x) => (
        <span key={x}>{x}</span>
      ))}
    </span>
  );
}

/**
 * 人名加職稱（姓名、全形空格、職稱；英文是逗號）：姓名和職稱分兩段，各自整組不斷開；要不要換行由 CSS 決定。
 * 保管鏈寬版的職稱欄放不下時以詞換行（英文在空白、中文在詞與詞之間），不壓進下一欄。
 */
function Who({ text }: { text: string }) {
  const t = useT();
  const shown = t(text);
  const at = shown.search(/\u3000|, /);
  if (at < 0) return <span className="who-name">{shown}</span>;
  return (
    <>
      <span className="who-name">{shown.slice(0, at)}</span>
      <span className="who-role">{prose(shown.slice(at).replace(/^(\u3000|, )/, ''))}</span>
    </>
  );
}

/**
 * 沖印本（零圓角）＋底邊四欄：案號、照片序號、時間、攝影者；右下角是 Bates（還沒有號碼就是一條黑條）。
 * 沒有實物照片時是警方閃光燈的版式（中心過曝、四角快速變暗），不畫道具；redacted 的照片畫「照片已遮蔽」黑條。
 */
export function PhotoLog({
  photo,
  id,
  image,
  use = 'drawer',
  redacted,
  children,
}: {
  photo: PhotoRecord;
  /** 卡片 id：有實物照片（prints.tsx）就印那張。 */
  id?: string;
  image?: string;
  use?: PrintUse;
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
        ) : id && hasPrint(id) ? (
          <Print id={id} use={use} />
        ) : (
          image && <img src={image} alt="" />
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
          <dd>{serial(photo)}</dd>
        </div>
        <div>
          <dt>{t('時間', 'dossier')}</dt>
          <dd>{photo.at}</dd>
        </div>
        <div className="pg">
          <dt>{t('攝影者', 'dossier')}</dt>
          <dd>
            <Who text={photo.by} />
          </dd>
        </div>
      </dl>
      {/* 右下角的 Bates（#237 的 photo.bates）；還沒有號碼的照片只畫黑條，不印字。 */}
      <span className="photolog-bates">
        {photo.bates ? <b>{photo.bates}</b> : <i className="bates-bar" aria-hidden />}
      </span>
    </figure>
  );
}

/**
 * 沒有照片紀錄表的實物照片（伊森的錶：扣押袋那張）：只有沖印本身，白邊、零圓角，放在證物袋上面。
 * 這張卡沒有照片就不畫。
 */
export function PrintPlate({ id, use }: { id: string; use: PrintUse }) {
  if (!hasPrint(id)) return null;
  return (
    <figure className="photolog bare">
      <span className="photolog-print">
        <Print id={id} use={use} />
      </span>
    </figure>
  );
}

// ── <EvidenceBag> 證物袋 ──

/** 印好的欄位裡的單號（No. 26-0315-088、D-1、26-CR-0417）：Courier 700，整組不斷開。 */
const REF = /((?:No\. )?[A-Z0-9]+(?:-[A-Z0-9]+)+)/;

function Printed({ text, code }: { text: string; code: boolean }) {
  // 案號、項次整欄是碼：每一段（全形空格或逗號分開）整組不斷開。
  if (code)
    return text.split(/\u3000|, /).map((x, i) => (
      <span key={i} className="seg">
        {x}
      </span>
    ));
  const parts = text.split(REF);
  return parts.map((x, i) =>
    i % 2 ? (
      <span key={i} className="ref">
        {x}
      </span>
    ) : (
      <Fragment key={i}>{prose(x, i === parts.length - 1)}</Fragment>
    ),
  );
}

/**
 * 透明袋：兩道 CSS 漸層高光＋1px 白邊（設定集第 9 章，定案做法）。袋裡看得到卡片本身。
 * 袋上的標籤是看守所系統印出來的（紙本字族），保管鏈每經手一次多一行手寫（LXGW）：兩種聲音分開。
 * 保管鏈照劇情進度（custodyOf）：還沒發生的幾手合成一條黑條「尚未發生」，和案卷登錄表一樣。
 * 欄位空著畫黑條。窄的時候欄名疊在值上面，保管鏈留小字欄名。
 */
export function EvidenceBag({
  bag,
  progress,
  children,
}: {
  bag: BagRecord;
  progress: Progress;
  children?: ReactNode;
}) {
  const t = useT();
  const zh = useLang((s) => s.lang) !== 'en';
  const blank = <Redaction label={t('未填', 'dossier')} />;
  const chain = custodyOf(progress, bag);
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
              <dd className={code ? 'code' : undefined}>
                {v ? <Printed text={v} code={code} /> : blank}
              </dd>
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
          {chain
            .filter((x) => x.done)
            .map(({ row: c }) => (
              <li key={c.at + c.from}>
                <span className="at">
                  <span className="sr-only">{t('日期時間', 'dossier')}</span>
                  {c.at}
                </span>
                <span className="from">
                  <span className="ck">{t('交出', 'dossier')}</span>
                  {c.from ? <Who text={c.from} /> : blank}
                </span>
                <span className="to">
                  <span className="ck">{t('收受', 'dossier')}</span>
                  {c.to ? <Who text={c.to} /> : blank}
                </span>
                <span className="why">
                  <span className="sr-only">{t('目的', 'dossier')}</span>
                  {c.purpose ? t(c.purpose) : blank}
                </span>
              </li>
            ))}
          {/* 還沒發生的幾手只畫一條黑條：條數會洩漏還剩幾手（設計師 P2-6 r2）。 */}
          {chain.some((x) => !x.done) && (
            <li className="bag-pending">
              <Redaction label={t('尚未發生')} />
            </li>
          )}
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

/** 卡片本身（紙）：放大檢視裡、證物袋的窗口裡。玩家在抽屜裡劃的螢光照樣留著（一張紙一道）。 */
function Sheet({ item, hl }: { item: ZoomItem; hl?: string[] }) {
  const t = useT();
  const scope = useScope();
  return (
    <div className="zoom-sheet">
      <p>
        {hl ? <Hl text={item.text} words={hl} live={false} wrap /> : prose(t(item.text, scope))}
      </p>
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
  const ep = episodeOf(progress);
  const { photo, bag } = dossierOf(ep, item.id);
  const hl = cardHighlights(ep)[item.id];
  // 卸載時元素離開文件就自動關閉，不在清理函式裡 close()：那會排一個 close 事件，嚴格模式重掛時把自己關掉。
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const body = photo ? (
    <PhotoLog photo={photo} id={item.id} image={item.image} use="zoom" />
  ) : (
    <Sheet item={item} hl={hl} />
  );
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
      {/* 標題列固定，內容在框裡捲：框永遠留在視窗內，上下留白不被吃掉（設計師 r2 第 5 條）。 */}
      <div className="zoom-body">
        {!photo && <PrintPlate id={item.id} use="zoom" />}
        {bag ? (
          <EvidenceBag bag={bag} progress={progress}>
            {body}
          </EvidenceBag>
        ) : (
          body
        )}
        {photo && <Sheet item={item} hl={hl} />}
      </div>
    </dialog>
  );
}
