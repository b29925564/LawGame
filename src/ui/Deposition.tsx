import { useState } from 'react';
import * as depo from '../engine/episode/deposition';
import type { DepositionScene } from '../engine/episode/schema';
import { depoState, useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { EvidenceDrawer } from './Evidence';
import { useScope } from './lang';
import { Speech } from './Portrait';
import { Shell, Tabs, Transcript } from './Shell';

/** 證詞錄取（企劃書 6.7）：12 個提問額度，定錨與探路互相衝突。 */
export function Deposition({ scene }: { scene: DepositionScene }) {
  const { progress, askDepo, defendDepo, finishDepo, advance } = useEpisode();
  const st = depoState(progress, scene);
  const t = useT();
  const scope = useScope();
  const [intro, setIntro] = useState(st.log.length === 0);
  const [topic, setTopic] = useState(scene.topics[0]?.id ?? '');
  const theirs = scene.side === 'theirs';
  const q = theirs ? depo.current(scene, st) : undefined;

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t('{a}・{b}', { a: t(scene.act, scope), b: t(scene.place, scope) })}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          {t('開始錄取')}
        </button>
      </main>
    );

  if (depo.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">{t('錄取結束')}</p>
        {theirs ? (
          <dl className="stats">
            <dt>{t('問過的題目')}</dt>
            <dd>{st.asked.length}</dd>
            <dt>{t('站不住的異議')}</dt>
            <dd>{st.wrong ?? 0}</dd>
          </dl>
        ) : (
          <dl className="stats">
            <dt>{t('用掉的提問')}</dt>
            <dd>
              {scene.budget - st.left} / {scene.budget}
            </dd>
            <dt>{t('宣誓下定錨的說法')}</dt>
            <dd>{t('{n} 項', { n: st.anchored.length })}</dd>
            <dt>{t('洩漏給對方的方向')}</dt>
            <dd>{t('{n} 個', { n: st.exposed.length })}</dd>
          </dl>
        )}
        {st.exposed.length > 0 && (
          <p className="muted">
            {t('對方知道你往哪裡查了。這些論點在庭上的衝擊減半，除非你先破解他們的反擊。')}
          </p>
        )}
        <div className="lines">
          {scene.outro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      </main>
    );

  return (
    <Shell
      resetKey={topic}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">
            {t('{a}・{b}', {
              a: t(scene.witness.name, scope),
              b: t(scene.witness.role, scope),
            })}
          </p>
          {theirs ? (
            <p className="patience">
              {t('{examiner} 發問・第', { examiner: t(scene.examiner, scope) })}{' '}
              <strong>{st.asked.length + 1}</strong> / {t('{n} 題', { n: scene.script.length })}
            </p>
          ) : (
            <p className="patience" aria-label={t('剩餘提問 {n} 個', { n: st.left })}>
              {t('剩餘提問')} <strong>{st.left}</strong>
            </p>
          )}
        </header>
      }
      tabs={
        <>
          <Transcript count={st.log.length}>
            {st.log.map((l, i) => (
              <Speech key={i} line={l} />
            ))}
            {q && <Speech line={{ who: scene.examiner, text: q.q, mood: '平', thought: false }} />}
          </Transcript>
          {!theirs && (
            <Tabs
              label={t('話題')}
              value={topic}
              onPick={setTopic}
              items={scene.topics.map((tp) => ({ id: tp.id, label: t(tp.label, scope) }))}
            />
          )}
        </>
      }
      foot={
        <>
          <EvidenceDrawer />
          {!theirs && (
            <button className="wide" onClick={finishDepo}>
              {t('結束錄取')}
            </button>
          )}
        </>
      }
    >
      {theirs ? (
        <div className="stack depo-defend" role="group" aria-label={t('異議')}>
          <button className="primary wide" disabled={!q} onClick={() => defendDepo(null)}>
            {t('不異議')}
          </button>
          <div className="objections">
            {depo.DEPO_OBJECTIONS.map((o) => (
              <button key={o} disabled={!q} onClick={() => defendDepo(o)}>
                {t(o)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="stack">
          {depo.questionsOf(scene, topic).map((q) => (
            <li key={q.id}>
              <button
                className="wide"
                disabled={!depo.canAsk(st, q.id)}
                onClick={() => askDepo(q.id)}
              >
                {t(q.q, scope)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
