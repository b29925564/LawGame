import { useEffect, useRef, useState } from 'react';
import { Iou, useHand } from './Marks';
import type { OpeningScene, TheoryScene } from '../engine/episode/schema';
import * as theory from '../engine/episode/theory';
import { episodeOf, openingState, promisesOf, theoryState, useEpisode } from '../engine/game';
import { theoryOutlook } from '../engine/ledger';
import { useMoney, useT } from '../i18n';
import { CommitBar } from './Commit';
import { JuryStart } from './JuryStart';
import { useScope } from './lang';
import { Speech } from './Portrait';
import { Recap } from './ActCard';

/**
 * 案件理論（企劃書 6.9.2）：整集最大的策略決定，選了不能換。
 * 論點湊不齊的理論照樣列出來，寫明缺什麼，玩家才知道為什麼選不了。
 */
export function Theory({ scene }: { scene: TheoryScene }) {
  const { progress, chooseTheory, skipTheory, advance } = useEpisode();
  const st = theoryState(progress, scene);
  const t = useT();
  const scope = useScope();
  const money = useMoney();
  const held = progress.cards;
  const [intro, setIntro] = useState(!theory.done(st));
  const [pending, setPending] = useState<string | null>(null);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t(scene.act, scope)}
          {t('・')}
          {t(scene.place, scope)}
        </p>
        <div className="lines">
          <Recap />
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
  const civil = episodeOf(progress).scenes.some((x) => x.type === 'trial' && x.burden === 'civil');
  // 民事才有金額：用律師想事情的單位說代價（UX 規格 decision-cost §二）。
  const outlook = (id: string) => {
    const o = theoryOutlook(progress, id);
    if (!o) return null;
    return (
      <span className="theory-row">
        <span className="jury-start-key">{t('若判有責')}</span>
        <span>
          {t('約 {low}到 {high}', { low: money(o.low), high: money(o.high) })}
          {o.punitive && (
            <small className="muted">
              {o.ratio === 1
                ? t('懲罰性賠償可能再加同額')
                : o.ratio
                  ? t('懲罰性賠償可能另加 {r} 倍', { r: o.ratio })
                  : t('懲罰性賠償另計')}
            </small>
          )}
        </span>
      </span>
    );
  };
  const argName = (id: string) =>
    episodeOf(progress)
      .scenes.flatMap((x) => (x.type === 'desk' ? x.questions : []))
      .find((q) => q.argument.id === id)?.argument.name ?? id;
  const sel = scene.theories.find((th) => th.id === pending);
  const done = theory.done(st);
  // 三張並排的比較卡（UX 規格 decision-cost §二）：點卡片＝選中，底部定案列才真的選定。
  return (
    <main className="scene theory-pick">
      <p className="eyebrow">{t('案件理論')}</p>
      {!done && <p className="muted">{t('點一張卡比較，再按下面的「以這個理論開庭」定案。')}</p>}
      <ul className="theory-grid">
        {scene.theories.map((th) => {
          const ok = theory.unlocked(th, held);
          const on = done ? st.chosen === th.id : pending === th.id;
          const missing = th.needs.filter((n) => !held.includes(n));
          return (
            <li key={th.id}>
              <button
                className={['theory-card', on && 'on', !ok && 'locked'].filter(Boolean).join(' ')}
                aria-pressed={on}
                disabled={done || !ok}
                onClick={() => setPending(th.id)}
              >
                <strong className="theory-name">{t(th.name, scope)}</strong>
                <span className="theory-summary">{t(th.summary, scope)}</span>
                <span className="theory-rows">
                  <JuryStart jury={th.jury} civil={civil} />
                  {th.promises.length > 0 && !th.jury && (
                    <span className="theory-row">
                      <span className="jury-start-key">{t('承諾')}</span>
                      {t('可許 {n} 個承諾，沒兌現會反噬', { n: th.promises.length })}
                    </span>
                  )}
                  {outlook(th.id)}
                  <span className="theory-row">
                    <span className="jury-start-key">{t('代價')}</span>
                    {t(th.cost, scope)}
                  </span>
                </span>
                <span className="theory-needs">
                  <span className="jury-start-key">{t('需要')}</span>
                  {th.needs.map((n) => {
                    const [head] = t(argName(n), scope).split(/：|: /);
                    const have = held.includes(n);
                    return (
                      <span key={n} className={have ? 'need ok' : 'need miss'}>
                        <span className="diamond" aria-hidden>
                          ◆
                        </span>
                        {head} {have ? '✓' : '✗'}
                      </span>
                    );
                  })}
                </span>
                {!ok && (
                  <span className="bad-text small">
                    {t('還缺 {list}', {
                      list: missing.map((n) => t(argName(n), scope).split(/：|: /)[0]).join('、'),
                    })}
                  </span>
                )}
                {done && on && <span className="good">{t('已選定。')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {!done && sel && (
        <TheoryCommit
          what={t(sel.name, scope)}
          cost={t(sel.jury?.note ?? sel.cost, scope)}
          onCommit={() => chooseTheory(sel.id)}
        />
      )}
      {noneOpen && !done && (
        <button onClick={skipTheory}>{t('手上的論點撐不起任何理論，直接開庭')}</button>
      )}
      {done && (
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      )}
    </main>
  );
}

/** 定案列外面包一層：盧卡斯的手在這一步出現（confirm 記號），和以前的確認對話框同一個時機。 */
function TheoryCommit(p: { what: string; cost: string; onCommit: () => void }) {
  useHand('confirm');
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // 定案列不黏底（黏底會蓋住卡片）；選了哪張，就把列捲進畫面。
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [p.what]);
  return (
    <div ref={ref}>
      <CommitBar {...p} action={t('以這個理論開庭')} />
    </div>
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
          {t(scene.act, scope)}
          {t('・')}
          {t(scene.place, scope)}
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
        {th ? `${t('・')}${t(th.name, scope)}` : ''}
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
