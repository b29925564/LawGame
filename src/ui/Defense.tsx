import { useState } from 'react';
import * as defense from '../engine/episode/defense';
import type { DefenseScene } from '../engine/episode/schema';
import { defenseState, juryAfterTrial, useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { JuryLegend } from './JuryLegend';
import { useScope } from './lang';
import { MarkLines } from './Marks';
import { Speech } from './Portrait';
import { Transcript } from './Shell';

/**
 * 辯方證人（企劃書 6.9.6）：先準備，再直接詰問。
 * 外觀是最小版，版面交給介面串。
 */
export function Defense({ scene }: { scene: DefenseScene }) {
  const { progress, prepareWitness, askWitness, finishWitness, advance } = useEpisode();
  const st = defenseState(progress, scene);
  const t = useT();
  const scope = useScope();
  const [intro, setIntro] = useState(st.stage === 'prep' && st.log.length === 0);
  const rules = juryAfterTrial(progress)?.rules;

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t(scene.act, scope)}
          {scene.day ? `・${t(scene.day, scope)}` : ''}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          {t('準備{name}出庭', { name: t(scene.witness.name, scope) })}
        </button>
      </main>
    );

  if (st.stage === 'prep')
    return (
      <main className="scene">
        <p className="eyebrow">
          {t('證人準備・{name}（{role}）・{n} 工時', {
            name: t(scene.witness.name, scope),
            role: t(scene.witness.role, scope),
            n: scene.prep.hours,
          })}
        </p>
        <ul className="stack">
          {scene.prep.options.map((o) => (
            <li key={o.id} className="panel">
              <strong>{t(o.label, scope)}</strong>
              <p className="muted">{t(o.detail, scope)}</p>
              <button className="primary" onClick={() => prepareWitness(o.id)}>
                {t('就這樣準備')}
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
        {t('直接詰問・{name}', { name: t(scene.witness.name, scope) })}
        {st.stage === 'direct' ? t('・還能問 {n} 題', { n: left }) : ''}
      </p>
      {rules && <JuryLegend jury={st.jury} threshold={rules.threshold} burden={rules.burden} />}
      <Transcript count={st.log.length}>
        {st.log.map((l, i) => (
          <Speech key={i} line={{ who: l.who, text: l.text, mood: '平', thought: false }} />
        ))}
      </Transcript>
      {st.stage === 'direct' ? (
        <>
          <ul className="stack">
            {[...scene.questions]
              .sort((a, b) => a.seq - b.seq)
              .map((q) => (
                <li key={q.id}>
                  <button
                    className="wide"
                    disabled={!defense.canAsk(scene, st, q.id, progress.cards)}
                    onClick={() => askWitness(q.id)}
                  >
                    {t(q.q, scope)}
                  </button>
                  {defense.missing(scene, q.id, progress.cards).length > 0 && (
                    <p className="muted small">{t('手上沒有能讓證人說這件事的證據。')}</p>
                  )}
                </li>
              ))}
          </ul>
          <button className="primary" onClick={finishWitness}>
            {t('問完了')}
          </button>
        </>
      ) : (
        <>
          <div className="lines">
            <MarkLines lines={scene.outro} />
          </div>
          <button className="primary next" onClick={advance}>
            {t('繼續')}
          </button>
        </>
      )}
    </main>
  );
}
