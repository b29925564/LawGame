import { useCaseTerms } from './terms';
import { useEffect, useRef, useState } from 'react';
import type { TrialScene } from '../engine/episode/schema';
import * as trial from '../engine/episode/trial';
import {
  anchoredClaims,
  keptPromises,
  promisesOf,
  courtScene,
  courtArgs,
  deskSceneOf,
  deskState,
  exposedArgs,
  trialState,
  useEpisode,
} from '../engine/game';
import { reaction, termsOf, type Jury } from '../engine/jury';
import type { Tag } from '../engine/schema';
import { useSettings } from '../engine/settings';
import { play } from '../engine/sound';
import { CardPick, EvidenceDrawer } from './Evidence';
import { JuryLegend } from './JuryLegend';
import { Stamp } from './Marks';
import { Speech } from './Portrait';
import { Shell, Tabs } from './Shell';

const glyph: Record<string, string> = {
  點頭: '◡',
  抄筆記: '✎',
  皺眉: '︵',
  看向被告: '→',
  '': '·',
};

/**
 * 12 張臉。預設只看表情，輔助選項才顯示數值（企劃書 6.10）。
 * 在法庭裡它是釘在筆錄下面的一條，所以要能收起來——手機上
 * 展開的陪審團會把詰問的按鈕推出畫面。
 */
function Jurors({
  scene,
  jury,
  deltas,
  strip,
}: {
  scene: TrialScene;
  jury: Jury;
  deltas: Jury;
  strip?: boolean;
}) {
  const { showNumbers, set } = useSettings();
  // 法庭裡預設收起來：12 張臉展開會把詰問的按鈕擠出畫面。
  const [open, setOpen] = useState(!strip);
  const over = scene.jurors.filter((j) => (jury[j.id] ?? 0) >= scene.threshold).length;
  return (
    <section className={strip ? 'jury compact strip' : 'jury compact'} aria-label="陪審團">
      <div className="panel-head">
        {strip ? (
          <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
            陪審團 {open ? '▾' : '▸'}
            <span className="muted">
              {' '}
              {over} / {scene.jurors.length} 傾向{termsOf(scene).yes}
            </span>
          </button>
        ) : (
          <h2>陪審團</h2>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={showNumbers}
            onChange={(e) => set({ showNumbers: e.target.checked })}
          />
          顯示數值
        </label>
      </div>
      {(!strip || open) && (
        <>
          {showNumbers && (
            <JuryLegend jury={jury} threshold={scene.threshold} burden={scene.burden} />
          )}
          <ul className="jurors">
            {scene.jurors.map((j) => {
              const r = reaction(deltas[j.id] ?? 0);
              return (
                <li key={j.id} className={`juror ${r ? 'react' : ''}`} data-reaction={r}>
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
        </>
      )}
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

export function Courtroom({ scene: raw }: { scene: TrialScene }) {
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
  // 上場的是遴選留下的陪審團，法官耐心也已經扣過遴選時的失誤。
  const scene = courtScene(progress, raw);
  const st = trialState(progress, scene);
  const terms = useCaseTerms();
  const [intro, setIntro] = useState(st.log.length === 0);
  // 一次只處理一項證詞，預設停在還沒打完的那一項。
  const pending = scene.witness.claims.find((c) => st.claims[c.id]?.result === 'none');
  const [pick, setPick] = useState<string>(pending?.id ?? scene.witness.claims[0].id);
  const transcript = useRef<HTMLDivElement>(null);
  // 新的一句話進來就捲到底，玩家永遠看得到最新的證詞。
  useEffect(() => {
    const el = transcript.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [st.log]);

  // 手上確認過的論點，用來對質。論點的強度與標籤定義在調查那一幕的疑問裡。
  const deskScene = deskSceneOf(progress);
  const args = courtArgs(progress);
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
        {/* 詰問的最後幾句話——高潮就在這裡，休庭畫面不該把它吃掉。 */}
        <div className="lines transcript">
          {st.log.slice(-4).map((l, i) => (
            <Speech key={i} line={{ ...l, mood: '平', thought: false }} />
          ))}
        </div>
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

  const claim = scene.witness.claims.find((c) => c.id === pick) ?? scene.witness.claims[0];
  const anchored = anchoredClaims(progress);
  const promised = promisesOf(progress).promises;
  const kept = keptPromises(progress);
  const cs = st.claims[claim.id];

  return (
    <Shell
      resetKey={st.stage === 'cross' ? pick : st.stage}
      head={
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
          {promised.length > 0 && (
            <ul className="iou-chips" aria-label="開場許下的承諾">
              {promised.map((p, i) => (
                <li key={p.id} data-state={kept.includes(p.id) ? 'kept' : 'signed'} title={p.text}>
                  借據 {String(i + 1).padStart(2, '0')}
                  {kept.includes(p.id) ? '・已兌現' : ''}
                </li>
              ))}
            </ul>
          )}
        </header>
      }
      tabs={
        <>
          <div className="lines transcript" aria-live="polite" ref={transcript}>
            {st.log.map((l, i) => (
              <div key={i} className={l.struck ? 'struck' : ''}>
                <Speech line={{ ...l, mood: '平', thought: false }} />
                {l.struck && <p className="muted small">（這句話已從陪審團視角刪除）</p>}
              </div>
            ))}
          </div>
          <Jurors scene={scene} jury={st.jury} deltas={st.deltas} strip />
          {st.stage === 'cross' && (
            <Tabs
              label="證詞"
              value={pick}
              onPick={setPick}
              items={scene.witness.claims.map((c, i) => ({
                id: c.id,
                label: `證詞 ${i + 1}`,
                done: st.claims[c.id]?.result !== 'none',
              }))}
            />
          )}
        </>
      }
      foot={
        <>
          <EvidenceDrawer note="庭上隨時可以翻。出示哪一個論點，看的就是這裡的強度。" />
          {st.stage === 'cross' && (
            <button className="primary wide" onClick={finishTrial}>
              詰問完畢
            </button>
          )}
          {st.stage === 'direct' && !st.window && (
            <>
              <button className="primary wide" onClick={nextQuestion}>
                {st.i < scene.witness.direct.length
                  ? '聽下一個問題'
                  : `${scene.examiner ?? terms.other}詰問完畢`}
              </button>
              {st.i >= scene.witness.direct.length && (
                <button onClick={toCross}>開始交互詰問</button>
              )}
            </>
          )}
        </>
      }
    >
      {st.stage === 'direct' && st.window && <ObjectionWindow onPass={letPass} onObject={object} />}
      {st.stage === 'direct' && !st.window && (
        <p className="muted">
          聽{scene.examiner ?? terms.other}問下去。有問題的地方就在問完的那一刻提異議。
        </p>
      )}

      {st.stage === 'cross' && (
        <section className="panel">
          <article className="claim">
            <p className="claim-text">「{claim.text}」</p>
            <ol className="steps">
              {claim.anchor && anchored.includes(claim.anchor) ? (
                <li className="done anchored">
                  <Stamp text="已定錨" sm />
                  <span>她在錄取筆錄裡已經講死這個說法</span>
                </li>
              ) : (
                <li className={cs.lock !== 'none' ? 'done' : ''}>
                  1 鎖定
                  {cs.lock === 'none' && (
                    <div className="stack">
                      <button className="wide" onClick={() => lock(claim.id, 'strong')}>
                        {claim.lock.strong.q}
                      </button>
                      <button className="wide" onClick={() => lock(claim.id, 'weak')}>
                        {claim.lock.weak.q}
                      </button>
                    </div>
                  )}
                </li>
              )}
              <li className={cs.setup ? 'done' : ''}>
                2 鋪陳
                {!cs.setup && (
                  <button className="wide" onClick={() => setup(claim.id)}>
                    {claim.setup.q}
                  </button>
                )}
              </li>
              <li className={cs.result !== 'none' ? 'done' : ''}>
                3 對質
                {cs.result === 'none' && (
                  <div className="stack">
                    {args.map((a) => (
                      <CardPick
                        key={a.id}
                        item={a}
                        verb="出示"
                        tag={exposed.includes(a.id) ? '（已洩漏，她備好了反擊）' : undefined}
                        onPick={() => {
                          confront(claim.id, a.strength, a.tags as Tag[], a.id);
                          // 這一項打完就跳到下一項。筆錄釘在上面，所以換頁不會把剛才的結果藏起來。
                          const nx = scene.witness.claims.find(
                            (c) => c.id !== claim.id && st.claims[c.id]?.result === 'none',
                          );
                          if (nx) setPick(nx.id);
                        }}
                      />
                    ))}
                    {args.length === 0 && <span className="muted">手上沒有論點可以出示。</span>}
                  </div>
                )}
              </li>
            </ol>
          </article>
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
        </section>
      )}
    </Shell>
  );
}
