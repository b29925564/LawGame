import { useLayoutEffect, useRef, useState } from 'react';
import * as interview from '../engine/episode/interview';
import type { InterviewScene } from '../engine/episode/schema';
import { interviewState, useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { useScope } from './lang';
import { StickyNote } from './Marks';
import { Portrait, Speech } from './Portrait';
import { Transcript } from './Shell';
import { fitDots, fitLine } from './prose';
import { fitUnits } from './fitUnits';

/** 按鈕標籤至少有一個排成兩行以上。 */
const wraps = (row: HTMLElement) =>
  [...row.querySelectorAll('button')].some((b) => {
    const r = document.createRange();
    r.selectNodeContents(b);
    const tops = new Set(
      [...r.getClientRects()].filter((x) => x.width > 0.5).map((x) => Math.round(x.top)),
    );
    return tops.size > 1;
  });

/**
 * 「提問｜施壓｜安撫（剩 2 次）」三格放不下（320 寬中文 150%：「提⏎問」一字一行、底部被切）：
 * 每顆的字一行，放不下就排成兩列（提問、施壓一列，安撫一列），還放不下就三顆直排（設計師第二道關卡 72a9003 裁定 4）。
 * 選項區會縮、會捲，最矮也要整列按鈕看得到，不切。
 */
function useActionRow(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    const panel = row?.parentElement;
    if (!row || !panel) return;
    const fit = () => {
      delete row.dataset.cols;
      panel.style.removeProperty('min-height');
      fitUnits(row);
      for (const cols of ['2', '1']) {
        if (!wraps(row)) break;
        row.dataset.cols = cols;
        fitUnits(row);
      }
      const cs = getComputedStyle(panel);
      const n = (v: string) => parseFloat(v) || 0;
      const need =
        row.getBoundingClientRect().height +
        n(cs.paddingTop) +
        n(cs.paddingBottom) +
        n(cs.borderTopWidth) +
        n(cs.borderBottomWidth);
      if (need > n(cs.minHeight)) panel.style.minHeight = `${Math.ceil(need)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

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
  const calms = st.calms ?? scene.calms;
  const row = useActionRow([t, calms, ending]);

  return (
    <main className="scene interview">
      <header className="call panel">
        <Portrait who={scene.who} mood={lastMood} />
        <div>
          <h2>{t(scene.who, scope)}</h2>
          <p className="muted">
            {fitDots(
              [...t(scene.role, scope).split('・'), t(scene.via, scope)],
              t('{a}・{b}', { a: t(scene.role, scope), b: t(scene.via, scope) }),
            )}
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
          {/* 提問／施壓是分頁；安撫是動作，放在分頁列外面（無障礙審查第 7 條）。 */}
          <div className="row" ref={row}>
            <div className="row" role="tablist" aria-label={t('問法')}>
              <button
                role="tab"
                id="iv-tab-ask"
                aria-controls="iv-panel"
                aria-selected={tab === 'ask'}
                onClick={() => setTab('ask')}
              >
                {fitLine(t('提問'))}
              </button>
              <button
                role="tab"
                id="iv-tab-press"
                aria-controls="iv-panel"
                aria-selected={tab === 'press'}
                onClick={() => setTab('press')}
              >
                {fitLine(t('施壓'))}
              </button>
            </div>
            <button disabled={calms <= 0} onClick={calm}>
              {fitLine(t('安撫（剩 {n} 次）', { n: calms }))}
            </button>
          </div>
          {tab === 'ask' ? (
            <ul className="stack" id="iv-panel" role="tabpanel" aria-labelledby="iv-tab-ask">
              {topics.map((tp) => (
                <li key={tp.id}>
                  <button className="wide" onClick={() => ask(tp.id)}>
                    {/* 問題鈕也照短標籤排（設計師 #329 @7fde9ba：「疲勞提醒是怎麼運作｜的？」）。 */}
                    {fitLine(t(tp.label, scope))}
                  </button>
                </li>
              ))}
              {topics.length === 0 && <li className="muted">{t('沒有別的想問了。')}</li>}
            </ul>
          ) : (
            <ul className="stack" id="iv-panel" role="tabpanel" aria-labelledby="iv-tab-press">
              {scene.press
                .filter((p) => !st.pressed.includes(p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button className="wide" onClick={() => press(p.id)}>
                      {fitLine(t(p.label, scope))}
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
