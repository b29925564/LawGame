import { useState } from 'react';
import { Iou, useHand } from './Marks';
import type { OpeningScene, TheoryScene } from '../engine/episode/schema';
import * as theory from '../engine/episode/theory';
import { episodeOf, openingState, promisesOf, theoryState, useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { useScope } from './lang';
import { Speech } from './Portrait';

/**
 * 案件理論（企劃書 6.9.2）：整集最大的策略決定，選了不能換。
 * 論點湊不齊的理論照樣列出來，寫明缺什麼，玩家才知道為什麼選不了。
 */
export function Theory({ scene }: { scene: TheoryScene }) {
  const { progress, chooseTheory, skipTheory, advance } = useEpisode();
  const st = theoryState(progress, scene);
  const t = useT();
  const scope = useScope();
  const held = progress.cards;
  const [intro, setIntro] = useState(!theory.done(st));
  const [pending, setPending] = useState<string | null>(null);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t(scene.act, scope)}・{t(scene.place, scope)}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          {t('選擇案件理論')}
        </button>
      </main>
    );

  const noneOpen = !scene.theories.some((th) => theory.unlocked(th, held));
  const warn = scene.intro.find((l) => l.mark?.kind === 'confirm')?.text;
  return (
    <main className="scene">
      <p className="eyebrow">{t('案件理論')}</p>
      <ul className="stack">
        {scene.theories.map((th) => {
          const ok = theory.unlocked(th, held);
          const on = st.chosen === th.id;
          return (
            <li key={th.id} className={on ? 'panel chain done' : 'panel'}>
              <strong>{t(th.name, scope)}</strong>
              <p>{t(th.summary, scope)}</p>
              <p className="muted small">{t(th.cost, scope)}</p>
              {!theory.done(st) &&
                (pending === th.id && warn ? (
                  <Confirm
                    text={t(warn, scope)}
                    yes={t('確定，就用「{name}」', { name: t(th.name, scope) })}
                    onYes={() => chooseTheory(th.id)}
                    onNo={() => setPending(null)}
                  />
                ) : (
                  <button
                    className="primary"
                    disabled={!ok}
                    onClick={() => (warn ? setPending(th.id) : chooseTheory(th.id))}
                  >
                    {t('就用這個理論')}
                  </button>
                ))}
              {on && <p className="good">{t('已選定。')}</p>}
            </li>
          );
        })}
      </ul>
      {noneOpen && !theory.done(st) && (
        <button onClick={skipTheory}>{t('手上的論點撐不起任何理論，直接開庭')}</button>
      )}
      {theory.done(st) && (
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      )}
    </main>
  );
}

/** 開場陳述（企劃書 6.9.3）：從選定理論的承諾裡挑，最多三個。 */
export function Opening({ scene }: { scene: OpeningScene }) {
  const { progress, togglePromise, deliverOpening, advance } = useEpisode();
  const st = openingState(progress, scene);
  const { theory: th } = promisesOf(progress);
  const t = useT();
  const scope = useScope();
  const argName = (id: string) =>
    episodeOf(progress)
      .scenes.flatMap((x) => (x.type === 'desk' ? x.questions : []))
      .find((q) => q.argument.id === id)?.argument.name;
  const [intro, setIntro] = useState(!st.delivered);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t(scene.act, scope)}・{t(scene.place, scope)}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          {t('開始陳述')}
        </button>
      </main>
    );

  return (
    <main className="scene">
      <p className="eyebrow">
        {t('開場陳述')}
        {th ? `・${t(th.name, scope)}` : ''}
      </p>
      {!th ? (
        <p className="muted">{t('沒有選定的案件理論，沒有任何承諾可以許。')}</p>
      ) : (
        <>
          <p className="muted small">
            {t('承諾 {a} / {b}', {
              a: st.promises.length,
              b: Math.min(scene.picks, th.promises.length),
            })}
          </p>
          <ul className="stack ious">
            {th.promises.map((p, i) => (
              <li key={p.id}>
                <button
                  className="iou-pick"
                  aria-pressed={st.promises.includes(p.id)}
                  disabled={st.delivered}
                  onClick={() => togglePromise(p.id)}
                >
                  <Iou
                    no={i + 1}
                    text={t(p.text, scope)}
                    backing={argName(p.argument) && t(argName(p.argument) ?? '', scope)}
                    kept={scene.kept}
                    broken={scene.broken}
                    state={st.promises.includes(p.id) ? 'signed' : 'draft'}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!st.delivered ? (
        <button className="primary next" onClick={deliverOpening}>
          {st.promises.length ? t('許下 {n} 個承諾', { n: st.promises.length }) : t('不許任何承諾')}
        </button>
      ) : (
        <button className="primary next" onClick={advance}>
          {t('開庭')}
        </button>
      )}
    </main>
  );
}

/** 選擇確認提示：此畫面唯一一處手的黃（設計稿 inner-voice 2g）。 */
function Confirm({
  text,
  yes,
  onYes,
  onNo,
}: {
  text: string;
  yes: string;
  onYes: () => void;
  onNo: () => void;
}) {
  useHand('confirm');
  const t = useT();
  return (
    <div className="confirm" role="alert">
      <p>{text}</p>
      <div className="row">
        <button className="primary" onClick={onYes}>
          {yes}
        </button>
        <button onClick={onNo}>{t('再想想')}</button>
      </div>
    </div>
  );
}
