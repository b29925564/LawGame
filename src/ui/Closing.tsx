import * as closing from '../engine/episode/closing';
import type { ClosingScene } from '../engine/episode/schema';
import { closingState, deskSceneOf, exposedArgs, juryAfterTrial, useEpisode } from '../engine/game';
import { JuryLegend } from './JuryLegend';
import { Speech } from './Portrait';
import { useSettings } from '../engine/settings';

/** 結辯與判決（企劃書 6.9.8、6.10）：挑三個論點排順序、選基調，然後看三輪評議。 */
export function Closing({ scene }: { scene: ClosingScene }) {
  const { progress, pickArg, setTone, deliver, advance } = useEpisode();
  const st = closingState(progress, scene);
  const showNumbers = useSettings((s) => s.showNumbers);
  const after = juryAfterTrial(progress);
  const exposed = exposedArgs(progress);
  const args = (deskSceneOf(progress)?.questions ?? [])
    .filter((q) => progress.cards.includes(q.argument.id))
    .map((q) => q.argument);

  if (st.verdict)
    return (
      <main className="scene">
        <p className="eyebrow">判決</p>
        <h1>{st.verdict}</h1>
        <ol className="stack">
          {st.rounds.map((r, i) => (
            <li key={i} className="panel">
              <strong>第 {i + 1} 輪評議</strong>
              {r.moves.map((m, j) => (
                <p key={j} className="muted">
                  {m}
                </p>
              ))}
            </li>
          ))}
        </ol>
        {showNumbers && after && <JuryLegend jury={st.jury} threshold={scene.threshold} />}
        <div className="lines">
          {scene.verdicts[st.verdict].map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={advance}>
          繼續
        </button>
      </main>
    );

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

      <section className="panel">
        <h2>挑 {scene.picks} 個論點，順序就是妳講的順序</h2>
        <p className="muted small">最後講的那一個，陪審團記得最清楚（衝擊 ×1.3）。</p>
        <ul className="stack">
          {args.map((a) => {
            const i = st.picked.indexOf(a.id);
            return (
              <li key={a.id}>
                <button
                  className={i >= 0 ? 'wide on' : 'wide'}
                  aria-pressed={i >= 0}
                  onClick={() => pickArg(a.id)}
                >
                  {i >= 0 ? `${i + 1}. ` : ''}
                  {a.name}
                  {exposed.includes(a.id) && '（已洩漏）'}
                </button>
              </li>
            );
          })}
          {args.length === 0 && <li className="muted">手上沒有確認過的論點。</li>}
        </ul>
      </section>

      <section className="panel">
        <h2>訴求基調</h2>
        <div className="stack">
          {scene.tones.map((t) => (
            <button
              key={t.id}
              className={st.tone === t.id ? 'wide on' : 'wide'}
              aria-pressed={st.tone === t.id}
              onClick={() => setTone(t.id)}
            >
              {t.label}：{t.text}
            </button>
          ))}
        </div>
      </section>

      <button className="primary wide" disabled={!closing.canDeliver(scene, st)} onClick={deliver}>
        開始結辯
      </button>
    </main>
  );
}
