import { optionOpen, useEpisode, sceneChoices } from '../engine/game';
import type { DialogueScene, Line } from '../engine/episode/schema';
import { useT } from '../i18n';
import { useScope } from './lang';
import { LucasStage, Speech } from './Portrait';
import { Transcript } from './Shell';

/** 對話場景：一路往下讀，遇到選擇就停。之前的台詞留在畫面上，方便回頭看。 */
export function Dialogue({ scene }: { scene: DialogueScene }) {
  const { progress, advance, choose } = useEpisode();
  const t = useT();
  const scope = useScope();
  const picks = sceneChoices(progress);
  const lines: Line[] = [];
  for (let i = 0; i <= progress.step && i < scene.steps.length; i++) {
    const s = scene.steps[i];
    if (s.do === 'say') {
      lines.push({ who: s.who, text: s.text, mood: s.mood, thought: s.thought });
    } else if (picks[i] !== undefined) {
      const o = s.options[picks[i]];
      lines.push({ who: '盧卡斯', text: o.text, mood: '平', thought: false }, ...o.then);
    }
  }
  const step = scene.steps[progress.step];
  const choosing = step?.do === 'choose' && picks[progress.step] === undefined;

  return (
    <main className="scene dialogue">
      <p className="eyebrow">{t(scene.place, scope)}</p>
      <LucasStage lines={lines} />
      <Transcript count={lines.length}>
        {lines.map((l, i) => (
          <Speech key={i} line={l} />
        ))}
      </Transcript>
      {choosing && step.do === 'choose' ? (
        <div
          className="choices"
          role="group"
          aria-label={step.prompt ? t(step.prompt, scope) : t('選擇')}
        >
          {step.prompt && <p className="muted">{t(step.prompt, scope)}</p>}
          {step.options.map((o, i) =>
            optionOpen(progress, o) ? (
              <button key={i} onClick={() => choose(i)}>
                {t(o.text, scope)}
              </button>
            ) : null,
          )}
        </div>
      ) : (
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      )}
    </main>
  );
}
