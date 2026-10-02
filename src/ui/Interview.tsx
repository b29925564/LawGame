import { useState } from 'react';
import * as interview from '../engine/episode/interview';
import type { InterviewScene } from '../engine/episode/schema';
import { interviewState, useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { useScope } from './lang';
import { StickyNote } from './Marks';
import { Portrait, Speech } from './Portrait';
import { Transcript } from './Shell';

/** 訪談（企劃書 6.3）：提問、施壓、安撫。視訊通話畫面。 */
export function Interview({ scene }: { scene: InterviewScene }) {
  const { progress, advance, ask, press, calm } = useEpisode();
  const t = useT();
  const scope = useScope();
  const st = interviewState(progress, scene);
  const [tab, setTab] = useState<'ask' | 'press'>('ask');
  // 結束會見時先播收尾（獄警敲門之類），再按一次才離開。
  const [leaving, setLeaving] = useState(false);
  const ending = leaving || st.over;
  const topics = interview.openTopics(scene, st, progress.cards);
  const canFinish = interview.canFinish(scene, st);
  // 便利貼貼在標頭計量表左邊（設計稿 inner-voice 2a）。
  const note = [...st.log].reverse().find((l) => l.mark?.kind === 'sticky' && l.mark.on);
  const lastMood = [...st.log].reverse().find((l) => l.who === scene.who)?.mood ?? '平';

  return (
    <main className="scene interview">
      <header className="call panel">
        <Portrait who={scene.who} mood={lastMood} />
        <div>
          <h2>{t(scene.who, scope)}</h2>
          <p className="muted">
            {t('{a}・{b}', { a: t(scene.role, scope), b: t(scene.via, scope) })}
          </p>
        </div>
        {note && (
          <StickyNote
            pinned
            text={t(note.mark?.text ?? note.text, scope)}
            word={note.mark?.word && t(note.mark.word, scope)}
          />
        )}
        <p
          className="meter"
          aria-label={`${t(scene.meter.label, scope)} ${st.guard} / ${scene.meter.max}`}
        >
          <span className="muted">{t(scene.meter.label, scope)}</span>
          <span className="pips" aria-hidden>
            {Array.from({ length: scene.meter.max }, (_, i) => (
              <span key={i} className={i < st.guard ? 'pip on' : 'pip'} />
            ))}
          </span>
        </p>
      </header>

      <Transcript count={st.log.length + (ending ? scene.outro.length : 0)}>
        {st.log.map((l, i) => (
          <Speech key={i} line={l} />
        ))}
        {ending && scene.outro.map((l, i) => <Speech key={`outro-${i}`} line={l} />)}
      </Transcript>

      {ending ? null : (
        <section className="panel actions">
          <div className="row" role="tablist">
            <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>
              {t('提問')}
            </button>
            <button role="tab" aria-selected={tab === 'press'} onClick={() => setTab('press')}>
              {t('施壓')}
            </button>
            <button disabled={(st.calms ?? scene.calms) <= 0} onClick={calm}>
              {t('安撫（剩 {n} 次）', { n: st.calms ?? scene.calms })}
            </button>
          </div>
          {tab === 'ask' ? (
            <ul className="stack">
              {topics.map((tp) => (
                <li key={tp.id}>
                  <button className="wide" onClick={() => ask(tp.id)}>
                    {t(tp.label, scope)}
                  </button>
                </li>
              ))}
              {topics.length === 0 && <li className="muted">{t('沒有別的想問了。')}</li>}
            </ul>
          ) : (
            <ul className="stack">
              {scene.press
                .filter((p) => !st.pressed.includes(p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button className="wide" onClick={() => press(p.id)}>
                      {t(p.label, scope)}
                    </button>
                  </li>
                ))}
              <li className="muted">{t('施壓會讓他更防備。手上有東西撐著再問。')}</li>
            </ul>
          )}
        </section>
      )}

      {leaving ? (
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      ) : (
        <button
          className="primary next"
          disabled={!canFinish}
          onClick={() => (!st.over && scene.outro.length ? setLeaving(true) : advance())}
        >
          {st.over ? t('離開會見室') : canFinish ? t('結束會見') : t('還有關鍵的事沒問')}
        </button>
      )}
    </main>
  );
}
