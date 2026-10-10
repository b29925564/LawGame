import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { glossary } from '../content/glossary';
import {
  branchContext,
  deskSceneOf,
  episodeOf,
  deskState,
  evidence,
  useEpisode,
  type Evidence as Item,
} from '../engine/game';
import { cardIn, provenanceOf } from '../engine/bates';
import { play } from '../engine/sound';
import { t as tr, useT } from '../i18n';
import { straight } from '../i18n/curly';
import { dossierOf, EvidenceBag, EvidenceZoom, PhotoLog, PrintPlate } from './Dossier';
import { hasPrint, Print } from './prints';
import { reducedMotion } from './a11y';
import { useScope } from './lang';
import { prose } from './prose';
import { cardHighlights, cardStamps, Hl, Stamp } from './Marks';
import { useCardPick } from './pick';
import { TimelineView } from './Timeline';

/**
 * 證據抽屜。
 *
 * 推理鏈、動議、對質、結辯都要一邊看卡片內容一邊選，
 * 以前只能切到證據庫分頁再切回來，位置也跟著跑掉。
 * 抽屜是浮在畫面上的，打開關上都不會動到你正在做的事。
 */
/** 寬螢幕（電腦）上抽屜常駐在右欄，不用再點開。 */
export const WIDE = '(min-width: 1024px)';
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export function EvidenceDrawer({ note, noTimeline }: { note?: string; noTimeline?: boolean }) {
  const progress = useEpisode((s) => s.progress);
  const t = useT();
  const scope = useScope();
  const items = evidence(progress);
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      play('folder');
      setOpen(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const [kind, setKind, showKind] = useKindFilter();
  // 聲請時（有證物標籤）能出示的卡排最前面，第一屏就看得到（體驗評測 v88 重驗：候選卡夾在清單中段、尾端）。
  const { pool, pick, tags } = useCardPick();
  const motion = wide && !!pick && !!tags;
  // 抽屜分三頁：手上的證據、排好的時間軸、法典百科。庭上、談判時都翻得到。
  const [want, setWant] = useState<'cards' | 'timeline' | 'terms'>('cards');
  const setPage = (next: typeof want) => {
    if (next !== page) play('page');
    setWant(next);
  };
  // 手機上抽屜是蓋上來的一層，開關有資料夾聲；桌機一直開著，不出聲。
  const toggle = (on: boolean) => {
    if (on !== open) play('folder');
    setOpen(on);
  };
  // 證據板上時間軸的家是疑問清單第一列，抽屜不再放一份（UX 規格：一樣東西只有一個家）。
  const page = noTimeline && want === 'timeline' ? 'cards' : want;
  const scene = deskSceneOf(progress);
  const placed = scene ? deskState(progress, scene).timeline : [];
  const rows = placed.map((id) => items.find((i) => i.id === id)).filter((i) => !!i);
  // 搜尋同時比對原文和目前語言的顯示字，英文模式下打英文也找得到。
  // 畫面上的英文是彎引號：兩邊都換回直引號再比，玩家打直的或彎的都找得到（#265 審查）。
  const ql = straight(q).toLowerCase();
  const has = (s: string | undefined) =>
    !!s && (s.includes(q) || straight(t(s, scope)).toLowerCase().includes(ql));
  const hit = items.filter((i) => showKind(i) && (!q || has(i.name) || has(i.text) || has(i.kind)));
  const terms = glossary.filter(
    (g) =>
      !q || has(g.term) || has(g.text) || (!!g.en && straight(g.en).toLowerCase().includes(ql)),
  );
  return (
    <>
      {!wide && (
        <button className="evidence-tab" aria-expanded={open} onClick={() => toggle(true)}>
          {t('證據')} <strong>{items.length}</strong>
        </button>
      )}
      {(open || wide) && (
        <div className={wide ? 'side-wrap' : 'sheet-wrap'}>
          {!wide && (
            <button
              className="sheet-back"
              aria-label={t('關閉證據抽屜')}
              onClick={() => toggle(false)}
            />
          )}
          <section className={wide ? 'sheet side' : 'sheet'} aria-label={t('證據抽屜')}>
            <div className="panel-head">
              <nav className="apps sheet-tabs" aria-label={t('抽屜')}>
                <button aria-current={page === 'cards'} onClick={() => setPage('cards')}>
                  {t('證據 {n}', { n: items.length })}
                </button>
                {!noTimeline && (
                  <button aria-current={page === 'timeline'} onClick={() => setPage('timeline')}>
                    {t('時間軸')}
                  </button>
                )}
                <button aria-current={page === 'terms'} onClick={() => setPage('terms')}>
                  {t('法典')}
                </button>
              </nav>
              {!wide && (
                <button className="link" onClick={() => toggle(false)}>
                  {t('關閉')}
                </button>
              )}
            </div>
            {page === 'cards' && note && <p className="muted small">{t(note, scope)}</p>}
            {page !== 'timeline' && (
              <input
                className="find"
                type="search"
                value={q}
                placeholder={page === 'terms' ? t('找名詞，例如「相關性」') : t('找卡片')}
                aria-label={page === 'terms' ? t('找名詞') : t('找卡片')}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
            {page === 'cards' && (
              <>
                <KindFilter items={items} value={kind} onPick={setKind} />
                {/* 清單自己捲：能被鍵盤聚焦，卡片不能選的畫面也捲得到下面（無障礙審查第 3 條）。 */}
                <ul className="stack cards sheet-list" tabIndex={0} aria-label={t('證據清單')}>
                  {motion
                    ? usableFirst(hit, pool, (i) => (
                        <EvidenceCard key={i.id} item={i} pickable={wide} mini />
                      ))
                    : timeGroups(hit, (i) => (
                        <EvidenceCard key={i.id} item={i} pickable={wide} mini />
                      ))}
                  {hit.length === 0 && (
                    <li className="muted">
                      {items.length ? t('沒有符合的卡片。') : t('還沒有任何卡片。')}
                    </li>
                  )}
                </ul>
              </>
            )}
            {page === 'timeline' && (
              <div className="sheet-list">
                <TimelineView rows={rows} />
              </div>
            )}
            {page === 'terms' && (
              <dl className="terms sheet-list" tabIndex={0} aria-label={t('法典')}>
                {terms.map((g) => {
                  const term = t(g.term, scope);
                  return (
                    <div key={g.term} className="term">
                      <dt>
                        {term}
                        {g.en && term.toLowerCase() !== g.en.toLowerCase() && (
                          <span className="muted small"> {g.en}</span>
                        )}
                      </dt>
                      <dd>{t(g.text, scope)}</dd>
                      {g.inGame && (
                        <dd className="in-game">
                          <span className="in-game-label">{t('遊戲裡')}</span>
                          {t(g.inGame, scope)}
                        </dd>
                      )}
                    </div>
                  );
                })}
                {terms.length === 0 && <p className="muted">{t('沒有符合的名詞。')}</p>}
              </dl>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export function EvidenceCard({
  item,
  pickable,
  mini,
}: {
  item: Item;
  pickable?: boolean;
  /** 一行一張的小卡。手機抽屜也用：點一下展開全文，跟桌機一致（體驗評測：手機抽屜一張大卡 520px 高）。 */
  mini?: boolean;
}) {
  const t = useT();
  const scope = useScope();
  const { pool, on, pick, tags } = useCardPick();
  const { progress } = useEpisode();
  const hl = cardHighlights(episodeOf(progress))[item.id];
  const sealed = cardStamps(progress)[item.id];
  const can = !!(pickable && pick && pool.includes(item.id));
  const out = !!(pickable && pick) && !can;
  const cls = item.kind === '論點' ? 'card arg' : 'card';
  // 全文浮出卡畫在 body 上：證據欄會捲動，放在卡片裡會被裁掉。
  const ref = useRef<HTMLLIElement>(null);
  const tipId = useId();
  const [tip, setTip] = useState<{ top: number; right: number } | null>(null);
  // 不能放上連線台的畫面（卷宗、法院系統、庭上）點一下展開全文，再點收起。
  const [open, setOpen] = useState(false);
  // 卷宗資料（設計師 P2-6）：照片紀錄表、證物袋。展開時顯示，完整版在放大檢視。
  const { photo, bag } = dossierOf(episodeOf(progress), item.id);
  const [zoom, setZoom] = useState(false);
  if (pickable || mini) {
    // 證據欄的小卡（UX 規格 P1-12）：一行一張，名稱靠左、時間或種類靠右；內容與出處在浮出卡。
    // 每個桌面分頁長得一樣，不會只有證據板是乾淨的（試玩回報）。
    // 外層 li 保留清單語意，裡面是真的按鈕（無障礙審查第 8 條）。
    const slot = can ? (tags ?? ['A', 'B'])[on.indexOf(item.id)] : undefined;
    const show = () => {
      if (open) return;
      const r = ref.current?.getBoundingClientRect();
      if (r)
        setTip({
          top: Math.min(r.top, window.innerHeight - 240),
          right: window.innerWidth - r.left + 10,
        });
    };
    const hide = () => setTip(null);
    const body = (
      <>
        <p>
          {hl ? <Hl text={item.text} words={hl} live={false} wrap /> : prose(t(item.text, scope))}
        </p>
        <p className="mini-src">
          {t(item.kind)}
          {t('・')}
          {t(item.source, scope)}
        </p>
        <Provenance id={item.id} />
      </>
    );
    const press = () => {
      if (can) pick!(item.id);
      else {
        setOpen(!open);
        hide();
        // 展開後把卡捲進來，停在黏頂的分組小標下面（scroll-margin-top），不讓卡名藏在小標後面（設計師 P2-6 r2 第 14 條）。
        if (!open)
          requestAnimationFrame(() =>
            ref.current?.scrollIntoView({
              block: 'nearest',
              behavior: reducedMotion() ? 'auto' : 'smooth',
            }),
          );
      }
    };
    return (
      <li
        ref={ref}
        className={
          cls +
          ' mini' +
          (can ? ' pickable' : out ? ' out' : '') +
          (slot ? ' on' : '') +
          (open ? ' open' : '')
        }
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <button
          type="button"
          className="mini-btn"
          aria-pressed={can ? !!slot : undefined}
          aria-expanded={can ? undefined : open}
          aria-describedby={tip ? tipId : undefined}
          onClick={press}
          onFocus={show}
          onBlur={hide}
          onKeyDown={(e) => e.key === 'Escape' && tip && (e.stopPropagation(), hide())}
        >
          {item.kind === '物品' && (
            <span className="thumb" aria-hidden>
              {hasPrint(item.id) ? (
                <Print id={item.id} use="thumb" />
              ) : (
                typeof item.image === 'string' && <img src={item.image} alt="" />
              )}
            </span>
          )}
          <strong>{t(item.name, scope)}</strong>
          {/* 論點卡名已經寫「論點 A」、前面又有 ◆，右邊不再寫一次「論點」（體驗評測 v89）。 */}
          {(stamp(item, scope) || item.kind !== '論點') && (
            <span className="mini-meta">{stamp(item, scope) || t(item.kind)}</span>
          )}
          {slot && (
            <span className="slot-tag" aria-label={tags ? slot : t('連線台 {slot}', { slot })}>
              {slot}
            </span>
          )}
        </button>
        {open && (
          <div className="mini-body">
            {sealed && <Stamp text={sealed} sm />}
            {out && <p className="mini-out">{t('這張卡現在用不上，只能看內容。')}</p>}
            {photo ? (
              <PhotoLog photo={photo} id={item.id} image={item.image} use="drawer" />
            ) : (
              <PrintPlate id={item.id} use="drawer" />
            )}
            {bag ? (
              <EvidenceBag bag={bag} progress={progress}>
                {body}
              </EvidenceBag>
            ) : (
              body
            )}
            {(photo || bag) && (
              <button type="button" className="link zoom-open" onClick={() => setZoom(true)}>
                {t('放大')}
              </button>
            )}
          </div>
        )}
        {zoom && <EvidenceZoom item={item} progress={progress} onClose={() => setZoom(false)} />}
        {tip &&
          createPortal(
            <div
              className="mini-full"
              id={tipId}
              role="tooltip"
              style={{ top: tip.top, right: tip.right }}
            >
              <p>{t(item.text, scope)}</p>
              <p className="mini-src">
                {t(item.kind)}
                {t('・')}
                {t(item.source, scope)}
              </p>
            </div>,
            document.body,
          )}
      </li>
    );
  }
  return (
    <li className={cls}>
      <strong>
        {stamp(item, scope) && <span className="time">{stamp(item, scope)}</span>}
        {t(item.name, scope)}
      </strong>
      {sealed && <Stamp text={sealed} sm />}
      <p>{hl ? <Hl text={item.text} words={hl} live={false} /> : t(item.text, scope)}</p>
      <span className="muted small">
        {t(item.kind)}
        {t('・')}
        {t(item.source, scope)}
      </span>
    </li>
  );
}

/**
 * 可以點選的卡片按鈕。第二行就是卡片內容，
 * 所以選卡的時候不用再切到證據庫去對照名字。
 */
export function CardPick({
  item,
  on,
  disabled,
  onPick,
  verb,
  tag,
  compact,
}: {
  item: { id: string; name: string; text: string; date?: string; time?: string; kind?: string };
  on?: boolean;
  disabled?: boolean;
  onPick: () => void;
  /** 名字前面的動作，例如「出示」、「亮出」，或結辯的順序號。 */
  verb?: string;
  /** 名字後面的補充，例如「已洩漏」。 */
  tag?: string;
  /** 一行一張：名稱與種類，選中的那張才展開內容（法院系統的支撐清單）。 */
  compact?: boolean;
}) {
  const t = useT();
  const scope = useScope();
  return (
    <button
      className={['pick', on && 'on', compact && 'compact'].filter(Boolean).join(' ')}
      aria-pressed={on}
      data-kind={item.kind}
      disabled={disabled}
      onClick={onPick}
    >
      <span className="pick-name">
        {verb && <span className="verb">{t(verb)} </span>}
        {stamp(item, scope) && <span className="time">{stamp(item, scope)}</span>}
        {t(item.name, scope)}
        {tag && <span className="muted"> {t(tag, scope)}</span>}
      </span>
      {compact && item.kind && <span className="pick-kind">{t(item.kind)}</span>}
      {(!compact || on) && <span className="pick-text">{t(item.text, scope)}</span>}
    </button>
  );
}

/**
 * 這張紙的出處，右下一行（設定集第 9 章 :4、:11、:44、:71、:117；設計師 p2-1 review1）：
 * - 開示交出的文件印 Bates（跟著分支換交出方）、筆錄與勘誤表印頁行：Courier 700。
 * - 訴狀蓋收文章（「收文」／FILED 加日期）；裁定是法院自己發的，蓋裁定那一刻同一個准予／駁回章。
 *   案號一行 Courier 留在章外。章是早就印在紙上的，不跑蓋章動畫（still）。
 * - 陳述印記錄的時間與記錄人，用上一行（種類・出處）的字，不用 Courier：陳述不是法院紙本。
 * 只有照片的卡，號碼印在沖印本上。
 */
function Provenance({ id }: { id: string }) {
  const t = useT();
  const scope = useScope();
  const { progress } = useEpisode();
  const card = cardIn(episodeOf(progress), id);
  const all = card ? provenanceOf(card, branchContext(progress)) : [];
  return (
    <>
      {all.map((p) =>
        p.kind === 'filed' ? (
          <p key={p.kind} className="mini-prov filed">
            <Stamp
              text={p.ruling ? (p.ruling === 'granted' ? '准予' : '駁回') : '收文'}
              date={p.date}
              rot={tilt(id)}
              sm
              still
            />
            <span className="no">{p.caseNo}</span>
          </p>
        ) : p.kind === 'taken' ? (
          <p key={p.kind} className="mini-prov taken">
            {/* taken.by 是「記錄人＋全形空白＋文件」：上一行已經寫了出處（看守所會見），只留記錄人。 */}
            {t('{at}　記錄：{by}', { at: p.at, by: t(p.by.split('\u3000')[0], scope) })}
          </p>
        ) : (
          <p key={p.kind} className="mini-prov">
            {p.kind === 'bates'
              ? p.bates
              : t('筆錄第 {page} 頁第 {line} 行', { page: p.page, line: p.line })}
          </p>
        ),
      )}
    </>
  );
}

/** 章的角度（±3°）：照卡片 id 算，同一張紙每次重畫都一樣。 */
function tilt(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 7) - 3;
}

/** 卡片上的日期與時間，例如「週五 22:34」。 */
export function stamp(c: { date?: string; time?: string }, scope?: string): string {
  return [c.date && tr(c.date, scope), c.time].filter(Boolean).join(' ');
}

/** 依卡片種類篩選；清單一長，玩家通常只想看某一類（例如只看論點）。 */
export function useKindFilter() {
  const [kind, setKind] = useState<string | null>(null);
  const show = (c: { kind?: string }) => !kind || c.kind === kind;
  return [kind, setKind, show] as const;
}

export function KindFilter({
  items,
  value,
  onPick,
}: {
  items: { kind?: string }[];
  value: string | null;
  onPick: (k: string | null) => void;
}) {
  const t = useT();
  const kinds = [...new Set(items.map((i) => i.kind).filter((k) => !!k))] as string[];
  if (kinds.length < 2) return null;
  const count = (k: string) => items.filter((i) => i.kind === k).length;
  return (
    <div className="chips kinds" role="group" aria-label={t('卡片種類')}>
      <button aria-pressed={value === null} onClick={() => onPick(null)}>
        {t('全部 {n}', { n: items.length })}
      </button>
      {kinds.map((k) => (
        <button key={k} aria-pressed={value === k} onClick={() => onPick(value === k ? null : k)}>
          {t(k)} {count(k)}
        </button>
      ))}
    </div>
  );
}

/** 聲請時的證據欄：能出示的一組在上，其餘一組在下。 */
function usableFirst<T extends { id: string }>(
  items: T[],
  pool: string[],
  render: (item: T) => ReactNode,
) {
  const usable = items.filter((i) => pool.includes(i.id));
  const rest = items.filter((i) => !pool.includes(i.id));
  return [
    <li key="@usable" className="group-head">
      {tr('可出示')} <span>{usable.length}</span>
    </li>,
    ...usable.map(render),
    ...(rest.length
      ? [
          <li key="@unusable" className="group-head">
            {tr('這裡用不上')} <span>{rest.length}</span>
          </li>,
          ...rest.map(render),
        ]
      : []),
  ];
}

/**
 * 有發生時間的事件和其他資料分開列：前者可以放上時間線，後者是文件、鑑定、論點。
 * 兩群都有卡片時才加小標，只有一群就不多此一舉。
 */
export function timeGroups<T extends { id: string; time?: string }>(
  items: T[],
  render: (item: T) => ReactNode,
) {
  const timed = items.filter((i) => i.time);
  const rest = items.filter((i) => !i.time);
  if (!timed.length || !rest.length) return items.map(render);
  return [
    <li key="@timed" className="group-head">
      {tr('有時間的事件')} <span>{timed.length}</span>
    </li>,
    ...timed.map(render),
    <li key="@rest" className="group-head">
      {tr('其他資料')} <span>{rest.length}</span>
    </li>,
    ...rest.map(render),
  ];
}
