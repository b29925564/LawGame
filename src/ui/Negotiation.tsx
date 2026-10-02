import { useCaseTerms } from './terms';
import { useState } from 'react';
import * as nego from '../engine/episode/negotiation';
import type { NegotiationScene } from '../engine/episode/schema';
import { closingArgs, negoState, trialRisk, useEpisode } from '../engine/game';
import { useMoney, useT } from '../i18n';
import { CardPick, EvidenceDrawer } from './Evidence';
import { useScope } from './lang';
import { Speech } from './Portrait';
import { Shell, Tabs, Transcript } from './Shell';

/** 認罪協商（企劃書 6.8）：攤牌會洩底，虛張聲勢看證據清單，決定權在委託人手上。 */
export function Negotiation({ scene }: { scene: NegotiationScene }) {
  const { progress, revealArg, bluff, advise, walkOut, advance, callClient } = useEpisode();
  const st = negoState(progress, scene);
  const terms = useCaseTerms();
  const t = useT();
  const scope = useScope();
  const [intro, setIntro] = useState(st.log.length <= scene.intro.length);
  const [tab, setTab] = useState<'offer' | 'reveal' | 'bluff'>('offer');
  const args = closingArgs(progress);
  const offer = nego.offerOf(scene, st);
  const ok = nego.authorized(scene, st, offer);
  const money = useMoney();
  const risk = trialRisk(progress);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t('{a}・{b}', { a: t(scene.act, scope), b: t(scene.place, scope) })}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          {t('坐下')}
        </button>
      </main>
    );

  if (nego.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">{st.outcome === 'deal' ? t(terms.deal) : t('談判結束')}</p>
        <div className="lines">
          {st.log.slice(-4).map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <dl className="stats">
          <dt>{t('{name}的信心', { name: t(scene.opponent.name, scope) })}</dt>
          <dd>{st.confidence}</dd>
          <dt>{t('最後的條件')}</dt>
          <dd>{t(st.deal ?? offer.label, scope)}</dd>
          <dt>{t('{name}的信任', { name: t(scene.client.name, scope) })}</dt>
          <dd>{st.trust} / 5</dd>
        </dl>
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
            {t('{a}・{b}', { a: t(scene.opponent.name, scope), b: t(scene.opponent.role, scope) })}
          </p>
          <p className="patience" aria-label={`${t('剩餘回合')} ${st.rounds}`}>
            {t('剩餘回合')} <strong>{st.rounds}</strong>
          </p>
        </header>
      }
      tabs={
        <>
          <Transcript count={st.log.length}>
            {st.log.map((l, i) => (
              <Speech key={i} line={l} />
            ))}
          </Transcript>
          <Tabs
            label={t('談判')}
            value={tab}
            onPick={setTab}
            items={[
              { id: 'offer', label: t('她開的條件') },
              { id: 'reveal', label: t('攤牌') },
              { id: 'bluff', label: t('虛張聲勢') },
            ]}
          />
        </>
      }
      foot={
        <>
          <EvidenceDrawer />
          <button className="wide" onClick={walkOut}>
            {t('離席')}
          </button>
        </>
      }
    >
      {tab === 'offer' && (
        <section className="panel">
          <h2>{t('她現在開的條件')}</h2>
          <p className="claim-text">{t(offer.label, scope)}</p>
          {scene.authority && (
            <dl className="stats authority">
              {offer.amount !== undefined && (
                <>
                  <dt>{t('條件')}</dt>
                  <dd>{money(offer.amount)}</dd>
                </>
              )}
              <dt>{t('授權上限')}</dt>
              <dd className={ok ? undefined : 'over'}>{money(st.cap ?? scene.authority.cap)}</dd>
              {offer.terms && (
                <>
                  <dt>{t('附帶條款')}</dt>
                  <dd className={st.termsOk ? undefined : 'over'}>
                    {st.termsOk ? t('已同意') : t('未同意')}
                  </dd>
                </>
              )}
              {/* 和解金額旁邊直接放開庭的風險，兩個數字放在一起比。 */}
              {risk && (
                <>
                  <dt className="risk">{t('開庭若判有責')}</dt>
                  <dd className="risk">
                    {t('約 {low} 到 {high}', { low: money(risk.low), high: money(risk.high) })}
                    {risk.punitive && <small>{t('懲罰性賠償另計')}</small>}
                  </dd>
                </>
              )}
            </dl>
          )}
          {offer.lines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
          <div className="stack">
            <button className="wide" onClick={() => advise(true)}>
              {t(ok ? '建議{name}接受' : '建議{name}接受（超過授權）', {
                name: t(scene.client.name, scope),
              })}
            </button>
            {!ok && (
              <button className="wide primary" disabled={!nego.canAct(st)} onClick={callClient}>
                {t('打電話請示 {name}', { name: t(scene.client.name, scope) })}
                <span className="cost">{t('−1 回合')}</span>
              </button>
            )}
            <button className="wide" onClick={() => advise(false)}>
              {t('建議撐下去')}
            </button>
          </div>
        </section>
      )}

      {tab === 'reveal' && (
        <section className="panel">
          <h2>{t('攤牌')}</h2>
          <div className="stack">
            {args.map((a) => (
              <CardPick
                key={a.id}
                item={a}
                verb={t('亮出')}
                disabled={st.played.includes(a.id) || !nego.canAct(st)}
                tag={st.played.includes(a.id) ? t('（已亮出）') : undefined}
                onPick={() => revealArg(a.id, a.strength, a.name)}
              />
            ))}
            {args.length === 0 && <span className="muted">{t('手上沒有確認過的論點。')}</span>}
          </div>
        </section>
      )}

      {tab === 'bluff' && (
        <section className="panel">
          <h2>{t('虛張聲勢')}</h2>
          <div className="stack">
            {scene.bluffs.map((b) => (
              <button
                key={b.id}
                className="wide"
                disabled={st.bluffed.includes(b.id) || !nego.canAct(st)}
                onClick={() => bluff(b.id)}
              >
                {t(b.label, scope)}
              </button>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
