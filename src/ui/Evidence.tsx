import { useEffect, useState, type ReactNode } from 'react';
import { glossary } from '../content/glossary';
import {
  deskSceneOf,
  deskState,
  evidence,
  useEpisode,
  type Evidence as Item,
} from '../engine/game';
import { TimelineView } from './Timeline';

/**
 * 證據抽屜。
 *
 * 推理鏈、動議、對質、結辯都要一邊看卡片內容一邊選，
 * 以前只能切到證據庫分頁再切回來，位置也跟著跑掉。
 * 抽屜是浮在畫面上的，打開關上都不會動到你正在做的事。
 */
export function EvidenceDrawer({ note }: { note?: string }) {
  const progress = useEpisode((s) => s.progress);
  const items = evidence(progress);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const [kind, setKind, showKind] = useKindFilter();
  // 抽屜分三頁：手上的證據、排好的時間軸、法典百科。庭上、談判時都翻得到。
  const [page, setPage] = useState<'cards' | 'timeline' | 'terms'>('cards');
  const scene = deskSceneOf(progress);
  const placed = scene ? deskState(progress, scene).timeline : [];
  const rows = placed.map((id) => items.find((i) => i.id === id)).filter((i) => !!i);
  const hit = items.filter(
    (i) => showKind(i) && (!q || i.name.includes(q) || i.text.includes(q) || i.kind.includes(q)),
  );
  const terms = glossary.filter(
    (t) =>
      !q ||
      t.term.includes(q) ||
      t.text.includes(q) ||
      t.en?.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <button className="evidence-tab" aria-expanded={open} onClick={() => setOpen(true)}>
        證據 <strong>{items.length}</strong>
      </button>
      {open && (
        <div className="sheet-wrap">
          <button className="sheet-back" aria-label="關閉證據抽屜" onClick={() => setOpen(false)} />
          <section className="sheet" aria-label="證據抽屜">
            <div className="panel-head">
              <nav className="apps sheet-tabs" aria-label="抽屜">
                <button aria-current={page === 'cards'} onClick={() => setPage('cards')}>
                  證據 {items.length}
                </button>
                <button aria-current={page === 'timeline'} onClick={() => setPage('timeline')}>
                  時間軸
                </button>
                <button aria-current={page === 'terms'} onClick={() => setPage('terms')}>
                  法典
                </button>
              </nav>
              <button className="link" onClick={() => setOpen(false)}>
                關閉
              </button>
            </div>
            {page === 'cards' && note && <p className="muted small">{note}</p>}
            {page !== 'timeline' && (
              <input
                className="find"
                type="search"
                value={q}
                placeholder={page === 'terms' ? '找名詞，例如「相關性」' : '找卡片'}
                aria-label={page === 'terms' ? '找名詞' : '找卡片'}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
            {page === 'cards' && (
              <>
                <KindFilter items={items} value={kind} onPick={setKind} />
                <ul className="stack cards sheet-list">
                  {timeGroups(hit, (i) => (
                    <EvidenceCard key={i.id} item={i} />
                  ))}
                  {hit.length === 0 && (
                    <li className="muted">
                      {items.length ? '沒有符合的卡片。' : '還沒有任何卡片。'}
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
                {terms.map((t) => (
                  <div key={t.term} className="term">
                    <dt>
                      {t.term}
                      {t.en && <span className="muted small"> {t.en}</span>}
                    </dt>
                    <dd>{t.text}</dd>
                    {t.inGame && <dd className="in-game">{t.inGame}</dd>}
                  </div>
                ))}
                {terms.length === 0 && <p className="muted">沒有符合的名詞。</p>}
              </dl>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export function EvidenceCard({ item }: { item: Item }) {
  return (
    <li className={item.kind === '論點' ? 'card arg' : 'card'}>
      <strong>
        {stamp(item) && <span className="time">{stamp(item)}</span>}
        {item.name}
      </strong>
      <p>{item.text}</p>
      <span className="muted small">
        {item.kind}・{item.source}
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
  return (
    <button
      className={on ? 'pick on' : 'pick'}
      aria-pressed={on}
      data-kind={item.kind}
      disabled={disabled}
      onClick={onPick}
    >
      <span className="pick-name">
        {verb && <span className="verb">{verb} </span>}
        {stamp(item) && <span className="time">{stamp(item)}</span>}
        {item.name}
        {tag && <span className="muted"> {tag}</span>}
      </span>
      <span className="pick-text">{item.text}</span>
    </button>
  );
}

/** 卡片上的日期與時間，例如「週五 22:34」。 */
export function stamp(c: { date?: string; time?: string }): string {
  return [c.date, c.time].filter(Boolean).join(' ');
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
  const kinds = [...new Set(items.map((i) => i.kind).filter((k) => !!k))] as string[];
  if (kinds.length < 2) return null;
  const count = (k: string) => items.filter((i) => i.kind === k).length;
  return (
    <div className="chips kinds" role="group" aria-label="卡片種類">
      <button aria-pressed={value === null} onClick={() => onPick(null)}>
        全部 {items.length}
      </button>
      {kinds.map((k) => (
        <button key={k} aria-pressed={value === k} onClick={() => onPick(value === k ? null : k)}>
          {k} {count(k)}
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
      有時間的事件 <span>{timed.length}</span>
    </li>,
    ...timed.map(render),
    <li key="@rest" className="group-head">
      其他資料 <span>{rest.length}</span>
    </li>,
    ...rest.map(render),
  ];
}
