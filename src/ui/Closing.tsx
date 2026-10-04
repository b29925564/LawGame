import { useCaseTerms } from './terms';
import * as closing from '../engine/episode/closing';
import type { ClosingScene, Line } from '../engine/episode/schema';
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
import { IdPhoto } from './IdPhoto';
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
      case 'effect':
        return t('審前的選擇讓陪審團一開始就偏向對方');
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
    effect: t('交出去的東西對方會用，開場前先想好怎麼解釋。'),
    punitive: t('懲罰性賠償看的是被告隱瞞了什麼，開示和證據要先處理。'),
  };

  if (st.verdict)
    return (
      <Verdict
        scene={scene}
        st={st}
        rules={rules}
        trial={juryAfterTrial(progress)?.jury}
        items={ledger(progress)}
        ending={endingOf(progress, scene)}
        says={reason}
        tips={tips}
        onNext={advance}
      />
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
              {/* 手機上這句收進「這代表什麼」，不然這張卡會佔掉半個螢幕（體驗評測）。 */}
              {cost && <p className="small carry-cost">{t(cost, scope)}</p>}
              {cost && (
                <details className="carry-why small">
                  <summary>{t('這代表什麼')}</summary>
                  {t(cost, scope)}
                </details>
              )}
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
          <div className="stack closing-args">
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

type Rules = NonNullable<ReturnType<typeof juryAfterTrial>>['rules'];

/** 「845 萬」→ 845 和 萬；「$8.45 million」→ $8.45 和 million。 */
const splitMoney = (m: string) => {
  const [n, ...unit] = m.split(' ');
  return { n, unit: unit.join(' ') };
};
/** 「茱蒂絲・柯恩」→「柯恩」；英文取最後一個字。 */
const surname = (name: string) =>
  name
    .split(/[・·\s]+/)
    .filter(Boolean)
    .pop() ?? name;

/** 票格：站在你這邊的票實心（--good），另一邊空心。看的是對你有沒有利，不看有責或無罪。 */
function Pips({ ours }: { ours: boolean[] }) {
  return (
    <span className="vpips" aria-hidden>
      {ours.map((y, i) => (
        <i key={i} className={y ? 'y' : undefined} />
      ))}
    </span>
  );
}

/**
 * 判決（視覺規格 §18 圖版 11）：上面一句結論與金額，左邊陪審長簽名的特別判決表，
 * 右邊風向、三輪評議、陪審長宣讀與後續。帳的主因放在結論底下（UX 規格 decision-cost §四）。
 * 玩家兩集都是辯方：心證沒過門檻的陪審員才是「站你這邊」。
 */
function Verdict({
  scene,
  st,
  rules,
  trial,
  items,
  ending,
  says,
  tips,
  onNext,
}: {
  scene: ClosingScene;
  st: closing.ClosingState;
  rules?: Rules;
  trial?: Record<string, number>;
  items: LedgerItem[];
  ending: Line[];
  says: (it: LedgerItem) => string;
  tips: Record<LedgerItem['kind'], string>;
  onNext: () => void;
}) {
  const t = useT();
  const scope = useScope();
  const money = useMoney();
  const v = st.verdict!;
  const award = st.award;
  const p = award?.punitive;
  const jurors = rules?.jurors ?? [];
  const n = jurors.length;
  const need = Math.min(n, Math.max(1, rules?.quorum ?? n));
  const ours = (j: Record<string, number>) =>
    jurors.map((x) => (j[x.id] ?? 0) < (rules?.threshold ?? 50));
  const count = (j: Record<string, number>) => ours(j).filter(Boolean).length;
  const now = count(st.jury);
  const won = now >= need;
  const ranked = items.filter((x) => x.kind !== 'punitive');
  const top = ranked.slice(0, 3);
  const where = (it: LedgerItem) => t('（{where}）', { where: t(it.where) });

  const fore = jurors.find((j) => j.foreperson);
  const foreParts = fore ? t(fore.label, scope).split(/\s*[・·]\s*/) : [];
  const foreName = surname(
    foreParts.length > 1 ? foreParts[foreParts.length - 2] : (foreParts[0] ?? ''),
  );

  const headline =
    v === '陪審團僵局'
      ? t('陪審團無法達成判決。')
      : p?.found
        ? t('陪審團認定被告有責，懲罰性賠償成立。')
        : t('陪審團認定被告{v}。', { v: t(v).toLowerCase() });
  const owed = award ? award.amount + (p?.found ? p.amount : 0) : null;
  const disposition: Record<string, string> = {
    無罪: t('當庭釋放'),
    有罪: t('還押，擇期量刑'),
    無責: t('被告不必賠償'),
    有責: t('被告應負賠償責任'),
    陪審團僵局: t('審判無效，另定期日'),
  };
  const over = n - now;
  const votes = t('{a} 票 : {b} 票', { a: Math.max(now, over), b: Math.min(now, over) });

  // 第一句「陪審長站起來。「……」」拆成宣讀卡；其餘照順序當後續（訊息、旁白）。
  const [first, ...rest] = ending;
  const firstText = first && !first.mark && first.who === '旁白' ? t(first.text, scope) : '';
  const q = firstText.search(/[「"“]/);
  const readOut =
    first?.text.startsWith('陪審長站起來') && q > 0
      ? { who: firstText.slice(0, q).replace(/[。.\s]+$/, ''), quote: firstText.slice(q) }
      : null;
  const after = readOut ? rest : ending;

  // 贏的時候帳是空的（帳只記傷害），主要原因改看風向：是在哪一段過門檻的（§18 結論帶一定寫原因）。
  // 「站你這邊 N 位，需要 N 位」只留在風向卡，不在結論帶重複（體驗評測 v88）。
  const atTrial = trial ? count(trial) : 0;
  const atClose = st.spoken ? count(st.spoken) : atTrial;
  const wonWhy = !won
    ? ''
    : trial && atTrial >= need
      ? t('庭審結束時，已經有 {a} 位陪審員站你這邊。', { a: atTrial })
      : st.spoken && atClose >= need
        ? t('結辯把站你這邊的陪審員從 {a} 位拉到 {b} 位。', { a: atTrial, b: atClose })
        : t('評議時又說服了 {k} 位陪審員。', { k: now - atClose });

  const civil = !!award || rules?.burden === 'civil';
  const formTitle = civil ? '特別判決表' : '判決書';
  const formEn = civil ? 'SPECIAL VERDICT FORM' : 'VERDICT FORM';

  const steps = [
    trial && { label: t('庭審結束'), j: trial },
    st.spoken && { label: t('結辯後'), j: st.spoken },
    { label: t('評議後'), j: st.jury },
  ].filter((x): x is { label: string; j: Record<string, number> } => !!x);

  return (
    <main className="vdict">
      <header className="hero">
        <div>
          <p className="ey">
            {t('判決')}
            {t('・')}
            {t(scene.act, scope)}
            {t('・')}
            {t('陪審團評議後')}
          </p>
          <h1>{headline}</h1>
          {(won ? wonWhy : top[0] && says(top[0])) && (
            <p className="why">
              <b>{t('主要原因：')}</b>
              {won ? wonWhy : says(top[0])}
            </p>
          )}
        </div>
        {owed !== null ? (
          <div className="amt">
            <small>{t('被告應付')}</small>
            <b>
              {splitMoney(money(owed)).n}
              <i>{splitMoney(money(owed)).unit}</i>
            </b>
          </div>
        ) : (
          <p className="amt disp">{disposition[v]}</p>
        )}
      </header>

      <div className="vcols">
        <div className="lcol">
          <section className={award ? 'vform' : 'vform short'} aria-labelledby="verdict-form-title">
            <div className="fh">
              <p className="c">{t('卡爾德郡高等法院')}</p>
              <h2 id="verdict-form-title">{t(formTitle)}</h2>
              {/* 英文介面的抬頭本身就是英文，不再重印一行。 */}
              {formEn !== t(formTitle).toUpperCase() && <p className="en">{formEn}</p>}
            </div>
            {rules?.burden === 'civil' ? (
              <>
                <div className="fq">
                  <span className="qn">1.</span>
                  <span className="ql">{t('被告是否有過失？')}</span>
                  <span className="qv">
                    {v === '有責' ? t('是') : v === '無責' ? t('否') : '—'}
                  </span>
                </div>
                {award && (
                  <>
                    <div className="fq">
                      <span className="qn">2.</span>
                      <span className="ql">{t('損害總額')}</span>
                      <Money v={money(award.total)} />
                    </div>
                    <div className="fq">
                      <span className="qn">3.</span>
                      <span className="ql">
                        {t('死者過失比例')}
                        {award.base !== undefined && award.base !== award.fault && (
                          <small>
                            {t('理論 {base}%，票數浮動 {d}', {
                              base: award.base,
                              d: `${award.fault > award.base ? '+' : '−'}${Math.abs(award.fault - award.base)}`,
                            })}
                          </small>
                        )}
                        {award.why && <small>{t(award.why, scope)}</small>}
                      </span>
                      <span className="qv">
                        {award.fault}
                        <i>%</i>
                      </span>
                    </div>
                    <div className="fq">
                      <span className="qn">4.</span>
                      <span className="ql">
                        {t('判賠金額')}
                        <small>{t('損害總額扣掉死者過失的部分')}</small>
                      </span>
                      <Money v={money(award.amount)} />
                    </div>
                    {p && (
                      <div className="fq">
                        <span className="qn">5.</span>
                        <span className="ql">
                          {t('懲罰性賠償')}
                          {!p.found && (
                            <small>
                              {t('不成立（{votes} 票，需要 {need} 票）', {
                                votes: p.votes,
                                need: p.need,
                              })}
                            </small>
                          )}
                        </span>
                        {p.found ? (
                          <Money v={money(p.amount)} />
                        ) : (
                          <span className="qv">{t('否')}</span>
                        )}
                      </div>
                    )}
                    <div className="fq total">
                      <span className="qn" />
                      <span className="ql">{t('被告應付')}</span>
                      <Money v={money(owed ?? 0)} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="fq total">
                <span className="qn">1.</span>
                <span className="ql">{t('就第一項罪名，被告')}</span>
                <span className="qv">{v === '陪審團僵局' ? t('未達一致') : t(v)}</span>
              </div>
            )}
            <div className="signs">
              <span>
                {t('陪審長')}
                <b>{foreName}</b>
              </span>
              {n > 0 && <span>{votes}</span>}
            </div>
          </section>
          {!won && top[0] && (
            <p className="ledger-tip">
              <span className="ledger-key">{t('下次可以試')}</span> {tips[top[0].kind]}
            </p>
          )}
          {items.length > 0 && (
            <details className="fold ledger">
              <summary>
                {t('完整帳目')} <span className="faint">{t('每一筆怎麼算出來的')}</span>
              </summary>
              <ol className="ledger-reasons">
                {items.map((it, i) => (
                  <li key={i} className={it.kind === 'punitive' ? 'money' : undefined}>
                    {says(it)}
                    <span className="muted">{where(it)}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>

        <div className="delib">
          {n > 0 && (
            <section className="panel trend" aria-label={t('風向')}>
              <span className="k">{t('風向')}</span>
              <ol className="trend-steps">
                {steps.map((x, i) => (
                  <li key={i}>
                    {i > 0 && (
                      <span className="arrow" aria-hidden>
                        →
                      </span>
                    )}
                    <span className="sr-only">
                      {t('{label} {n} 位', { label: x.label, n: count(x.j) })}
                    </span>
                    <span aria-hidden>{x.label}</span>
                    <Pips ours={ours(x.j)} />
                  </li>
                ))}
              </ol>
              <p className="trend-need">
                {t('站你這邊 {a} 位，需要 {b} 位', { a: now, b: need })}
                {now < need && <strong> {t('差 {k} 位', { k: need - now })}</strong>}
              </p>
            </section>
          )}
          {st.rounds.length > 0 && (
            <ol className="panel rounds" aria-label={t('評議')}>
              {st.rounds.map((r, i) => {
                const y = count(r.jury);
                return (
                  <li key={i} className="rnd">
                    <span className="rk">{t('第 {n} 輪', { n: i + 1 })}</span>
                    <span>
                      <Pips ours={ours(r.jury)} />
                      {/* 簽名列照判決表寫「多數 : 少數」；這裡跟簽名列同一個順序（體驗評測 v88）。 */}
                      <span className="vt" aria-label={t('站你這邊 {a} 位', { a: y })}>
                        {Math.max(y, n - y)} : {Math.min(y, n - y)}
                      </span>
                    </span>
                    <p>
                      {r.moves
                        .filter((m) => !m.startsWith('表決'))
                        .map((m) => t(m, scope))
                        .join(' ')}
                      {/* 比數已經寫在票格旁，「表決：…」只留給螢幕報讀（視覺設計師）。 */}
                      {r.moves
                        .filter((m) => m.startsWith('表決'))
                        .map((m, k) => (
                          <span key={k} className="sr-only">
                            {' '}
                            {t(m, scope)}
                          </span>
                        ))}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {readOut && (
            <section className="panel fore">
              {fore ? (
                <IdPhoto
                  who={fore.label.split('・').slice(0, -1).join('・') || fore.label}
                  size={40}
                />
              ) : (
                <span />
              )}
              <div>
                <p className="who">{readOut.who}</p>
                <blockquote>
                  {/* 最後兩個字和標點綁在一起，「無罪。」」不會被拆成兩行（體驗評測 v88）。 */}
                  {readOut.quote.slice(0, -4)}
                  <span className="nw">{readOut.quote.slice(-4)}</span>
                </blockquote>
              </div>
            </section>
          )}
          <div className="epi">
            {after.map((l, i) => {
              if (l.mark?.kind === 'tally')
                return (
                  rules && (
                    <Tally
                      key={i}
                      round={st.rounds.length}
                      burden={rules.burden}
                      guilty={rules.jurors.map((j) => st.jury[j.id] >= rules.threshold)}
                    />
                  )
                );
              if (l.mark || l.voice === 'off' || l.thought) return <Speech key={i} line={l} />;
              const text = t(l.text, scope);
              if (l.who === '旁白') return <p key={i}>{text}</p>;
              // 「（訊息）漂亮。」→ 寄件人一行寫「亞瑟・卡爾德・訊息」，內文只留話。
              const via = text.match(/^[（(]([^）)]{1,12})[）)]\s*/);
              return (
                <div key={i} className="msg">
                  <IdPhoto who={l.who} size={28} />
                  <div>
                    <small>
                      {t(l.who)}
                      {via && t('・') + via[1]}
                    </small>
                    {via ? text.slice(via[0].length) : text}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="primary go" onClick={onNext}>
            {t('繼續')}
          </button>
        </div>
      </div>
    </main>
  );
}

function Money({ v }: { v: string }) {
  const { n, unit } = splitMoney(v);
  return (
    <span className="qv">
      {n}
      {unit && <i>{unit}</i>}
    </span>
  );
}
