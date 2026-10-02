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
import { useMoney, useT } from '../i18n';
import { CardPick, EvidenceDrawer } from './Evidence';
import { useScope } from './lang';
import { JuryStart } from './JuryStart';
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
  const th = promisesOf(progress).theory;
  const cost = th?.jury?.note;
  const rules = juryAfterTrial(progress)?.rules;

  if (st.verdict)
    return (
      <main className="scene">
        <p className="eyebrow">{t('判決')}</p>
        <h1>{t(st.verdict)}</h1>
        {rules && (
          <JuryLedger
            rules={rules}
            trial={juryAfterTrial(progress)?.jury}
            spoken={st.spoken}
            final={st.jury}
          />
        )}
        {st.award && <VerdictForm award={st.award} />}
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
                other: t(terms.other, scope),
              })}
            </p>
          )}
          {!promisesOf(progress).theory && (
            <p className="bad-text small">{t('沒有案件理論，論點說服力打七折。')}</p>
          )}
          {/* 你帶進評議室的東西：理論的代價是選擇，不是失誤，用中性色（UX 規格 decision-cost §二）。 */}
          {th && (
            <div className="carry">
              <span className="carry-key">{t('你帶進評議室的')}</span>
              <strong>{t(th.name, scope)}</strong>
              <JuryStart jury={th.jury} civil={rules?.burden === 'civil'} />
              {cost && <p className="small">{t(cost, scope)}</p>}
            </div>
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
                  <span className="num">{i + 1}.</span>{' '}
                  {t(args.find((a) => a.id === id)?.name ?? '', scope)}
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

/** 民事特別判決表：損害總額、死者過失比例、判賠金額、懲罰性賠償，成立時加總。 */
function VerdictForm({ award }: { award: closing.Award }) {
  const t = useT();
  const money = useMoney();
  const p = award.punitive;
  return (
    <section className="verdict-form" aria-labelledby="verdict-form-title">
      <h2 id="verdict-form-title">{t('特別判決表')}</h2>
      <dl className="stats">
        <dt>{t('損害總額')}</dt>
        <dd>{money(award.total)}</dd>
        <dt>{t('死者過失比例')}</dt>
        <dd>{award.fault}%</dd>
        <dt>{t('判賠金額')}</dt>
        <dd>
          {money(award.amount)}
          <small>{t('損害總額扣掉死者過失的部分')}</small>
        </dd>
        {p && (
          <>
            <dt>{t('懲罰性賠償')}</dt>
            <dd className={p.found ? undefined : 'muted'}>
              {p.found
                ? money(p.amount)
                : t('不成立（{votes} 票，需要 {need} 票）', { votes: p.votes, need: p.need })}
            </dd>
          </>
        )}
        <dt className="sum">{t('被告應付')}</dt>
        <dd className="sum">
          <strong>{money(award.amount + (p?.found ? p.amount : 0))}</strong>
        </dd>
      </dl>
    </section>
  );
}

/**
 * 判決的帳（UX 規格 decision-cost §四 P0）：票數與走勢。
 * 玩家永遠是辯方：心證沒過門檻的陪審員才是「站你這邊」。
 */
function JuryLedger({
  rules,
  trial,
  spoken,
  final,
}: {
  rules: { jurors: { id: string; label: string }[]; threshold: number; quorum?: number };
  trial?: Record<string, number>;
  spoken: Record<string, number> | null;
  final: Record<string, number>;
}) {
  const t = useT();
  const scope = useScope();
  const n = rules.jurors.length;
  const need = Math.min(n, Math.max(1, rules.quorum ?? n));
  const ours = (j: Record<string, number>) =>
    rules.jurors.filter((x) => (j[x.id] ?? 0) < rules.threshold).length;
  const now = ours(final);
  const steps = [
    trial && { label: t('庭審結束'), n: ours(trial) },
    spoken && { label: t('結辯後'), n: ours(spoken) },
    { label: t('評議後'), n: now },
  ].filter((x): x is { label: string; n: number } => !!x);
  return (
    <section className="jury-ledger panel" aria-labelledby="jury-ledger-title">
      <h2 id="jury-ledger-title">{t('這一案的帳')}</h2>
      <div className="ledger-row">
        <span className="ledger-key">{t('票數')}</span>
        <div>
          <ul className="ledger-dots" aria-hidden>
            {rules.jurors.map((x) => (
              <li
                key={x.id}
                className={(final[x.id] ?? 0) < rules.threshold ? 'on' : undefined}
                title={t(x.label, scope)}
              />
            ))}
          </ul>
          <p>
            {t('站你這邊 {a} 位，需要 {b} 位', { a: now, b: need })}
            {now < need && <strong> {t('差 {k} 位', { k: need - now })}</strong>}
          </p>
        </div>
      </div>
      {steps.length > 1 && (
        <div className="ledger-row">
          <span className="ledger-key">{t('走勢')}</span>
          <ol className="ledger-trend">
            {steps.map((x, i) => (
              <li key={i}>{t('{label} {n} 位', { label: x.label, n: x.n })}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
