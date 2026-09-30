/** 時間線：順序由玩家自己排。遊戲不會自動排序，也不會標出衝突（企劃書 6.5）。 */
export interface TimelineCard {
  id: string;
  name: string;
  text: string;
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
  return (
    <div className="stack">
      <section className="panel">
        <h2>時間軸</h2>
        <p className="muted small">順序由你排。遊戲不會幫你排，也不會告訴你哪兩件事兜不起來。</p>
        {rows.length === 0 ? (
          <p className="muted">把有時間的卡片放上來。</p>
        ) : (
          <ol className="timeline">
            {rows.map((c, i) => (
              <li key={c.id}>
                <time>{c.time}</time>
                <div>
                  <strong>{c.name}</strong>
                  <p>{c.text}</p>
                </div>
                <span className="row order">
                  <button
                    aria-label={`把「${c.name}」往前移`}
                    disabled={i === 0}
                    onClick={() => onMove(c.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`把「${c.name}」往後移`}
                    disabled={i === rows.length - 1}
                    onClick={() => onMove(c.id, 1)}
                  >
                    ↓
                  </button>
                  <button aria-label={`把「${c.name}」拿下來`} onClick={() => onToggle(c.id)}>
                    ✕
                  </button>
                </span>
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
              {c.time} {c.name}
            </button>
          ))}
          {timed.length === 0 && <span className="muted">目前沒有帶時間的卡片。</span>}
        </div>
      </section>
    </div>
  );
}
