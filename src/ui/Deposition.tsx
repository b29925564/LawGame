import { useState } from 'react';
import * as depo from '../engine/episode/deposition';
import type { DepositionScene } from '../engine/episode/schema';
import { depoState, useEpisode } from '../engine/game';
import { EvidenceDrawer } from './Evidence';
import { Speech } from './Portrait';
import { Shell, Tabs, Transcript } from './Shell';

/** 證詞錄取（企劃書 6.7）：12 個提問額度，定錨與探路互相衝突。 */
export function Deposition({ scene }: { scene: DepositionScene }) {
  const { progress, askDepo, defendDepo, finishDepo, advance } = useEpisode();
  const st = depoState(progress, scene);
  const [intro, setIntro] = useState(st.log.length === 0);
  const [topic, setTopic] = useState(scene.topics[0]?.id ?? '');
  const theirs = scene.side === 'theirs';
  const q = theirs ? depo.current(scene, st) : undefined;

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
        {theirs ? (
          <dl className="stats">
            <dt>問過的題目</dt>
            <dd>{st.asked.length}</dd>
            <dt>站不住的異議</dt>
            <dd>{st.wrong ?? 0}</dd>
          </dl>
        ) : (
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
        )}
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
    <Shell
      resetKey={topic}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">
            {scene.witness.name}・{scene.witness.role}
          </p>
          {theirs ? (
            <p className="patience">
              {scene.examiner} 發問・第 <strong>{st.asked.length + 1}</strong> /{' '}
              {scene.script.length} 題
            </p>
          ) : (
            <p className="patience" aria-label={`剩餘提問 ${st.left} 個`}>
              剩餘提問 <strong>{st.left}</strong>
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
              label="話題"
              value={topic}
              onPick={setTopic}
              items={scene.topics.map((t) => ({ id: t.id, label: t.label }))}
            />
          )}
        </>
      }
      foot={
        <>
          <EvidenceDrawer />
          {!theirs && (
            <button className="wide" onClick={finishDepo}>
              結束錄取
            </button>
          )}
        </>
      }
    >
      {theirs ? (
        <div className="stack depo-defend" role="group" aria-label="異議">
          <button className="primary wide" disabled={!q} onClick={() => defendDepo(null)}>
            不異議
          </button>
          <div className="objections">
            {depo.DEPO_OBJECTIONS.map((o) => (
              <button key={o} disabled={!q} onClick={() => defendDepo(o)}>
                {o}
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
                {q.q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
