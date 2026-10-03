import { useCaseTerms } from './terms';
import * as closing from '../engine/episode/closing';
import type { ClosingScene } from '../engine/episode/schema';
import {
  closingArgs,
  closingState,
  deskSceneOf,
  endingOf,
  promisesOf,
  exposedArgs,
  juryAfterTrial,
  theorySceneOf,
  useEpisode,
} from '../engine/game';
import { ledger, type LedgerItem } from '../engine/ledger';
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
  const money = useMoney();

  // 帳上每一筆用玩家做過的事命名（UX 規格 decision-cost §四），不用系統名。
  const short = (id: string) =>
    t(args.find((a) => a.id === id)?.name ?? id, scope).split(/：|: /)[0];
  const reason = (it: LedgerItem): string => {
    switch (it.kind) {
      case 'theory': {
        const name = theorySceneOf(progress)?.theories.find((x) => x.id === it.refs[0])?.name;
        return t('案件理論「{name}」讓陪審團一開始就偏向對方', {
          name: name ? t(name, scope) : '',
        });
      }
      case 'broken':
        return t('開場許下的 {n} 個承諾沒兌現', { n: it.refs.length });
      case 'empty':
        return t('結辯有空格，對方的說法沒人反駁');
      case 'noTheory':
        return t('沒有案件理論，論點說服力打了折');
      case 'tone': {
        const tone = scene.tones.find((x) => x.id === it.refs[0]);
        return t('結辯基調「{tone}」不合這群陪審員', {
          tone: tone ? t(tone.label, scope) : '',
        });
      }
      case 'exposed':
        return t('結辯用了對方早有準備的論點：{list}', {
          list: it.refs.map((id) => `◆${short(id)}`).join(t('、')),
        });
      case 'unimpeached':
        return t('{who}的證詞沒有被彈劾', { who: t(it.who ?? '', scope) });
      case 'concealed':
        return t('開示時硬藏的 {n} 份資料被揭穿', { n: it.refs.length });
      case 'punitive':
        return t('懲罰性賠償成立，另加 {money}', { money: money(it.money ?? 0) });
    }
  };
  const tips: Record<LedgerItem['kind'], string> = {
    theory: t('起點偏的理論，要靠更多彈劾把陪審員拉回來。'),
    broken: t('先把論點確認起來，再在開場許承諾。'),
    empty: t('調查時多確認幾個論點，結辯才填得滿。'),
    noTheory: t('開庭前選一個案件理論，論點才有方向。'),
    tone: t('結辯基調要對著陪審員的取向挑。'),
    exposed: t('談判時攤過的牌對方會備好說法，結辯換別的論點。'),
    unimpeached: t('先鎖定證詞，再出示論點，彈劾才會成立。'),
    concealed: t('開示時硬藏的東西被揭穿，比交出去更傷。'),
    punitive: t('懲罰性賠償看的是被告隱瞞了什麼，開示和證據要先處理。'),
  };

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
            items={ledger(progress)}
            says={reason}
            tips={tips}
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
            {t(scene.act, scope)}
            {t('・')}
            {t(scene.place, scope)}
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
              {/* 理論撐在哪幾個論點上：結辯挑別的論點，等於自己打自己的理論。 */}
              <p className="small theory-needs">
                <span className="carry-key">{t('理論靠的論點')}</span>
                {th.needs.map((n) => {
                  const have = args.some((a) => a.id === n);
                  const name = deskSceneOf(progress)?.questions.find((q) => q.argument.id === n)
                    ?.argument.name;
                  return (
                    <span key={n} className={have ? 'need ok' : 'need miss'}>
                      <span className="diamond" aria-hidden>
                        ◆
                      </span>
                      {t(name ?? n, scope).split(/：|: /)[0]} {have ? '✓' : '✗'}
                    </span>
                  );
                })}
              </p>
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
  const scope = useScope();
  const money = useMoney();
  const p = award.punitive;
  return (
    <section className="verdict-form" aria-labelledby="verdict-form-title">
      <h2 id="verdict-form-title">{t('特別判決表')}</h2>
      <dl className="stats">
        <dt>{t('損害總額')}</dt>
        <dd>{money(award.total)}</dd>
        <dt>{t('死者過失比例')}</dt>
        <dd>
          {award.fault}%{award.why && <small>{t(award.why, scope)}</small>}
        </dd>
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
  items,
  says,
  tips,
}: {
  rules: { jurors: { id: string; label: string }[]; threshold: number; quorum?: number };
  trial?: Record<string, number>;
  spoken: Record<string, number> | null;
  final: Record<string, number>;
  items: LedgerItem[];
  says: (it: LedgerItem) => string;
  tips: Record<LedgerItem['kind'], string>;
}) {
  const t = useT();
  const scope = useScope();
  const n = rules.jurors.length;
  const need = Math.min(n, Math.max(1, rules.quorum ?? n));
  const ours = (j: Record<string, number>) =>
    rules.jurors.filter((x) => (j[x.id] ?? 0) < rules.threshold).length;
  const now = ours(final);
  const won = now >= need;
  // 懲罰性賠償是金額，不跟分數排序；最重的三筆只從有分量的項目挑。
  const ranked = items.filter((x) => x.kind !== 'punitive');
  const extra = items.filter((x) => x.kind === 'punitive');
  const top = ranked.slice(0, 3);
  const where = (it: LedgerItem) => t('（{where}）', { where: t(it.where) });
  const steps = [
    trial && { label: t('庭審結束'), n: ours(trial) },
    spoken && { label: t('結辯後'), n: ours(spoken) },
    { label: t('評議後'), n: now },
  ].filter((x): x is { label: string; n: number } => !!x);
  return (
    <section className="jury-ledger panel" aria-labelledby="jury-ledger-title">
      <h2 id="jury-ledger-title">{won ? t('為什麼贏') : t('這一案的帳')}</h2>
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
      {!won && top.length > 0 && (
        <div className="ledger-row">
          <span className="ledger-key">{t('主因')}</span>
          <div>
            <ol className="ledger-reasons">
              {top.map((it, i) => (
                <li key={i}>
                  {says(it)}
                  <span className="muted">{where(it)}</span>
                </li>
              ))}
              {extra.map((it, i) => (
                <li key={`p${i}`} className="money">
                  {says(it)}
                  <span className="muted">{where(it)}</span>
                </li>
              ))}
            </ol>
            <p className="ledger-tip">
              <span className="ledger-key">{t('下次可以試')}</span> {tips[top[0].kind]}
            </p>
          </div>
        </div>
      )}
      {ranked.length > (won ? 0 : 3) && (
        <details className="ledger-all">
          <summary>{t('完整帳目')}</summary>
          <ol>
            {items.map((it, i) => (
              <li key={i}>
                {says(it)}
                <span className="muted">{where(it)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
