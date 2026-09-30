import { useState } from 'react';
import * as depo from '../engine/episode/deposition';
import type { DepositionScene } from '../engine/episode/schema';
import { depoState, useEpisode } from '../engine/game';
import { Speech } from './Portrait';

/** 證詞錄取（企劃書 6.7）：12 個提問額度，定錨與探路互相衝突。 */
export function Deposition({ scene }: { scene: DepositionScene }) {
  const { progress, askDepo, finishDepo, advance } = useEpisode();
  const st = depoState(progress, scene);
  const [intro, setIntro] = useState(st.log.length === 0);
  const [topic, setTopic] = useState(scene.topics[0].id);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {scene.act}・{scene.place}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          開始錄取
        </button>
      </main>
    );

  if (depo.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">錄取結束</p>
        <dl className="stats">
          <dt>用掉的提問</dt>
          <dd>
            {scene.budget - st.left} / {scene.budget}
          </dd>
          <dt>宣誓下定錨的說法</dt>
          <dd>{st.anchored.length} 項</dd>
          <dt>洩漏給對方的方向</dt>
          <dd>{st.exposed.length} 個</dd>
        </dl>
        {st.exposed.length > 0 && (
          <p className="muted">
            對方知道妳往哪裡查了。這些論點在庭上的衝擊減半，除非妳先破解他們的反擊。
          </p>
        )}
        <div className="lines">
          {scene.outro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={advance}>
          繼續
        </button>
      </main>
    );

  return (
    <main className="court-screen">
      <header className="panel-head bench">
        <p className="eyebrow">
          {scene.witness.name}・{scene.witness.role}
        </p>
        <p className="patience" aria-label={`剩餘提問 ${st.left} 個`}>
          剩餘提問 <strong>{st.left}</strong>
        </p>
      </header>

      <div className="lines transcript" aria-live="polite">
        {st.log.map((l, i) => (
          <Speech key={i} line={l} />
        ))}
        {st.log.length === 0 && <p className="muted">速記員在等妳的第一個問題。</p>}
      </div>

      <nav className="apps" aria-label="話題">
        {scene.topics.map((t) => (
          <button key={t.id} aria-current={topic === t.id} onClick={() => setTopic(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <section className="panel">
        <ul className="stack">
          {depo.questionsOf(scene, topic).map((q) => (
            <li key={q.id}>
              <button
                className="wide"
                disabled={!depo.canAsk(st, q.id)}
                onClick={() => askDepo(q.id)}
              >
                {q.q}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={finishDepo}>結束錄取</button>
      </section>
    </main>
  );
}
