import * as closing from '../engine/episode/closing';
import type { ClosingScene } from '../engine/episode/schema';
import { closingArgs, closingState, endingOf, exposedArgs, useEpisode } from '../engine/game';
import { CardPick, EvidenceDrawer } from './Evidence';
import { Speech } from './Portrait';
import { Shell, Tabs } from './Shell';
import { useState } from 'react';

/** 結辯與判決（企劃書 6.9.8、6.10）：挑三個論點排順序、選基調，然後看三輪評議。 */
export function Closing({ scene }: { scene: ClosingScene }) {
  const { progress, pickArg, setTone, deliver, advance } = useEpisode();
  const st = closingState(progress, scene);
  const exposed = exposedArgs(progress);
  const args = closingArgs(progress);
  const [tab, setTab] = useState<'args' | 'tone'>('args');
  const need = closing.needed(scene, args.length);

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
        <div className="lines">
          {endingOf(progress, scene).map((l, i) => (
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
      resetKey={tab}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">
            {scene.act}・{scene.place}
          </p>
          <p className="patience">
            論點{' '}
            <strong>
              {st.picked.length}/{need}
            </strong>{' '}
            ・ 基調 {st.tone ? '已選' : '未選'}
          </p>
          {(st.broken ?? []).length > 0 && (
            <p className="bad-text small">
              開場許下的 {st.broken.length} 個承諾沒有兌現，陪審員記得你說過的話。
            </p>
          )}
        </header>
      }
      tabs={
        <Tabs
          label="結辯"
          value={tab}
          onPick={setTab}
          items={[
            { id: 'args', label: '論點', done: st.picked.length === need },
            { id: 'tone', label: '訴求基調', done: !!st.tone },
          ]}
        />
      }
      foot={
        <>
          <EvidenceDrawer />
          <button
            className="primary wide"
            disabled={!closing.canDeliver(scene, st, args.length)}
            onClick={deliver}
          >
            開始結辯
          </button>
        </>
      }
    >
      {tab === 'args' && (
        <section className="panel">
          <h2>挑 {need} 個論點，順序就是妳講的順序</h2>
          {need < scene.picks && (
            <p className="muted small">
              手上只有 {args.length} 個確認過的論點，
              {need === 0 ? '只能靠訴求基調結辯。' : '有幾個講幾個。'}
            </p>
          )}
          <p className="muted small">最後講的那一個，陪審團記得最清楚（衝擊 ×1.3）。</p>
          <div className="stack">
            {args.map((a) => {
              const i = st.picked.indexOf(a.id);
              return (
                <CardPick
                  key={a.id}
                  item={a}
                  on={i >= 0}
                  verb={i >= 0 ? `${i + 1}.` : undefined}
                  tag={exposed.includes(a.id) ? '（已洩漏）' : undefined}
                  onPick={() => pickArg(a.id)}
                />
              );
            })}
            {args.length === 0 && <p className="muted">手上沒有確認過的論點。</p>}
          </div>
          {st.picked.length > 0 && (
            <ol className="picked">
              {st.picked.map((id, i) => (
                <li key={id}>
                  {i + 1}. {args.find((a) => a.id === id)?.name}
                  {i === st.picked.length - 1 && st.picked.length === need && (
                    <span className="good"> ・最後講，×1.3</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {tab === 'tone' && (
        <section className="panel">
          <h2>訴求基調</h2>
          <div className="lines">
            {scene.intro.map((l, i) => (
              <Speech key={i} line={l} />
            ))}
          </div>
          <div className="stack">
            {scene.tones.map((t) => (
              <CardPick
                key={t.id}
                item={{ id: t.id, name: t.label, text: t.text }}
                on={st.tone === t.id}
                onPick={() => setTone(t.id)}
              />
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
