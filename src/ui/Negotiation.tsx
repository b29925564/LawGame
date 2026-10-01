import { useState } from 'react';
import * as nego from '../engine/episode/negotiation';
import type { NegotiationScene } from '../engine/episode/schema';
import { deskSceneOf, negoState, useEpisode } from '../engine/game';
import { CardPick, EvidenceDrawer } from './Evidence';
import { Speech } from './Portrait';
import { Shell, Tabs, Transcript } from './Shell';

/** 認罪協商（企劃書 6.8）：攤牌會洩底，虛張聲勢看證據清單，決定權在委託人手上。 */
export function Negotiation({ scene }: { scene: NegotiationScene }) {
  const { progress, revealArg, bluff, advise, walkOut, advance } = useEpisode();
  const st = negoState(progress, scene);
  const [intro, setIntro] = useState(st.log.length <= scene.intro.length);
  const [tab, setTab] = useState<'offer' | 'reveal' | 'bluff'>('offer');
  const deskScene = deskSceneOf(progress);
  const args = (deskScene?.questions ?? [])
    .filter((q) => progress.cards.includes(q.argument.id))
    .map((q) => q.argument);
  const offer = nego.offerOf(scene, st);

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
          坐下
        </button>
      </main>
    );

  if (nego.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">{st.outcome === 'deal' ? '認罪協商成立' : '談判結束'}</p>
        <div className="lines">
          {st.log.slice(-4).map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <dl className="stats">
          <dt>莫羅的信心</dt>
          <dd>{st.confidence}</dd>
          <dt>最後的條件</dt>
          <dd>{st.deal ?? offer.label}</dd>
          <dt>伊森的信任</dt>
          <dd>{st.trust} / 5</dd>
        </dl>
        <button className="primary next" onClick={advance}>
          繼續
        </button>
      </main>
    );

  return (
    <Shell
      resetKey={tab}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">
            {scene.opponent.name}・{scene.opponent.role}
          </p>
          <p className="patience" aria-label={`剩餘回合 ${st.rounds}`}>
            剩餘回合 <strong>{st.rounds}</strong>
          </p>
        </header>
      }
      tabs={
        <>
          <Transcript count={st.log.length}>
            {st.log.map((l, i) => (
              <Speech key={i} line={l} />
            ))}
          </Transcript>
          <Tabs
            label="談判"
            value={tab}
            onPick={setTab}
            items={[
              { id: 'offer', label: '她開的條件' },
              { id: 'reveal', label: '攤牌' },
              { id: 'bluff', label: '虛張聲勢' },
            ]}
          />
        </>
      }
      foot={
        <>
          <EvidenceDrawer />
          <button className="wide" onClick={walkOut}>
            離席
          </button>
        </>
      }
    >
      {tab === 'offer' && (
        <section className="panel">
          <h2>她現在開的條件</h2>
          <p className="claim-text">{offer.label}</p>
          {offer.lines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
          <div className="stack">
            <button className="wide" onClick={() => advise(true)}>
              建議伊森接受
            </button>
            <button className="wide" onClick={() => advise(false)}>
              建議他撐下去
            </button>
          </div>
        </section>
      )}

      {tab === 'reveal' && (
        <section className="panel">
          <h2>攤牌</h2>
          <div className="stack">
            {args.map((a) => (
              <CardPick
                key={a.id}
                item={a}
                verb="亮出"
                disabled={st.played.includes(a.id) || !nego.canAct(st)}
                tag={st.played.includes(a.id) ? '（已亮出）' : undefined}
                onPick={() => revealArg(a.id, a.strength, a.name)}
              />
            ))}
            {args.length === 0 && <span className="muted">手上沒有確認過的論點。</span>}
          </div>
        </section>
      )}

      {tab === 'bluff' && (
        <section className="panel">
          <h2>虛張聲勢</h2>
          <div className="stack">
            {scene.bluffs.map((b) => (
              <button
                key={b.id}
                className="wide"
                disabled={st.bluffed.includes(b.id) || !nego.canAct(st)}
                onClick={() => bluff(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
