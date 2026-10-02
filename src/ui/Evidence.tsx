import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { glossary } from '../content/glossary';
import {
  deskSceneOf,
  episodeOf,
  deskState,
  evidence,
  useEpisode,
  type Evidence as Item,
} from '../engine/game';
import { t as tr, useT } from '../i18n';
import { useScope } from './lang';
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
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const [kind, setKind, showKind] = useKindFilter();
  // 抽屜分三頁：手上的證據、排好的時間軸、法典百科。庭上、談判時都翻得到。
  const [want, setPage] = useState<'cards' | 'timeline' | 'terms'>('cards');
  // 證據板上時間軸的家是疑問清單第一列，抽屜不再放一份（UX 規格：一樣東西只有一個家）。
  const page = noTimeline && want === 'timeline' ? 'cards' : want;
  const scene = deskSceneOf(progress);
  const placed = scene ? deskState(progress, scene).timeline : [];
  const rows = placed.map((id) => items.find((i) => i.id === id)).filter((i) => !!i);
  // 搜尋同時比對原文和目前語言的顯示字，英文模式下打英文也找得到。
  const has = (s: string | undefined) =>
    !!s && (s.includes(q) || t(s, scope).toLowerCase().includes(q.toLowerCase()));
  const hit = items.filter((i) => showKind(i) && (!q || has(i.name) || has(i.text) || has(i.kind)));
  const terms = glossary.filter(
    (g) => !q || has(g.term) || has(g.text) || g.en?.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      {!wide && (
        <button className="evidence-tab" aria-expanded={open} onClick={() => setOpen(true)}>
          {t('證據')} <strong>{items.length}</strong>
        </button>
      )}
      {(open || wide) && (
        <div className={wide ? 'side-wrap' : 'sheet-wrap'}>
          {!wide && (
            <button
              className="sheet-back"
              aria-label={t('關閉證據抽屜')}
              onClick={() => setOpen(false)}
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
                <button className="link" onClick={() => setOpen(false)}>
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
                <ul className="stack cards sheet-list">
                  {timeGroups(hit, (i) => (
                    <EvidenceCard key={i.id} item={i} pickable={wide} />
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
              <dl className="terms sheet-list">
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
                      {g.inGame && <dd className="in-game">{t(g.inGame, scope)}</dd>}
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

export function EvidenceCard({ item, pickable }: { item: Item; pickable?: boolean }) {
  const t = useT();
  const scope = useScope();
  const { pool, on, pick } = useCardPick();
  const { progress } = useEpisode();
  const hl = cardHighlights(episodeOf(progress))[item.id];
  const sealed = cardStamps(progress)[item.id];
  const can = pickable && pick && pool.includes(item.id);
  const cls = item.kind === '論點' ? 'card arg' : 'card';
  // 全文浮出卡畫在 body 上：證據欄會捲動，放在卡片裡會被裁掉。
  const ref = useRef<HTMLLIElement>(null);
  const tipId = useId();
  const [tip, setTip] = useState<{ top: number; right: number } | null>(null);
  if (can) {
    // 證據板右欄的小卡（UX 規格 P1-12）：一行一張，名稱靠左、時間或種類靠右；內容與出處在浮出卡。
    // 外層 li 保留清單語意，裡面是真的按鈕（無障礙審查第 8 條）。
    const slot = ['A', 'B'][on.indexOf(item.id)];
    const show = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r)
        setTip({
          top: Math.min(r.top, window.innerHeight - 240),
          right: window.innerWidth - r.left + 10,
        });
    };
    const hide = () => setTip(null);
    return (
      <li
        ref={ref}
        className={cls + ' pickable mini' + (slot ? ' on' : '')}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <button
          type="button"
          className="mini-btn"
          aria-pressed={!!slot}
          aria-describedby={tip ? tipId : undefined}
          onClick={() => pick(item.id)}
          onFocus={show}
          onBlur={hide}
          onKeyDown={(e) => e.key === 'Escape' && tip && (e.stopPropagation(), hide())}
        >
          {item.kind === '物品' && (
            <span className="thumb" aria-hidden>
              {typeof item.image === 'string' && <img src={item.image} alt="" />}
            </span>
          )}
          <strong>{t(item.name, scope)}</strong>
          <span className="mini-meta">{stamp(item, scope) || t(item.kind)}</span>
          {slot && (
            <span className="slot-tag" aria-label={t('連線台 {slot}', { slot })}>
              {slot}
            </span>
          )}
        </button>
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
}: {
  item: { id: string; name: string; text: string; date?: string; time?: string; kind?: string };
  on?: boolean;
  disabled?: boolean;
  onPick: () => void;
  /** 名字前面的動作，例如「出示」、「亮出」，或結辯的順序號。 */
  verb?: string;
  /** 名字後面的補充，例如「已洩漏」。 */
  tag?: string;
}) {
  const t = useT();
  const scope = useScope();
  return (
    <button
      className={on ? 'pick on' : 'pick'}
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
      <span className="pick-text">{t(item.text, scope)}</span>
    </button>
  );
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
