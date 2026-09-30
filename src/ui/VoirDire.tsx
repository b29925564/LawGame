import { useState } from 'react';
import type { VoirDireScene } from '../engine/episode/schema';
import * as vd from '../engine/episode/voirdire';
import { useEpisode, voirDireState } from '../engine/game';
import { Speech } from './Portrait';

/** 陪審團遴選（企劃書 6.9.1）：18 取 12，六次提問、三次無因迴避。 */
export function VoirDire({ scene }: { scene: VoirDireScene }) {
  const { progress, askJuror, challengeJuror, strikeJuror, seatJury, advance } = useEpisode();
  const st = voirDireState(progress, scene);
  const [intro, setIntro] = useState(st.asked.length === 0 && st.struck.length === 0);

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
          開始遴選
        </button>
      </main>
    );

  if (vd.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">陪審團已選定</p>
        <ul className="stack">
          {vd.panel(scene, st).map((j) => (
            <li key={j.id} className="panel">
              <strong>{j.label}</strong>
              {j.foreperson && <span className="muted"> ・陪審長</span>}
            </li>
          ))}
        </ul>
        {st.wrong > 0 && (
          <p className="muted">
            沒有根據的聲請有 {st.wrong} 次。開庭第一天的法官耐心會少 {st.wrong} 點。
          </p>
        )}
        <button className="primary next" onClick={advance}>
          繼續
        </button>
      </main>
    );

  const pool = vd.pool(scene, st);
  return (
    <main className="court-screen">
      <header className="panel-head bench">
        <p className="eyebrow">陪審團遴選</p>
        <p className="patience">
          提問 <strong>{st.left}</strong> ・ 無因迴避{' '}
          <strong>{scene.peremptories - st.struck.length}</strong> ・ 候選 {pool.length}
        </p>
      </header>

      <ul className="stack">
        {pool.map((c) => {
          const asked = st.asked.includes(c.id);
          return (
            <li key={c.id} className="panel job">
              <strong>
                {c.name}・{c.job}
              </strong>
              <p className="muted">{c.sheet}</p>
              {asked && (
                <>
                  <p className="claim-text">「{c.question.q}」</p>
                  <p>{c.question.a}</p>
                  {c.hidden && <p className="muted small">{c.hidden}</p>}
                </>
              )}
              <div className="row">
                <button disabled={!vd.canAsk(st, c.id)} onClick={() => askJuror(c.id)}>
                  提問
                </button>
                <button onClick={() => challengeJuror(c.id)}>聲請有因迴避</button>
                <button disabled={!vd.canStrike(scene, st, c.id)} onClick={() => strikeJuror(c.id)}>
                  無因迴避
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button className="primary wide" disabled={!vd.canSeat(scene, st)} onClick={seatJury}>
        就用這 {scene.seats} 位（由上往下）
      </button>
      <p className="muted small">
        有因迴避要候選人自己說出偏見才成立，沒憑沒據法官會記住。你用掉一次無因迴避，檢方也會砍掉一位對你最有利的人。
      </p>
    </main>
  );
}
