import { useCaseTerms } from './terms';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { termsOf, type Jury } from '../engine/jury';
import type { Tag } from '../engine/schema';
import { useSettings } from '../engine/settings';
import { play } from '../engine/sound';
import { useT } from '../i18n';
import { CardPick, EvidenceDrawer } from './Evidence';
import { JuryBox } from './jury/JuryBox';
import { CourtLight } from './CourtLight';
import { useScope } from './lang';
import { Stamp } from './Marks';
import { Speech } from './Portrait';
import { batesOf, CourtRecord, useCourtEntries } from './Record';
import { Shell, Tabs } from './Shell';
import { CourtCast } from './jury/CourtFace';
import { Recap } from './ActCard';
import { reducedMotion } from './a11y';
import { msOf, type ObjectionBeat, type Tok } from './court/beat';
import { CourtCamera, type Shot, type WitnessState } from './court/CourtCamera';
import { Portrait } from './Portrait';

/**
 * 法庭裡的陪審團（設定集第 8.4、10.1 章）：剪影替身與四階影子。桌機放在中間欄（HUD 的位置），
 * 手機收成刻痕條釘在筆錄下面，點開才看臉——展開的面板會把詰問的按鈕推出畫面。
 */
function CourtJury({
  scene,
  jury,
  deltas,
  eventKey,
  collapsible,
}: {
  scene: TrialScene;
  jury: Jury;
  deltas: Jury;
  eventKey: number;
  collapsible?: boolean;
}) {
  const t = useT();
  const episode = useEpisode((s) => s.progress.episode);
  const over = scene.jurors.filter((j) => (jury[j.id] ?? 0) >= scene.threshold).length;
  return (
    <JuryBox
      episode={episode}
      jurors={scene.jurors}
      jury={jury}
      deltas={deltas}
      eventKey={eventKey}
      threshold={scene.threshold}
      collapsible={collapsible}
      summary={t('{over} / {total} 傾向{yes}', {
        over,
        total: scene.jurors.length,
        yes: t(termsOf(scene).yes),
      })}
    />
  );
}

/** 手機與窄視窗（法庭版面變一欄的寬度）。 */
function useNarrow() {
  const q = '(max-width: 1023px)';
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia(q).matches,
  );
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
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
  const inEffect = rulings.map((r) => t(r, scope)).join(t('、'));
  return (
    <section className="panel objection" aria-label={t('異議')}>
      {/* 「不異議」放在標題列：法庭中欄還有鏡頭條和陪審團，整個面板要在一屏內，不捲動（設計師 P3 裁定 5）。 */}
      <div className="panel-head">
        <h2>{t('要異議嗎？')}</h2>
        {seconds > 0 && <span className="muted">{t('{n} 秒', { n: Math.max(0, left) })}</span>}
        {/* 寬度 ≤ 1440 時「生效中」搬進標題列，窗壓矮（設計師 #247 第一輪）；放不下就斷在「：」後面。 */}
        {rulings.length > 0 && (
          <span className="in-effect head muted">
            <span>{t('生效中：')}</span>
            <span>{inEffect}</span>
          </span>
        )}
        <button className="pass" onClick={onPass}>
          {t('不異議')}
        </button>
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
        <p className="in-effect foot muted small">
          {t('生效中：{rulings}', { rulings: inEffect })}
        </p>
      )}
    </section>
  );
}

/** 法庭畫面：說話者頭像是剪影替身（P4-2）。 */
/**
 * 法官耐心燈管（設定集第 10.2、10.6 章）：熄一根是一次降到 0、不閃；最後一根熄掉時閃兩下。
 * 閃不閃、漸不漸暗都交給 court.css 讀 html[data-photosafe]／html[data-reduced-motion]。
 */
function Tubes({ n, max }: { n: number; max: number }) {
  const [prev, setPrev] = useState(n);
  const [spent, setSpent] = useState(false);
  if (n !== prev) {
    setPrev(n);
    setSpent(n <= 0 && prev > 0);
  }
  return (
    <span className="pips" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'pip on' : spent && i === 0 ? 'pip spent' : 'pip'} />
      ))}
    </span>
  );
}

/** 異議那一拍走到哪了（court/beat.ts 的節拍表）：type 打字、black 一刀黑、bench 法官席、back 切回、answer 證人照答。 */
type Phase = 'type' | 'black' | 'bench' | 'back' | 'answer';

/**
 * 招牌時刻的鏡頭與輸入鎖：筆錄交出節拍表（照樣式表上的權杖換算），這裡照表切機位；
 * 整拍走完才把主按鈕還給玩家（設定集 10.3：這一拍裡輸入鎖住）。
 */
function useObjectionBeat() {
  const [beat, setBeat] = useState<{ t: ObjectionBeat; phase: Phase } | null>(null);
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clear, []);
  const start = useCallback((t: ObjectionBeat, read: (tok: Tok) => number) => {
    clear();
    setBeat({ t, phase: 'type' });
    const at = (when: typeof t.black, f: () => void) =>
      timers.current.push(window.setTimeout(f, msOf(when, read)));
    const go = (phase: Phase) => () => setBeat((b) => (b ? { ...b, phase } : b));
    at(t.black, go('black'));
    at(t.bench, go('bench'));
    at(t.back, go('back'));
    at(t.rest, go('answer'));
    at(t.end, () => setBeat(null));
  }, []);
  return [beat, start] as const;
}

/** 這一刻的鏡頭：減少動態時不切黑，直接（淡入）換到下一個機位。 */
function shotOf(phase: Phase | undefined): Shot {
  const rm = reducedMotion();
  if (phase === 'black') return rm ? 'bench' : 'black';
  if (phase === 'bench') return 'bench';
  if (phase === 'back') return rm ? 'witness' : 'black';
  return 'witness';
}

export function Courtroom({ scene }: { scene: TrialScene }) {
  return (
    <CourtCast>
      <CourtroomScreen scene={scene} />
    </CourtCast>
  );
}

function CourtroomScreen({ scene: raw }: { scene: TrialScene }) {
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
  const record = useCourtEntries(st.log, scene.witness.name, st.stricken);
  const bates = batesOf(progress, raw.id);
  const narrow = useNarrow();
  const [beat, startBeat] = useObjectionBeat();
  const [insert, setInsert] = useState<HTMLDivElement | null>(null);

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
            <Recap />
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
              <CourtRecord
                entries={record}
                until={st.log.length - tail}
                bates={bates}
                className="full"
              />
            </details>
          )}
          <CourtRecord
            entries={record}
            from={st.log.length - tail}
            bates={bates}
            className="full"
          />
          <dl className="stats">
            <dt>{t('成功彈劾')}</dt>
            <dd>
              {st.impeachments} / {scene.witness.claims.length}
            </dd>
            {/* 成立的異議（問題塗黑、證人沒答）和整段刪除的證詞都算：數的是筆錄上的黑條。 */}
            <dt>{t('筆錄上的黑條')}</dt>
            <dd>{t('{n} 處', { n: st.struck })}</dd>
            <dt>{t('剩餘法官耐心')}</dt>
            <dd>
              {Math.max(0, st.patience)} / {scene.patience}
            </dd>
            <dt>{t('調查花掉的工時')}</dt>
            <dd>{deskDone && deskScene ? `${deskDone.spent} / ${deskScene.hours}` : '—'}</dd>
          </dl>
          <CourtJury scene={scene} jury={st.jury} deltas={{}} eventKey={0} />
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
  // 鏡頭：證人席的光照目前這項證詞走到哪一步（第 10.4 章：鎖定、鋪陳；對質那一刻歸出示對質那一拍）。
  const shot = shotOf(beat?.phase);
  const witnessState: WitnessState = st.pleaded
    ? 'fifth'
    : st.stage === 'cross' && cs
      ? cs.setup
        ? 'build'
        : cs.lock !== 'none'
          ? 'lock'
          : 'default'
      : 'default';
  // 手機插入的鏡頭：一刀黑起打開；成立時法官說完就收，駁回時留到證人答完。
  const insertOpen =
    !!beat &&
    (beat.phase === 'black' ||
      beat.phase === 'bench' ||
      (!beat.t.sustained && (beat.phase === 'back' || beat.phase === 'answer')));
  const camera = {
    shot,
    witness: scene.witness.name,
    state: witnessState,
    patience: st.patience,
    scene: raw.id,
  };
  // 手機常駐的說話者頭像（第 10.1 章「對話頭像：法庭＝立繪」，56×70）：最後開口的人；盧卡斯用立繪。
  const speaker = [...st.log].reverse().find((l) => l.who !== '旁白')?.who ?? scene.witness.name;
  const now = (body: ReactNode) =>
    narrow ? (
      <div className="court-now">
        <Portrait who={speaker} decorative />
        {body}
      </div>
    ) : (
      body
    );
  // 異議那一拍裡輸入鎖住：主按鈕藏起來（位置留著，版面不跳）。
  const locked = beat ? { className: 'locked', inert: true } : {};

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
              <Tubes n={st.patience} max={scene.patience} />
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
            <CourtRecord
              entries={record}
              live
              fit
              bates={bates}
              onBeat={startBeat}
              beat={!!beat}
              cover={narrow && beat ? insert : null}
            />
            {!narrow && <CourtCamera mode="strip" {...camera} />}
            <CourtJury
              scene={scene}
              jury={st.jury}
              deltas={st.deltas}
              eventKey={st.said ?? st.log.length}
              collapsible={narrow}
            />
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
            {narrow && <CourtCamera ref={setInsert} mode="insert" open={insertOpen} {...camera} />}
            {st.stage === 'done' && (
              <button
                className={`primary wide next${beat ? ' locked' : ''}`}
                inert={!!beat}
                onClick={() => setRecess(true)}
              >
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
                <button
                  className={`primary wide${beat ? ' locked' : ''}`}
                  inert={!!beat}
                  onClick={nextQuestion}
                >
                  {st.i < scene.witness.direct.length
                    ? t('聽下一個問題')
                    : t('{who}詰問完畢', { who: t(scene.examiner ?? terms.other, scope) })}
                </button>
                {st.i >= scene.witness.direct.length && (
                  <button {...locked} onClick={toCross}>
                    {t('開始交互詰問')}
                  </button>
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
            {/* 最後三句攤開排（.full）：不是捲動框，不會露出半行。 */}
            <CourtRecord
              entries={record}
              from={Math.max(0, st.log.length - 3)}
              bates={bates}
              className="full"
            />
            <p className="muted small">{t('按「休庭」看這一場的結果。')}</p>
          </section>
        )}
        {st.stage === 'direct' && st.window && (
          <ObjectionWindow rulings={rulingsIn(progress)} onPass={letPass} onObject={object} />
        )}
        {st.stage === 'direct' &&
          !st.window &&
          now(
            <p className="muted">
              {t('聽{who}問下去。有問題的地方就在問完的那一刻提異議。', {
                who: t(scene.examiner ?? terms.other, scope),
              })}
            </p>,
          )}

        {st.stage === 'cross' && (
          <section className="panel">
            <article className="claim">
              {now(<p className="claim-text">{t('「{text}」', { text: t(claim.text, scope) })}</p>)}
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
