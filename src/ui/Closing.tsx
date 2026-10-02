import { useCaseTerms } from './terms';
import * as closing from '../engine/episode/closing';
import type { ClosingScene } from '../engine/episode/schema';
import {
  closingArgs,
  closingState,
  endingOf,
  promisesOf,
  exposedArgs,
  juryAfterTrial,
  useEpisode,
} from '../engine/game';
import { useT } from '../i18n';
import { CardPick, EvidenceDrawer } from './Evidence';
import { useScope } from './lang';
import { Tally } from './Marks';
import { Speech } from './Portrait';
import { Shell, Tabs } from './Shell';
import { useState } from 'react';

/** 結辯與判決（企劃書 6.9.8、6.10）：挑三個論點排順序、選基調，然後看三輪評議。 */
export function Closing({ scene }: { scene: ClosingScene }) {
  const { progress, pickArg, setTone, deliver, advance } = useEpisode();
  const st = closingState(progress, scene);
  const terms = useCaseTerms();
  const t = useT();
  const scope = useScope();
  const exposed = exposedArgs(progress);
  const args = closingArgs(progress);
  const [tab, setTab] = useState<'args' | 'tone'>('args');
  const need = closing.needed(scene, args.length);
  const rules = juryAfterTrial(progress)?.rules;

  if (st.verdict)
    return (
      <main className="scene">
        <p className="eyebrow">{t('判決')}</p>
        <h1>{t(st.verdict)}</h1>
        <ol className="stack">
          {st.rounds.map((r, i) => (
            <li key={i} className="panel">
              <strong>{t('第 {n} 輪評議', { n: i + 1 })}</strong>
              {r.moves.map((m, j) => (
                <p key={j} className="muted">
                  {t(m, scope)}
                </p>
              ))}
            </li>
          ))}
        </ol>
        <div className="lines">
          {endingOf(progress, scene).map((l, i) =>
            l.mark?.kind === 'tally' ? (
              rules && (
                <Tally
                  key={i}
                  round={st.rounds.length}
                  burden={rules.burden}
                  guilty={rules.jurors.map((j) => st.jury[j.id] >= rules.threshold)}
                />
              )
            ) : (
              <Speech key={i} line={l} />
            ),
          )}
        </div>
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      </main>
    );

  return (
    <Shell
      resetKey={tab}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">
            {t(scene.act, scope)}・{t(scene.place, scope)}
          </p>
          <p className="patience">
            {t('論點')}{' '}
            <strong>
              {st.picked.length}/{need}
            </strong>{' '}
            {t('・ 基調 {state}', { state: st.tone ? t('已選') : t('未選') })}
          </p>
          {need < scene.picks && (
            <p className="bad-text small">
              {t('手上的論點不夠，結辯會空 {n} 格，{other}的說法沒人反駁。', {
                n: scene.picks - need,
                other: t(terms.other),
              })}
            </p>
          )}
          {!promisesOf(progress).theory && (
            <p className="bad-text small">{t('沒有案件理論，論點說服力打七折。')}</p>
          )}
          {(st.broken ?? []).length > 0 && (
            <p className="bad-text small">
              {t('開場許下的 {n} 個承諾沒有兌現，陪審員記得你說過的話。', { n: st.broken.length })}
            </p>
          )}
        </header>
      }
      tabs={
        <Tabs
          label={t('結辯')}
          value={tab}
          onPick={setTab}
          items={[
            { id: 'args', label: t('論點'), done: st.picked.length === need },
            { id: 'tone', label: t('訴求基調'), done: !!st.tone },
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
            {t('開始結辯')}
          </button>
        </>
      }
    >
      {tab === 'args' && (
        <section className="panel">
          <h2>{t('挑 {n} 個論點，順序就是你講的順序', { n: need })}</h2>
          {need < scene.picks && (
            <p className="muted small">
              {t('手上只有 {n} 個確認過的論點，{rest}', {
                n: args.length,
                rest: need === 0 ? t('只能靠訴求基調結辯。') : t('有幾個講幾個。'),
              })}
            </p>
          )}
          <div className="stack">
            {args.map((a) => {
              const i = st.picked.indexOf(a.id);
              return (
                <CardPick
                  key={a.id}
                  item={{ ...a, name: t(a.name, scope), text: t(a.text, scope) }}
                  on={i >= 0}
                  verb={i >= 0 ? `${i + 1}.` : undefined}
                  tag={exposed.includes(a.id) ? t('（已洩漏）') : undefined}
                  onPick={() => pickArg(a.id)}
                />
              );
            })}
            {args.length === 0 && <p className="muted">{t('手上沒有確認過的論點。')}</p>}
          </div>
          {st.picked.length > 0 && (
            <ol className="picked">
              {st.picked.map((id, i) => (
                <li key={id}>
                  {i + 1}. {t(args.find((a) => a.id === id)?.name ?? '', scope)}
                  {i === st.picked.length - 1 && st.picked.length === need && (
                    <span className="good"> {t('・最後講，×1.3')}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {tab === 'tone' && (
        <section className="panel">
          <h2>{t('訴求基調')}</h2>
          <div className="lines">
            {scene.intro.map((l, i) => (
              <Speech key={i} line={l} />
            ))}
          </div>
          <div className="stack">
            {scene.tones.map((tone) => (
              <CardPick
                key={tone.id}
                item={{ id: tone.id, name: t(tone.label, scope), text: t(tone.text, scope) }}
                on={st.tone === tone.id}
                onPick={() => setTone(tone.id)}
              />
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
