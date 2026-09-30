import { useEffect, useRef, useState } from 'react';
import { confirmedArguments } from '../engine/board';
import { hasFoundation } from '../engine/cross';
import { tags, type Argument, type Tag } from '../engine/schema';
import { episode, useGame } from '../engine/store';
import { JuryPanel } from './JuryPanel';

export function Court() {
  const cross = useGame((s) => s.cross)!;
  const { expert, witness } = episode;
  const who = cross.stage === 'expert' ? expert : witness;
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [cross.log]);
  return (
    <main className="court">
      {/* 手機上陪審團和最新對話固定在上方，操作時才看得到他們的反應。 */}
      <div className="court-head">
        <header className="meters">
          <span aria-label="法官耐心">
            法官耐心 {'●'.repeat(Math.max(0, cross.patience))}
            {'○'.repeat(episode.patience - Math.max(0, cross.patience))}
          </span>
          {cross.stage !== 'closing' && <span className="muted">證人：{who.name}</span>}
        </header>
        <JuryPanel jury={cross.jury} deltas={cross.deltas} compact />
        <div className="transcript" ref={log} aria-live="polite">
          {cross.log.map((l, i) => (
            <p key={i}>
              <strong>{l.who}：</strong>
              {l.text}
            </p>
          ))}
        </div>
      </div>
      {cross.stage === 'expert' && <ExpertActions />}
      {cross.stage === 'witness' && <WitnessActions />}
      {cross.stage === 'closing' && <Closing />}
    </main>
  );
}

function ExpertActions() {
  const { askExpert, toWitness } = useGame();
  return (
    <section className="panel actions">
      <h2>你的問題</h2>
      {episode.expert.questions.map((q) => (
        <button key={q.id} className="question" onClick={() => askExpert(q.id)}>
          {q.q}
        </button>
      ))}
      <button className="primary" onClick={toWitness}>
        結束詰問
      </button>
    </section>
  );
}

function WitnessActions() {
  const { cross, board, lock, setup, irrelevant, confront, toClosing } = useGame();
  const [picking, setPicking] = useState<string | null>(null);
  const args = confirmedArguments(episode, board);
  return (
    <section className="stack">
      {episode.witness.claims.map((cl, i) => {
        const st = cross!.claims[cl.id];
        // 兩種措辭輪流排前面，不讓位置透露哪個問法比較好。
        const phrasings = i % 2 ? (['weak', 'strong'] as const) : (['strong', 'weak'] as const);
        const done = st.result !== 'none';
        return (
          <article key={cl.id} className={done ? 'panel claim done' : 'panel claim'}>
            <p className="claim-text">{cl.text}</p>
            <ol className="steps">
              <li data-on={st.lock !== 'none'}>鎖定</li>
              <li data-on={hasFoundation(episode, cross!, cl.id)}>鋪陳</li>
              <li data-on={done}>對質</li>
            </ol>
            {!done && (
              <div className="stack">
                {phrasings.map((h) => (
                  <button key={h} className="question" onClick={() => lock(cl.id, h)}>
                    {cl.lock[h].q}
                  </button>
                ))}
                <button className="question" onClick={() => setup(cl.id)}>
                  {cl.setup.q}
                </button>
                {picking === cl.id ? (
                  <ArgPicker
                    args={args}
                    onPick={(a) => {
                      setPicking(null);
                      confront(cl.id, a);
                    }}
                    onCancel={() => setPicking(null)}
                  />
                ) : (
                  <button className="primary" onClick={() => setPicking(cl.id)}>
                    出示論點
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
      <section className="panel actions">
        {episode.witness.irrelevant.map((q, i) => (
          <button key={i} className="question" onClick={() => irrelevant(i)}>
            {q.q}
          </button>
        ))}
        <button onClick={toClosing}>結束詰問，進入結辯</button>
      </section>
    </section>
  );
}

function ArgPicker(props: {
  args: Argument[];
  onPick: (a: Argument) => void;
  onCancel: () => void;
}) {
  return (
    <div className="picker">
      {props.args.length === 0 && <p className="muted">你沒有確認任何論點。</p>}
      {props.args.map((a) => (
        <button key={a.id} onClick={() => props.onPick(a)}>
          {a.name}
        </button>
      ))}
      <button className="link" onClick={props.onCancel}>
        取消
      </button>
    </div>
  );
}

function Closing() {
  const { board, closing } = useGame();
  const args = confirmedArguments(episode, board);
  const [picked, setPicked] = useState<string[]>([]);
  const [tone, setTone] = useState<Tag>('邏輯');
  const max = episode.closing.max;
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p,
    );
  return (
    <section className="panel actions">
      <h2>結辯：選最多 {max} 個論點</h2>
      {args.length === 0 && <p className="muted">你沒有確認任何論點，只能空手結辯。</p>}
      {args.map((a) => (
        <button key={a.id} aria-pressed={picked.includes(a.id)} onClick={() => toggle(a.id)}>
          {a.name}
        </button>
      ))}
      <h2>基調</h2>
      <div className="relations" role="radiogroup" aria-label="基調">
        {tags.map((t) => (
          <button key={t} role="radio" aria-checked={tone === t} onClick={() => setTone(t)}>
            {t}
          </button>
        ))}
      </div>
      <button
        className="primary"
        onClick={() =>
          closing(
            args.filter((a) => picked.includes(a.id)),
            tone,
          )
        }
      >
        結辯，交給陪審團
      </button>
    </section>
  );
}
