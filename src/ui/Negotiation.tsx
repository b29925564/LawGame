import { useCaseTerms } from './terms';
import { useEffect, useState } from 'react';
import * as nego from '../engine/episode/negotiation';
import type { NegotiationScene } from '../engine/episode/schema';
import { closingArgs, negoState, trialRisk, useEpisode } from '../engine/game';
import { useMoney, useT } from '../i18n';
import { CommitBar } from './Commit';
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
  // 定案樣式（UX 規格 decision-cost 三）：接受與離席都是選了就不能改，先選再看帳。
  const [choice, setChoice] = useState<'take' | 'walk' | null>(null);
  const client = t(scene.client.name, scope);
  const opp = t(scene.opponent.name, scope);
  // 攤牌、虛張聲勢之前記下信心和條件，出手後才講得出「有沒有用」（體驗評測 v88：攤牌後開價沒動時毫無回饋）。
  // 打電話也記：電話換到了什麼（上限、附帶條款）要留在畫面上，手機上授權那列常在畫面外（體驗評測 v89）。
  const [last, setLast] = useState<{
    conf: number;
    offer: string;
    credit: number;
    cap: number;
    terms: boolean;
    call?: boolean;
  } | null>(null);
  const cap = st.cap ?? scene.authority?.cap ?? 0;
  const snap = (call?: boolean) =>
    setLast({
      conf: st.confidence,
      offer: offer.id,
      credit: st.credit,
      cap,
      terms: !!st.termsOk,
      call,
    });
  const ladder = [...scene.offers].sort((a, b) => b.min - a.min);
  const over = (o: (typeof ladder)[number]) => !!scene.authority && !nego.authorized(scene, st, o);
  // 條件鬆動了但仍超過授權：不能讀起來像談成了（體驗評測 v89）。
  const stillOver = ok
    ? ''
    : nego.canCall(scene, st)
      ? t('但仍超過授權，要先打電話請示{name}。', { name: client })
      : t('但仍超過授權上限。');
  // 條件依信心分檔：信心低於目前這一檔的門檻，就換下一檔（engine offerOf）。
  const better = ladder.find((o) => o.min < offer.min);
  const toNext = better ? st.confidence - offer.min + 1 : 0;
  const nextHint = better
    ? t('信心再降 {k}，條件就會鬆動。', { k: toNext })
    : t('這已經是對方開得出來最好的條件。');
  // 定案列一出現就捲進畫面，手機上才不會被底部列擋住。
  useEffect(() => {
    if (choice) document.querySelector('.commit-bar')?.scrollIntoView({ block: 'nearest' });
  }, [choice]);
  const trial = risk
    ? t('開庭：約 {low}到 {high}', { low: money(risk.low), high: money(risk.high) }) +
      (risk.punitive ? t('，懲罰性賠償另計') : '')
    : t('開庭：結果由陪審團決定');
  const takeCost =
    offer.amount !== undefined
      ? t('接受：確定賠 {amount}', { amount: money(offer.amount) })
      : t('接受：{name}認罪，{label}', { name: client, label: t(offer.label, scope) });

  // 出手後的回饋。打電話的回饋放在按鈕正上方：手機上頂端那張卡會在畫面外（體驗評測 v89）。
  const moveNote = last && (
    <p className="panel nego-move" role="status">
      {last.call ? (
        <>
          <b>
            {t('{name}同意了：授權上限 {a} → {b}', {
              name: client,
              a: money(last.cap),
              b: money(cap),
            })}
          </b>
          {!last.terms && st.termsOk && t('附帶條款也同意了。')}
          {ok ? t('這個條件現在在授權內，可以建議接受。') : t('還是不夠，條件仍超過授權。')}
        </>
      ) : st.credit > last.credit ? (
        <>
          <b>{t('被識破了。')}</b>
          {t('{name}的信心沒動；之後攤牌的效果少兩成。', { name: opp })}
        </>
      ) : (
        <>
          <b>{t('{name}的信心 {a} → {b}', { name: opp, a: last.conf, b: st.confidence })}</b>
          {offer.id !== last.offer
            ? `${t('條件鬆動了：{label}', { label: t(offer.label, scope) })}${stillOver && t('。')}${stillOver}`
            : `${t('條件沒變。')}${nextHint}`}
        </>
      )}
    </p>
  );

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
          <p className="patience conf">
            <span className="nowrap">
              {t('{name}的信心', { name: opp })} <strong>{st.confidence}</strong>
            </span>
            {/* 刻度是每一檔條件的門檻：填色退到刻度左邊，條件就換一檔。 */}
            <span className="confbar" aria-hidden>
              <i style={{ width: `${st.confidence}%` }} />
              {scene.offers
                .filter((o) => o.min > 0)
                .map((o) => (
                  <b key={o.id} style={{ left: `${o.min}%` }} />
                ))}
            </span>
            <span className="nowrap" aria-label={`${t('剩餘回合')} ${st.rounds}`}>
              {t('剩餘回合')} <strong>{st.rounds}</strong>
            </span>
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
          <button
            className="wide"
            aria-pressed={choice === 'walk'}
            onClick={() => {
              setTab('offer');
              setChoice('walk');
            }}
          >
            {t('離席')}
          </button>
        </>
      }
    >
      {last && !last.call && moveNote}
      {tab === 'offer' && (
        <section className="panel">
          <h2>{t('她現在開的條件')}</h2>
          <p className="claim-text">{t(offer.label, scope)}</p>
          {nego.canAct(st) && <p className="muted small nego-next">{nextHint}</p>}
          {/* 條件階梯：每一檔的門檻和價放在一起，信心 100 時也看得出還差多少（體驗評測 v89）。 */}
          <ol className="nego-ladder" aria-label={t('條件階梯')}>
            {ladder.map((o, i) => (
              <li key={o.id} className={o.id === offer.id ? 'on' : undefined}>
                <span className="th">
                  {o.min > 0
                    ? t('信心 {n} 以上', { n: o.min })
                    : t('信心低於 {n}', { n: ladder[i - 1]?.min ?? 0 })}
                </span>
                <span className="v">
                  {o.amount !== undefined ? money(o.amount) : t(o.label, scope)}
                </span>
                <span className="tg">
                  {o.id === offer.id ? t('現在') : over(o) ? t('超過授權') : ''}
                </span>
              </li>
            ))}
          </ol>
          {scene.authority && (
            <dl className="stats authority">
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
                    {t('約 {low}到 {high}', { low: money(risk.low), high: money(risk.high) })}
                    {risk.punitive && <small>{t('懲罰性賠償另計')}</small>}
                  </dd>
                </>
              )}
            </dl>
          )}
          {offer.lines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
          {last?.call && moveNote}
          <div className="stack">
            <button
              className="wide"
              aria-pressed={ok ? choice === 'take' : undefined}
              onClick={() => (ok ? setChoice('take') : advise(true))}
            >
              {t(ok ? '建議{name}接受' : '建議{name}接受（超過授權）', { name: client })}
            </button>
            {!ok && nego.canCall(scene, st) && (
              <button
                className="wide primary"
                onClick={() => {
                  snap(true);
                  callClient();
                }}
              >
                {t('打電話請示 {name}', { name: t(scene.client.name, scope) })}
                <span className="cost">{t('−1 回合')}</span>
              </button>
            )}
            <button
              className="wide"
              onClick={() => {
                // 回合用完還撐，引擎會直接離席上法庭：先走離席的定案列，讓玩家看到後果（體驗評測 v89）。
                if (st.rounds <= 0) return setChoice('walk');
                setChoice(null);
                setLast(null);
                advise(false);
              }}
            >
              {st.rounds <= 0 ? t('建議撐下去（回合用完，等於離席上法庭）') : t('建議撐下去')}
            </button>
          </div>
          {choice === 'take' && ok && (
            <CommitBar
              what={t('建議{name}接受', { name: client })}
              cost={`${takeCost}${t('。')}${trial}`}
              action={t('建議{name}接受', { name: client })}
              onCommit={() => advise(true)}
            />
          )}
          {choice === 'walk' && (
            <CommitBar
              what={t('離席')}
              cost={`${t('不談了，這個條件作廢。')}${trial}`}
              action={t('離席，上法庭')}
              onCommit={walkOut}
            />
          )}
        </section>
      )}

      {tab === 'reveal' && (
        <section className="panel">
          <h2>{t('攤牌')}</h2>
          {st.credit > 0 && (
            <p className="muted small">
              {t('被識破過 {n} 次：攤牌的效果只剩 {p}%。', {
                n: st.credit,
                p: Math.round(Math.max(0.2, 1 - 0.2 * st.credit) * 100),
              })}
            </p>
          )}
          <div className="stack">
            {args.map((a) => (
              <CardPick
                key={a.id}
                item={a}
                verb={t('亮出')}
                disabled={st.played.includes(a.id) || !nego.canAct(st)}
                tag={st.played.includes(a.id) ? t('（已亮出）') : undefined}
                onPick={() => {
                  snap();
                  revealArg(a.id, a.strength, a.name);
                }}
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
                onClick={() => {
                  snap();
                  bluff(b.id);
                }}
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
