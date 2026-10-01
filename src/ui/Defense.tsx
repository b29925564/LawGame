import { useState } from 'react';
import * as defense from '../engine/episode/defense';
import type { DefenseScene } from '../engine/episode/schema';
import { defenseState, juryAfterTrial, useEpisode } from '../engine/game';
import { JuryLegend } from './JuryLegend';
import { Speech } from './Portrait';
import { Transcript } from './Shell';

/**
 * 辯方證人（企劃書 6.9.6）：先準備，再直接詰問。
 * 外觀是最小版，版面交給介面串。
 */
export function Defense({ scene }: { scene: DefenseScene }) {
  const { progress, prepareWitness, askWitness, finishWitness, advance } = useEpisode();
  const st = defenseState(progress, scene);
  const [intro, setIntro] = useState(st.stage === 'prep' && st.log.length === 0);
  const rules = juryAfterTrial(progress)?.rules;

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {scene.act}
          {scene.day ? `・${scene.day}` : ''}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          準備{scene.witness.name}出庭
        </button>
      </main>
    );

  if (st.stage === 'prep')
    return (
      <main className="scene">
        <p className="eyebrow">
          證人準備・{scene.witness.name}（{scene.witness.role}）・{scene.prep.hours} 工時
        </p>
        <ul className="stack">
          {scene.prep.options.map((o) => (
            <li key={o.id} className="panel">
              <strong>{o.label}</strong>
              <p className="muted">{o.detail}</p>
              <button className="primary" onClick={() => prepareWitness(o.id)}>
                就這樣準備
              </button>
            </li>
          ))}
        </ul>
      </main>
    );

  const left = scene.asks - st.asked.length;
  return (
    <main className="scene">
      <p className="eyebrow">
        直接詰問・{scene.witness.name}
        {st.stage === 'direct' ? `・還能問 ${left} 題` : ''}
      </p>
      {rules && <JuryLegend jury={st.jury} threshold={rules.threshold} />}
      <Transcript count={st.log.length}>
        {st.log.map((l, i) => (
          <Speech key={i} line={{ who: l.who, text: l.text, mood: '平', thought: false }} />
        ))}
      </Transcript>
      {st.stage === 'direct' ? (
        <>
          <p className="muted small">只能用開放式問題，照時間順序問才連貫。</p>
          <ul className="stack">
            {[...scene.questions]
              .sort((a, b) => a.seq - b.seq)
              .map((q) => (
                <li key={q.id}>
                  <button
                    className="wide"
                    disabled={!defense.canAsk(scene, st, q.id)}
                    onClick={() => askWitness(q.id)}
                  >
                    {q.q}
                  </button>
                </li>
              ))}
          </ul>
          <button className="primary" onClick={finishWitness}>
            問完了
          </button>
        </>
      ) : (
        <button className="primary next" onClick={advance}>
          繼續
        </button>
      )}
    </main>
  );
}
