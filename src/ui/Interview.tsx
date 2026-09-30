import { useState } from 'react';
import * as interview from '../engine/episode/interview';
import type { InterviewScene } from '../engine/episode/schema';
import { interviewState, useEpisode } from '../engine/game';
import { Portrait, Speech } from './Portrait';

/** 訪談（企劃書 6.3）：提問、施壓、安撫。視訊通話畫面。 */
export function Interview({ scene }: { scene: InterviewScene }) {
  const { progress, advance, ask, press, calm } = useEpisode();
  const st = interviewState(progress, scene);
  const [tab, setTab] = useState<'ask' | 'press'>('ask');
  const topics = interview.openTopics(scene, st, progress.cards);
  const canFinish = interview.canFinish(scene, st);
  const lastMood = [...st.log].reverse().find((l) => l.who === scene.who)?.mood ?? '平';

  return (
    <main className="scene interview">
      <header className="call panel">
        <Portrait who={scene.who} mood={lastMood} />
        <div>
          <h2>{scene.who}</h2>
          <p className="muted">
            {scene.role}・{scene.via}
          </p>
        </div>
        <p className="meter" aria-label={`${scene.meter.label} ${st.guard} / ${scene.meter.max}`}>
          <span className="muted">{scene.meter.label}</span>
          <span className="pips" aria-hidden>
            {Array.from({ length: scene.meter.max }, (_, i) => (
              <span key={i} className={i < st.guard ? 'pip on' : 'pip'} />
            ))}
          </span>
        </p>
      </header>

      <div className="lines" aria-live="polite">
        {st.log.map((l, i) => (
          <Speech key={i} line={l} />
        ))}
      </div>

      {st.over ? null : (
        <section className="panel actions">
          <div className="row" role="tablist">
            <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>
              提問
            </button>
            <button role="tab" aria-selected={tab === 'press'} onClick={() => setTab('press')}>
              施壓
            </button>
            <button onClick={calm}>安撫</button>
          </div>
          {tab === 'ask' ? (
            <ul className="stack">
              {topics.map((t) => (
                <li key={t.id}>
                  <button className="wide" onClick={() => ask(t.id)}>
                    {t.label}
                  </button>
                </li>
              ))}
              {topics.length === 0 && <li className="muted">沒有別的想問了。</li>}
            </ul>
          ) : (
            <ul className="stack">
              {scene.press
                .filter((p) => !st.pressed.includes(p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button className="wide" onClick={() => press(p.id)}>
                      {p.label}
                    </button>
                  </li>
                ))}
              <li className="muted">施壓會讓他更防備。手上有東西撐著再問。</li>
            </ul>
          )}
        </section>
      )}

      <button className="primary next" disabled={!canFinish} onClick={advance}>
        {st.over ? '離開會見室' : canFinish ? '結束會見' : '還有關鍵的事沒問'}
      </button>
    </main>
  );
}
