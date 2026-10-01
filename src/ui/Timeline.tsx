import { useRef, useState, type PointerEvent } from 'react';
import { stamp } from './Evidence';
/** 時間線：順序由玩家自己排。遊戲不會自動排序，也不會標出衝突（企劃書 6.5）。 */
export interface TimelineCard {
  id: string;
  name: string;
  text: string;
  date?: string;
  time?: string;
}

export function Timeline({
  cards,
  placed,
  onToggle,
  onMove,
}: {
  cards: TimelineCard[];
  placed: string[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const timed = cards.filter((c) => c.time);
  const rows = placed.map((id) => timed.find((c) => c.id === id)).filter((c) => !!c);
  const loose = timed.filter((c) => !placed.includes(c.id));
  // 拖曳：被拖的那列跟著手指走，其他列用位移讓位，放開才真的搬。整段只改 transform，不重排版面。
  const [drag, setDrag] = useState<{
    id: string;
    from: number;
    to: number;
    y0: number;
    dy: number;
    h: number;
    mids: number[];
  } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const grab = (e: PointerEvent<HTMLButtonElement>, id: string, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const els = [...(list.current?.children ?? [])];
    const rect = els[i].getBoundingClientRect();
    const next = els[i + 1]?.getBoundingClientRect();
    const mids = els
      .filter((_, k) => k !== i)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    setDrag({
      id,
      from: i,
      to: i,
      y0: e.clientY,
      dy: 0,
      h: next ? next.top - rect.top : rect.height + 14,
      mids,
    });
  };
  const slide = (e: PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    const mid = e.clientY;
    const to = drag.mids.filter((m) => m < mid).length;
    setDrag({ ...drag, dy, to });
  };
  const drop = () => {
    if (!drag) return;
    const dir = drag.to > drag.from ? 1 : -1;
    for (let k = 0; k < Math.abs(drag.to - drag.from); k++) onMove(drag.id, dir);
    setDrag(null);
  };
  const shift = (k: number) => {
    if (!drag || k === drag.from) return drag ? drag.dy : 0;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -drag.h;
    if (drag.to < drag.from && k >= drag.to && k < drag.from) return drag.h;
    return 0;
  };
  return (
    <section className="panel timeline-panel">
      {/* 還沒放上去的卡片釘在上緣：時間軸再長，加卡片也不必捲回去。 */}
      <div className="timeline-tray">
        <h2>
          時間軸{' '}
          <span className="muted small">
            {rows.length} / {timed.length}
          </span>
        </h2>
        {loose.length > 0 ? (
          <div className="chips kinds" role="group" aria-label="還沒放上時間軸的卡片">
            {loose.map((c) => (
              <button key={c.id} aria-pressed={false} onClick={() => onToggle(c.id)}>
                ＋ {stamp(c)} {c.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">
            {timed.length ? '有時間的卡片都放上去了。' : '目前沒有帶時間的卡片。'}
          </p>
        )}
      </div>
      <p className="muted small">
        按住右邊的把手拖曳排序。順序由你排，遊戲不會幫你排，也不會告訴你哪兩件事兜不起來。
      </p>
      {rows.length === 0 ? (
        <p className="muted">點上面的卡片，把它放上時間軸。</p>
      ) : (
        <ol className={drag ? 'timeline sorting' : 'timeline'} ref={list}>
          {rows.map((c, i) => (
            <li
              key={c.id}
              className={drag?.id === c.id ? 'dragging' : undefined}
              style={drag ? { transform: `translateY(${shift(i)}px)` } : undefined}
            >
              <button
                className="grip"
                aria-label={`移動「${c.name}」：拖曳，或用上下鍵`}
                onPointerDown={(e) => grab(e, c.id, i)}
                onPointerMove={slide}
                onPointerUp={drop}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' && i > 0) onMove(c.id, -1);
                  else if (e.key === 'ArrowDown' && i < rows.length - 1) onMove(c.id, 1);
                  else return;
                  e.preventDefault();
                }}
              >
                <span aria-hidden>⋮⋮</span>
              </button>
              <time>{stamp(c)}</time>
              <div>
                <strong>{c.name}</strong>
                <p>{c.text}</p>
              </div>
              <button
                className="drop-off"
                aria-label={`把「${c.name}」拿下來`}
                onClick={() => onToggle(c.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 唯讀的時間軸：庭上、談判時從證據抽屜翻出來對照。 */
export function TimelineView({ rows }: { rows: TimelineCard[] }) {
  if (rows.length === 0)
    return <p className="muted">時間軸上還沒有東西。調查時在證據板排好，這裡就看得到。</p>;
  return (
    <ol className="timeline readonly">
      {rows.map((c) => (
        <li key={c.id}>
          <time>{stamp(c)}</time>
          <div>
            <strong>{c.name}</strong>
            <p>{c.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
