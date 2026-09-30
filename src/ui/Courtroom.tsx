import { useEffect, useRef, useState } from 'react';
import type { TrialScene } from '../engine/episode/schema';
import * as trial from '../engine/episode/trial';
import { deskSceneOf, deskState, exposedArgs, trialState, useEpisode } from '../engine/game';
import { reaction, type Jury } from '../engine/jury';
import type { Tag } from '../engine/schema';
import { useSettings } from '../engine/settings';
import { play } from '../engine/sound';
import { JuryLegend } from './JuryLegend';
import { Speech } from './Portrait';

const glyph: Record<string, string> = {
  點頭: '◡',
  抄筆記: '✎',
  皺眉: '︵',
  看向被告: '→',
  '': '·',
};

/** 12 張臉。預設只看表情，輔助選項才顯示數值（企劃書 6.10）。 */
function Jurors({ scene, jury, deltas }: { scene: TrialScene; jury: Jury; deltas: Jury }) {
  const { showNumbers, set } = useSettings();
  return (
    <section className="jury compact" aria-label="陪審團">
      <div className="panel-head">
        <h2>陪審團</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showNumbers}
            onChange={(e) => set({ showNumbers: e.target.checked })}
          />
          顯示數值
        </label>
      </div>
      {showNumbers && <JuryLegend jury={jury} threshold={scene.threshold} />}
      <ul className="jurors">
        {scene.jurors.map((j) => {
          const r = reaction(deltas[j.id] ?? 0);
          return (
            <li key={j.id} className={`juror ${r ? 'react' : ''}`}>
              <span className="face" aria-hidden>
                {glyph[r]}
              </span>
              <span className="label">{j.label}</span>
              <span className="state">{r || '　'}</span>
              {showNumbers && (
                <span className={jury[j.id] >= scene.threshold ? 'num guilty' : 'num'}>
                  {jury[j.id]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 異議窗：預設回合制，設定裡可以改成限時（企劃書 6.9.5 與 6.14 的輔助選項）。 */
function ObjectionWindow({
  onPass,
  onObject,
}: {
  onPass: () => void;
  onObject: (r: trial.Objection) => void;
}) {
  const seconds = useSettings((s) => s.objectionSeconds);
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!seconds) return;
    const end = Date.now() + seconds * 1000;
    const t = setInterval(() => {
      const rest = Math.ceil((end - Date.now()) / 1000);
      if (rest <= 0) {
        clearInterval(t);
        onPass();
      } else setLeft(rest);
    }, 250);
    return () => clearInterval(t);
  }, [seconds, onPass]);
  return (
    <section className="panel objection" aria-label="異議">
      <div className="panel-head">
        <h2>要異議嗎？</h2>
        {seconds > 0 && <span className="muted">{Math.max(0, left)} 秒</span>}
      </div>
      <div className="row">
        {trial.OBJECTIONS.map((r) => (
          <button
            key={r}
            onClick={() => {
              play('object');
              onObject(r);
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <button className="wide" onClick={onPass}>
        不異議
      </button>
    </section>
  );
}

export function Courtroom({ scene }: { scene: TrialScene }) {
  const {
    progress,
    advance,
    nextQuestion,
    letPass,
    object,
    toCross,
    lock,
    setup,
    confront,
    badger,
    finishTrial,
  } = useEpisode();
  const st = trialState(progress, scene);
  const [intro, setIntro] = useState(st.log.length === 0);
  const transcript = useRef<HTMLDivElement>(null);
  // 新的一句話進來就捲到底，玩家永遠看得到最新的證詞。
  useEffect(() => {
    const el = transcript.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [st.log]);

  // 手上確認過的論點，用來對質。論點的強度與標籤定義在調查那一幕的疑問裡。
  const deskScene = deskSceneOf(progress);
  const args = (deskScene?.questions ?? [])
    .filter((q) => progress.cards.includes(q.argument.id))
    .map((q) => q.argument);
  const deskDone = deskScene ? deskState(progress, deskScene) : null;
  // 談判攤牌過、或錄取時問到底牌話題的論點，對方已經備好反擊，衝擊減半（企劃書 6.8）。
  const exposed = exposedArgs(progress);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {scene.act}・{scene.day}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button
          className="primary next"
          onClick={() => {
            play('gavel');
            setIntro(false);
          }}
        >
          開庭
        </button>
      </main>
    );

  if (st.stage === 'done')
    return (
      <main className="scene">
        <p className="eyebrow">休庭</p>
        <dl className="stats">
          <dt>成功彈劾</dt>
          <dd>
            {st.impeachments} / {scene.witness.claims.length}
          </dd>
          <dt>刪除的證詞</dt>
          <dd>{st.struck} 句</dd>
          <dt>剩餘法官耐心</dt>
          <dd>
            {Math.max(0, st.patience)} / {scene.patience}
          </dd>
          <dt>調查花掉的工時</dt>
          <dd>{deskDone && deskScene ? `${deskDone.spent} / ${deskScene.hours}` : '—'}</dd>
        </dl>
        <Jurors scene={scene} jury={st.jury} deltas={{}} />
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
        <p className="patience" aria-label={`法官耐心 ${st.patience} / ${scene.patience}`}>
          法官耐心
          <span className="pips" aria-hidden>
            {Array.from({ length: scene.patience }, (_, i) => (
              <span key={i} className={i < st.patience ? 'pip on' : 'pip'} />
            ))}
          </span>
        </p>
      </header>

      <div className="lines transcript" aria-live="polite" ref={transcript}>
        {st.log.map((l, i) => (
          <div key={i} className={l.struck ? 'struck' : ''}>
            <Speech line={{ ...l, mood: '平', thought: false }} />
            {l.struck && <p className="muted small">（這句話已從陪審團視角刪除）</p>}
          </div>
        ))}
      </div>

      <Jurors scene={scene} jury={st.jury} deltas={st.deltas} />

      {st.stage === 'direct' &&
        (st.window ? (
          <ObjectionWindow onPass={letPass} onObject={object} />
        ) : (
          <div className="row">
            <button className="primary" onClick={nextQuestion}>
              {st.i < scene.witness.direct.length ? '聽下一個問題' : '檢方詰問完畢'}
            </button>
            {st.i >= scene.witness.direct.length && <button onClick={toCross}>開始交互詰問</button>}
          </div>
        ))}

      {st.stage === 'cross' && (
        <section className="panel">
          <h2>交互詰問</h2>
          {scene.witness.claims.map((c) => {
            const cs = st.claims[c.id];
            return (
              <article key={c.id} className="claim">
                <p className="claim-text">「{c.text}」</p>
                <ol className="steps">
                  <li className={cs.lock !== 'none' ? 'done' : ''}>
                    1 鎖定
                    {cs.lock === 'none' && (
                      <div className="stack">
                        <button className="wide" onClick={() => lock(c.id, 'strong')}>
                          {c.lock.strong.q}
                        </button>
                        <button className="wide" onClick={() => lock(c.id, 'weak')}>
                          {c.lock.weak.q}
                        </button>
                      </div>
                    )}
                  </li>
                  <li className={cs.setup ? 'done' : ''}>
                    2 鋪陳
                    {!cs.setup && (
                      <button className="wide" onClick={() => setup(c.id)}>
                        {c.setup.q}
                      </button>
                    )}
                  </li>
                  <li className={cs.result !== 'none' ? 'done' : ''}>
                    3 對質
                    {cs.result === 'none' && (
                      <div className="stack">
                        {args.map((a) => {
                          const leaked = exposed.includes(a.id);
                          return (
                            <button
                              key={a.id}
                              className="wide"
                              onClick={() =>
                                confront(
                                  c.id,
                                  leaked ? Math.round(a.strength / 2) : a.strength,
                                  a.tags as Tag[],
                                )
                              }
                            >
                              出示 {a.name}
                              {leaked && '（已洩漏，衝擊減半）'}
                            </button>
                          );
                        })}
                        {args.length === 0 && <span className="muted">手上沒有論點可以出示。</span>}
                      </div>
                    )}
                  </li>
                </ol>
              </article>
            );
          })}
          <details>
            <summary>其他問題</summary>
            <ul className="stack">
              {scene.witness.irrelevant.map((q, i) => (
                <li key={i}>
                  <button className="wide" onClick={() => badger(i)}>
                    {q.q}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <button className="primary" onClick={finishTrial}>
            詰問完畢
          </button>
        </section>
      )}
    </main>
  );
}
