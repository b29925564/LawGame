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
  rulingsIn,
  trialState,
  useEpisode,
} from '../engine/game';
import { reaction, termsOf, type Jury } from '../engine/jury';
import type { Tag } from '../engine/schema';
import { useSettings } from '../engine/settings';
import { play } from '../engine/sound';
import { useT } from '../i18n';
import { CardPick, EvidenceDrawer } from './Evidence';
import { JuryLegend } from './JuryLegend';
import { CourtLight } from './CourtLight';
import { useScope } from './lang';
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
  const t = useT();
  const scope = useScope();
  // 「華特・班奈特・退休警察」：名字和職業分兩行，換行才不會切在詞中間。
  const person = (label: string) => {
    const i = label.lastIndexOf('・');
    return i > 0 ? [t(label.slice(0, i), scope), t(label.slice(i + 1), scope)] : [t(label, scope)];
  };
  // 法庭裡預設收起來：12 張臉展開會把詰問的按鈕擠出畫面。
  const [open, setOpen] = useState(!strip);
  const over = scene.jurors.filter((j) => (jury[j.id] ?? 0) >= scene.threshold).length;
  const toggle = (
    <label className="toggle">
      <input
        type="checkbox"
        checked={showNumbers}
        onChange={(e) => set({ showNumbers: e.target.checked })}
      />
      {t('顯示數值')}
    </label>
  );
  return (
    <section className={strip ? 'jury compact strip' : 'jury compact'} aria-label={t('陪審團')}>
      <div className="panel-head">
        {strip ? (
          <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('陪審團')} {open ? '▾' : '▸'}
            <span className="muted">
              {' '}
              {t('{over} / {total} 傾向{yes}', {
                over,
                total: scene.jurors.length,
                yes: t(termsOf(scene).yes),
              })}
            </span>
          </button>
        ) : (
          <h2>{t('陪審團')}</h2>
        )}
        {!strip && toggle}
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
                  <span className="label" title={t(j.label, scope)}>
                    {person(j.label).map((x, k) => (
                      <span key={k}>{x}</span>
                    ))}
                  </span>
                  <span className="state">{r ? t(r) : '　'}</span>
                  {showNumbers && (
                    <span className={jury[j.id] >= scene.threshold ? 'num guilty' : 'num'}>
                      {jury[j.id]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {/* 法庭裡那一條的標題列只放「陪審團 ▾ 比數」；開關放在名單下面，英文才不會擠成兩三行（體驗評測 v90）。 */}
          {strip && toggle}
        </>
      )}
    </section>
  );
}

/** 異議窗：預設回合制，設定裡可以改成限時（企劃書 6.9.5 與 6.14 的輔助選項）。 */
function ObjectionWindow({
  rulings,
  onPass,
  onObject,
}: {
  rulings: string[];
  onPass: () => void;
  onObject: (r: trial.Objection) => void;
}) {
  const seconds = useSettings((s) => s.objectionSeconds);
  const t = useT();
  const scope = useScope();
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!seconds) return;
    const end = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const rest = Math.ceil((end - Date.now()) / 1000);
      if (rest <= 0) {
        clearInterval(timer);
        onPass();
      } else setLeft(rest);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds, onPass]);
  return (
    <section className="panel objection" aria-label={t('異議')}>
      <div className="panel-head">
        <h2>{t('要異議嗎？')}</h2>
        {seconds > 0 && <span className="muted">{t('{n} 秒', { n: Math.max(0, left) })}</span>}
      </div>
      <div className="row">
        {trial.objectionsFor(rulings).map((r) => (
          <button
            key={r}
            onClick={() => {
              play('object');
              onObject(r);
            }}
          >
            {t(r)}
          </button>
        ))}
      </div>
      {rulings.length > 0 && (
        <p className="muted small">
          {t('生效中：{rulings}', {
            rulings: rulings.map((r) => t(r, scope)).join(t('、')),
          })}
        </p>
      )}
      <button className="wide" onClick={onPass}>
        {t('不異議')}
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
  const t = useT();
  const scope = useScope();
  const [intro, setIntro] = useState(st.log.length === 0);
  // 最後一句話（再主詰問的反擊、或玩家的收尾）落地後，先停在筆錄上讓人看完，點了才進休庭。
  const [recess, setRecess] = useState(st.stage === 'done');
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
  const avg = scene.jurors.reduce((sum, j) => sum + (st.jury[j.id] ?? 0), 0) / scene.jurors.length;
  const light = <CourtLight avg={avg} threshold={scene.threshold} />;

  if (intro)
    return (
      <>
        {light}
        <main className="scene">
          <p className="eyebrow">
            {t(scene.act, scope)}
            {t('・')}
            {t(scene.day, scope)}
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
            {t('開庭')}
          </button>
        </main>
      </>
    );

  const lastWitness = st.log.map((l) => l.who).lastIndexOf(scene.witness.name);
  const tail = Math.min(
    st.log.length,
    lastWitness < 0 ? 4 : Math.max(4, Math.min(6, st.log.length - lastWitness)),
  );

  if (st.stage === 'done' && recess)
    return (
      <>
        {light}
        <main className="scene">
          <p className="eyebrow">{t('休庭')}</p>
          {/* 詰問的最後幾句話——高潮就在這裡，放在第一屏，數字排在後面（體驗評測）。 */}
          {/* 從證人的最後一句開始放（至少四句、最多六句）：整場都放上去，高潮會掉到第一屏外；
              只切最後四句，證人拒答那一句又會被折進去（體驗評測 v88）。前面的收進折疊。 */}
          {tail < st.log.length && (
            <details className="earlier">
              <summary>{t('前面的筆錄（{n} 句）', { n: st.log.length - tail })}</summary>
              <div className="lines transcript full">
                {st.log.slice(0, -tail).map((l, i) => (
                  <Speech key={i} line={{ ...l, mood: '平', thought: false }} />
                ))}
              </div>
            </details>
          )}
          <div className="lines transcript full">
            {st.log.slice(-tail).map((l, i) => (
              <Speech key={i} line={{ ...l, mood: '平', thought: false }} />
            ))}
          </div>
          <dl className="stats">
            <dt>{t('成功彈劾')}</dt>
            <dd>
              {st.impeachments} / {scene.witness.claims.length}
            </dd>
            <dt>{t('刪除的證詞')}</dt>
            <dd>{t('{n} 句', { n: st.struck })}</dd>
            <dt>{t('剩餘法官耐心')}</dt>
            <dd>
              {Math.max(0, st.patience)} / {scene.patience}
            </dd>
            <dt>{t('調查花掉的工時')}</dt>
            <dd>{deskDone && deskScene ? `${deskDone.spent} / ${deskScene.hours}` : '—'}</dd>
          </dl>
          <Jurors scene={scene} jury={st.jury} deltas={{}} />
          <div className="lines">
            {scene.outro.map((l, i) => (
              <Speech key={i} line={l} />
            ))}
          </div>
          <button className="primary next" onClick={advance}>
            {t('繼續')}
          </button>
        </main>
      </>
    );

  const claim = scene.witness.claims.find((c) => c.id === pick) ?? scene.witness.claims[0];
  const anchored = anchoredClaims(progress);
  const promised = promisesOf(progress).promises;
  const kept = keptPromises(progress);
  const cs = st.claims[claim.id];

  return (
    <>
      {light}
      <Shell
        resetKey={st.stage === 'direct' ? st.stage : pick}
        head={
          <header className="panel-head bench">
            <p className="eyebrow">
              {/* 包成一段：eyebrow 是 flex，分開放會在「・」前後各多一格間距。 */}
              <span>
                <strong>{t(scene.witness.name, scope)}</strong>
                {t('・')}
                {t(scene.witness.role, scope)}
              </span>
            </p>
            <p
              className="patience"
              aria-label={t('法官耐心 {a} / {b}', { a: st.patience, b: scene.patience })}
            >
              {t('法官耐心')}
              <span className="pips" aria-hidden>
                {Array.from({ length: scene.patience }, (_, i) => (
                  <span key={i} className={i < st.patience ? 'pip on' : 'pip'} />
                ))}
              </span>
            </p>
            {promised.length > 0 && (
              <ul className="iou-chips" aria-label={t('開場許下的承諾')}>
                {promised.map((p, i) => (
                  <li
                    key={p.id}
                    data-state={kept.includes(p.id) ? 'kept' : 'signed'}
                    title={t(p.text, scope)}
                  >
                    {t('借據 {n}', { n: String(i + 1).padStart(2, '0') })}
                    {kept.includes(p.id) ? t('・已兌現') : ''}
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
                  {l.struck && <p className="muted small">{t('（這句話已從陪審團視角刪除）')}</p>}
                </div>
              ))}
            </div>
            <Jurors scene={scene} jury={st.jury} deltas={st.deltas} strip />
            {st.stage === 'cross' && (
              <Tabs
                label={t('證詞')}
                value={pick}
                onPick={setPick}
                items={scene.witness.claims.map((c, i) => ({
                  id: c.id,
                  label: t('證詞 {n}', { n: i + 1 }),
                  done: st.claims[c.id]?.result !== 'none',
                }))}
              />
            )}
          </>
        }
        foot={
          <>
            {st.stage === 'done' && (
              <button className="primary wide next" onClick={() => setRecess(true)}>
                {t('休庭')}
              </button>
            )}
            <EvidenceDrawer note={t('庭上隨時可以翻。出示哪一個論點，看的就是這裡的強度。')} />
            {st.stage === 'cross' && (
              <button
                className="primary wide"
                onClick={() => {
                  // 自己喊停的不必再等一拍，直接進休庭。
                  setRecess(true);
                  finishTrial();
                }}
              >
                {t('詰問完畢')}
              </button>
            )}
            {st.stage === 'direct' && !st.window && (
              <>
                <button className="primary wide" onClick={nextQuestion}>
                  {st.i < scene.witness.direct.length
                    ? t('聽下一個問題')
                    : t('{who}詰問完畢', { who: t(scene.examiner ?? terms.other, scope) })}
                </button>
                {st.i >= scene.witness.direct.length && (
                  <button onClick={toCross}>{t('開始交互詰問')}</button>
                )}
              </>
            )}
          </>
        }
      >
        {/* 自動結束的那一刻：說清楚為什麼停，最後幾句話放在中間欄，不擠在左邊筆錄裡（體驗評測）。 */}
        {st.stage === 'done' && (
          <section className="panel adjourn">
            <h2>
              {t(
                st.stricken
                  ? '證詞全部刪除'
                  : st.pleaded
                    ? '證人援引緘默權'
                    : st.patience <= 0
                      ? '法官叫停了詰問'
                      : '詰問結束',
              )}
            </h2>
            {st.stricken && (
              <p className="muted">
                {t('法官把這位證人在這一場說過的話全部從紀錄上拿掉，陪審團不能採用。')}
              </p>
            )}
            <div className="lines">
              {st.log.slice(-3).map((l, i) => (
                <Speech key={i} line={{ ...l, mood: '平', thought: false }} />
              ))}
            </div>
            <p className="muted small">{t('按「休庭」看這一場的結果。')}</p>
          </section>
        )}
        {st.stage === 'direct' && st.window && (
          <ObjectionWindow rulings={rulingsIn(progress)} onPass={letPass} onObject={object} />
        )}
        {st.stage === 'direct' && !st.window && (
          <p className="muted">
            {t('聽{who}問下去。有問題的地方就在問完的那一刻提異議。', {
              who: t(scene.examiner ?? terms.other, scope),
            })}
          </p>
        )}

        {st.stage === 'cross' && (
          <section className="panel">
            <article className="claim">
              <p className="claim-text">{t('「{text}」', { text: t(claim.text, scope) })}</p>
              <ol className="steps">
                {claim.anchor && anchored.includes(claim.anchor) ? (
                  <li className="done anchored">
                    <Stamp text={t('已定錨')} sm />
                    <span>{t('她在錄取筆錄裡已經講死這個說法')}</span>
                  </li>
                ) : (
                  <li className={cs.lock !== 'none' ? 'done' : ''}>
                    {t('1 鎖定')}
                    {cs.lock === 'none' && (
                      <div className="stack">
                        <button className="wide" onClick={() => lock(claim.id, 'strong')}>
                          {t(claim.lock.strong.q, scope)}
                        </button>
                        <button className="wide" onClick={() => lock(claim.id, 'weak')}>
                          {t(claim.lock.weak.q, scope)}
                        </button>
                      </div>
                    )}
                  </li>
                )}
                <li className={cs.setup ? 'done' : ''}>
                  {t('2 鋪陳')}
                  {!cs.setup && (
                    <button className="wide" onClick={() => setup(claim.id)}>
                      {t(claim.setup.q, scope)}
                    </button>
                  )}
                </li>
                <li className={cs.result !== 'none' ? 'done' : ''}>
                  {t('3 對質')}
                  {cs.result === 'none' && (
                    <div className="stack">
                      {args.map((a) => (
                        <CardPick
                          key={a.id}
                          item={{ ...a, name: t(a.name, scope), text: t(a.text, scope) }}
                          verb={t('出示')}
                          tag={exposed.includes(a.id) ? t('（已洩漏，她備好了反擊）') : undefined}
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
                      {args.length === 0 && (
                        <span className="muted">{t('手上沒有論點可以出示。')}</span>
                      )}
                    </div>
                  )}
                </li>
              </ol>
            </article>
            <details>
              <summary>{t('其他問題')}</summary>
              <ul className="stack">
                {scene.witness.irrelevant.map((q, i) => (
                  <li key={i}>
                    <button className="wide" onClick={() => badger(i)}>
                      {t(q.q, scope)}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </Shell>
    </>
  );
}
