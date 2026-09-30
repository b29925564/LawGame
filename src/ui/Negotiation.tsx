import { useState } from 'react';
import * as nego from '../engine/episode/negotiation';
import type { NegotiationScene } from '../engine/episode/schema';
import { deskSceneOf, negoState, useEpisode } from '../engine/game';
import { Speech } from './Portrait';

/** 認罪協商（企劃書 6.8）：攤牌會洩底，虛張聲勢看證據清單，決定權在委託人手上。 */
export function Negotiation({ scene }: { scene: NegotiationScene }) {
  const { progress, revealArg, bluff, advise, walkOut, advance } = useEpisode();
  const st = negoState(progress, scene);
  const [intro, setIntro] = useState(st.log.length <= scene.intro.length);
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
    <main className="court-screen">
      <header className="panel-head bench">
        <p className="eyebrow">
          {scene.opponent.name}・{scene.opponent.role}
        </p>
        <p className="patience" aria-label={`剩餘回合 ${st.rounds}`}>
          剩餘回合 <strong>{st.rounds}</strong>
        </p>
      </header>

      <div className="lines transcript" aria-live="polite">
        {st.log.map((l, i) => (
          <Speech key={i} line={l} />
        ))}
      </div>

      <section className="panel">
        <h2>她現在開的條件</h2>
        <p className="claim-text">{offer.label}</p>
        {offer.lines.map((l, i) => (
          <Speech key={i} line={l} />
        ))}
        <div className="row">
          <button onClick={() => advise(true)}>建議伊森接受</button>
          <button onClick={() => advise(false)}>建議他撐下去</button>
        </div>
        <p className="muted small">最後決定權在伊森手上。信任低的時候，他可能不聽妳的。</p>
      </section>

      <section className="panel">
        <h2>攤牌</h2>
        <div className="stack">
          {args.map((a) => (
            <button
              key={a.id}
              className="wide"
              disabled={st.played.includes(a.id) || !nego.canAct(st)}
              onClick={() => revealArg(a.id, a.strength, a.name)}
            >
              亮出 {a.name}
            </button>
          ))}
          {args.length === 0 && <span className="muted">手上沒有確認過的論點。</span>}
        </div>
        <p className="muted small">亮出去的論點，庭上衝擊減半，除非妳破解她的反擊。</p>
      </section>

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
        <p className="muted small">
          她會核對開示過的證據清單。撐不起來就被識破，之後的攤牌都打折。
        </p>
      </section>

      <button className="wide" onClick={walkOut}>
        離席
      </button>
    </main>
  );
}
