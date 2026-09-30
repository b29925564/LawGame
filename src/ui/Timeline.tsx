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
  // 拖曳時先在畫面上預覽新位置，放開才一次搬過去；大調度不必一格一格按。
  const [drag, setDrag] = useState<{ id: string; to: number; mids: number[] } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const shown = (() => {
    if (!drag) return rows;
    const rest = rows.filter((c) => c.id !== drag.id);
    const moving = rows.find((c) => c.id === drag.id)!;
    return [...rest.slice(0, drag.to), moving, ...rest.slice(drag.to)];
  })();
  const grab = (e: PointerEvent<HTMLButtonElement>, id: string, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const mids = [...(list.current?.children ?? [])]
      .filter((_, k) => k !== i)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    setDrag({ id, to: i, mids });
  };
  const slide = (e: PointerEvent) => {
    if (!drag) return;
    const to = drag.mids.filter((m) => m < e.clientY).length;
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const drop = () => {
    if (!drag) return;
    const from = placed.indexOf(drag.id);
    const dir = drag.to > from ? 1 : -1;
    for (let k = 0; k < Math.abs(drag.to - from); k++) onMove(drag.id, dir);
    setDrag(null);
  };
  return (
    <div className="stack">
      <section className="panel">
        <h2>時間軸</h2>
        <p className="muted small">
          按住左邊的把手拖曳排序。順序由你排，遊戲不會幫你排，也不會告訴你哪兩件事兜不起來。
        </p>
        {rows.length === 0 ? (
          <p className="muted">把有時間的卡片放上來。</p>
        ) : (
          <ol className="timeline" ref={list}>
            {shown.map((c, i) => (
              <li key={c.id} className={drag?.id === c.id ? 'dragging' : undefined}>
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
      <section className="panel">
        <h2>有時間的卡片</h2>
        <div className="chips">
          {timed.map((c) => (
            <button key={c.id} aria-pressed={placed.includes(c.id)} onClick={() => onToggle(c.id)}>
              {stamp(c)} {c.name}
            </button>
          ))}
          {timed.length === 0 && <span className="muted">目前沒有帶時間的卡片。</span>}
        </div>
      </section>
    </div>
  );
}
