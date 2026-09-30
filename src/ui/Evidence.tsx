import { useEffect, useState } from 'react';
import { evidence, useEpisode, type Evidence as Item } from '../engine/game';

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
  const hit = items.filter(
    (i) => !q || i.name.includes(q) || i.text.includes(q) || i.kind.includes(q),
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
              <h2>手上的證據</h2>
              <button className="link" onClick={() => setOpen(false)}>
                關閉
              </button>
            </div>
            {note && <p className="muted small">{note}</p>}
            <input
              className="find"
              type="search"
              value={q}
              placeholder="找卡片"
              aria-label="找卡片"
              onChange={(e) => setQ(e.target.value)}
            />
            <ul className="stack cards sheet-list">
              {hit.map((i) => (
                <EvidenceCard key={i.id} item={i} />
              ))}
              {hit.length === 0 && (
                <li className="muted">{items.length ? '沒有符合的卡片。' : '還沒有任何卡片。'}</li>
              )}
            </ul>
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
