import { useState } from 'react';
import { canSubmit } from '../engine/board';
import { episode, useGame } from '../engine/store';
import { RelationPicker } from './RelationPicker';
import { Timeline } from './Timeline';

type Tab = 'chains' | 'timeline' | 'cards';

export function Board() {
  const { board, goToCourt } = useGame();
  const [tab, setTab] = useState<Tab>('chains');
  return (
    <main className="board-screen">
      <header className="topbar">
        <div className="meters">
          <span>
            工時 <strong>{board.hours}</strong> / {episode.hours}
          </span>
          <span>
            論點 <strong>{board.confirmed.length}</strong> / {episode.questions.length}
          </span>
        </div>
        <button className="primary" onClick={goToCourt}>
          開庭
        </button>
      </header>
      <nav className="tabs" role="tablist">
        {(
          [
            ['chains', '推理鏈'],
            ['timeline', '時間線'],
            ['cards', '卡片'],
          ] as const
        ).map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === 'chains' && <Chains />}
      {tab === 'timeline' && <TimelineTab />}
      {tab === 'cards' && <Cards />}
    </main>
  );
}

function Chains() {
  const { board, feedback, toggleCard, setRelation, submit } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      {episode.questions.map((q) => {
        const a = board.attempts[q.id] ?? { cards: [], relation: null };
        const done = board.confirmed.includes(q.id);
        return (
          <section key={q.id} className={done ? 'panel chain done' : 'panel chain'}>
            <h2>{q.text}</h2>
            {done ? (
              <div className="argument">
                <strong>{q.argument.name}</strong>
                <p>{q.argument.text}</p>
              </div>
            ) : (
              <>
                <div className="slots">
                  {q.answer.map((_, i) => {
                    const id = a.cards[i];
                    const card = episode.cards.find((c) => c.id === id);
                    return (
                      <button
                        key={i}
                        className={card ? 'slot filled' : 'slot'}
                        onClick={() => (card ? toggleCard(q.id, card.id) : setOpen(q.id))}
                      >
                        {card ? card.name : '＋ 放卡片'}
                      </button>
                    );
                  })}
                </div>
                {open === q.id && (
                  <ul className="picker" aria-label="選擇卡片">
                    {episode.cards.map((c) => (
                      <li key={c.id}>
                        <button
                          aria-pressed={a.cards.includes(c.id)}
                          onClick={() => toggleCard(q.id, c.id)}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button className="link" onClick={() => setOpen(null)}>
                        收起
                      </button>
                    </li>
                  </ul>
                )}
                <RelationPicker
                  cards={a.cards.map((id) => episode.cards.find((c) => c.id === id)?.name)}
                  value={a.relation}
                  onPick={(r) => setRelation(q.id, r)}
                />
                <button
                  className="primary"
                  disabled={!canSubmit(episode, board, q.id)}
                  onClick={() => submit(q.id)}
                >
                  提交到案情會議（1 工時）
                </button>
              </>
            )}
            {feedback[q.id] && <p className="note">{feedback[q.id]}</p>}
          </section>
        );
      })}
    </div>
  );
}

function TimelineTab() {
  const { board, toggleTimeline, moveTimeline } = useGame();
  return (
    <Timeline
      cards={episode.cards}
      placed={board.timeline}
      onToggle={toggleTimeline}
      onMove={moveTimeline}
    />
  );
}

function Cards() {
  return (
    <ul className="stack cards">
      {episode.cards.map((c) => (
        <li key={c.id} className="panel card">
          <div className="card-head">
            <strong>{c.name}</strong>
            <span className="tag">{c.kind}</span>
            {c.admitted && <span className="tag">已採納</span>}
          </div>
          <p>{c.text}</p>
        </li>
      ))}
    </ul>
  );
}
