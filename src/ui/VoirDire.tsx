import { useEffect, useState } from 'react';
import type { VoirDireScene } from '../engine/episode/schema';
import * as vd from '../engine/episode/voirdire';
import { useEpisode, voirDireState } from '../engine/game';
import { useT } from '../i18n';
import { CommitBar } from './Commit';
import { CardSheet } from './Desk';
import { IdPhoto } from './IdPhoto';
import { useScope } from './lang';
import { Speech } from './Portrait';
import { Shell, Tabs } from './Shell';

type Filter = 'all' | 'seated' | 'unasked';

/** 1100 寬以上名單與陪審席並排（視覺規格 §18）；以下疊成一欄、人物卡開底部抽屜。 */
const WIDE_VD = '(min-width: 1100px)';
function useMedia(q: string) {
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

/**
 * 陪審團遴選（企劃書 6.9.1）：18 取 12，六次提問、三次無因迴避。
 *
 * 21 位候選人全部展開會是一頁捲不完的表格，而「就用這 12 位」
 * 又躺在最底下。這裡收成一行一位，點開才看名單細節，
 * 額度釘在上面、決定按鈕釘在下面。
 */
export function VoirDire({ scene }: { scene: VoirDireScene }) {
  const { progress, askJuror, challengeJuror, strikeJuror, seatJury, advance } = useEpisode();
  const st = voirDireState(progress, scene);
  const t = useT();
  const scope = useScope();
  const [intro, setIntro] = useState(st.asked.length === 0 && st.struck.length === 0);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  // 無因迴避用定案樣式：點了先看帳，按定案鈕才刪人。
  const [striking, setStriking] = useState<string | null>(null);
  const wide = useMedia(WIDE_VD);
  // 定案列一出現就捲進畫面，手機上才不會被底部列擋住。
  useEffect(() => {
    if (striking) document.querySelector('.prof .commit-bar')?.scrollIntoView({ block: 'nearest' });
  }, [striking]);

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
          {t('開始遴選')}
        </button>
      </main>
    );

  if (vd.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">{t('陪審團已選定')}</p>
        <ul className="stack">
          {vd.panel(scene, st).map((j) => (
            <li key={j.id} className="panel">
              <strong>{t(j.label, scope)}</strong>
              {j.foreperson && <span className="muted"> {t('・陪審長')}</span>}
            </li>
          ))}
        </ul>
        {(st.theirCause ?? []).length > 0 && (
          <p className="muted">
            {t('對方以有因迴避剔除：{names}', {
              names: (st.theirCause ?? [])
                .map((id) => scene.candidates.find((c) => c.id === id)!)
                .map((c) =>
                  t('{name}（{why}）', {
                    name: t(c.name, scope),
                    why: t(c.hidden ?? c.sheet, scope),
                  }),
                )
                .join(t('、')),
            })}
          </p>
        )}
        {st.wrong > 0 && (
          <p className="muted">
            {t('沒有根據的聲請有 {n} 次。開庭第一天的法官耐心會少 {n} 點。', { n: st.wrong })}
          </p>
        )}
        <button className="primary next" onClick={advance}>
          {t('繼續')}
        </button>
      </main>
    );

  const pool = vd.pool(scene, st);
  const seated = pool.slice(0, scene.seats);
  // 剔除的人留在名單原位，劃掉並寫是誰剔的，入座線自動往下補（視覺規格 §18）。
  const goneBy = (id: string) =>
    st.struck.includes(id)
      ? t('剔除')
      : st.theirs.includes(id)
        ? t('對方剔除')
        : st.excused.includes(id)
          ? t('有因剔除')
          : null;
  const rows =
    filter === 'seated'
      ? seated
      : filter === 'unasked'
        ? pool.filter((c) => !st.asked.includes(c.id))
        : scene.candidates;
  const sel = open ?? (wide ? (pool[0]?.id ?? null) : null);
  const picked = scene.candidates.find((c) => c.id === sel);
  const pick = (id: string) => {
    setOpen(wide || open !== id ? id : null);
    setStriking(null);
  };
  const leftStrikes = scene.peremptories - st.struck.length;

  const list = (
    <ul className="cands" aria-label={t('候選人')}>
      {rows.map((c) => {
        const i = pool.indexOf(c);
        const by = goneBy(c.id);
        const asked = st.asked.includes(c.id);
        const cls = ['cand', by ? 'struck' : i >= scene.seats ? 'bench' : 'seat'];
        if (sel === c.id) cls.push('on');
        return (
          <li key={c.id} className="cand-li">
            <button
              className={cls.join(' ')}
              aria-pressed={sel === c.id}
              onClick={() => pick(c.id)}
            >
              <span className="no">{by ? '–' : i + 1}</span>
              <IdPhoto who={c.name} size={40} />
              <span className="txt">
                <strong>
                  {t(c.name, scope)}
                  <span>{t(c.job, scope)}</span>
                </strong>
                <span className="line">{t(c.sheet, scope)}</span>
              </span>
              <span className="st">
                {by ? (
                  <span className="gone">{by}</span>
                ) : (
                  i < scene.seats && <span className="seatno">{t('席 {n}', { n: i + 1 })}</span>
                )}
                {asked && <span>{t('已問')}</span>}
              </span>
            </button>
            {filter === 'all' && i === scene.seats - 1 && pool.length > scene.seats && (
              <p className="cutline">{t('以上 {n} 位入座・以下候補', { n: scene.seats })}</p>
            )}
          </li>
        );
      })}
      {rows.length === 0 && <li className="muted">{t('這個篩選沒有人。')}</li>}
    </ul>
  );

  const profile = picked && (
    <section className="panel prof" aria-label={t(picked.name, scope)}>
      <IdPhoto who={picked.name} size={96} />
      <div>
        <h3>{t(picked.name, scope)}</h3>
        <p className="sub">
          {t(picked.job, scope)}
          {t('・')}
          {t(picked.sheet, scope)}
        </p>
        <p className="sub">
          {goneBy(picked.id) ??
            t('你還可以問 {a} 題；無因迴避還剩 {b} 次。', { a: st.left, b: leftStrikes })}
        </p>
      </div>
      <div className="qa">
        {st.asked.includes(picked.id) ? (
          <>
            <span className="jq">{t('你問・{q}', { q: t(picked.question.q, scope) })}</span>
            <p className="ja">{t(picked.question.a, scope)}</p>
            {picked.hidden && <p className="jh">{t(picked.hidden, scope)}</p>}
          </>
        ) : (
          <p className="jh">{t('還沒問過。問一題，才看得出他偏向哪邊。')}</p>
        )}
      </div>
      {!goneBy(picked.id) &&
        (striking === picked.id && vd.canStrike(scene, st, picked.id) ? (
          <CommitBar
            what={t('無因迴避：{name}', { name: t(picked.name, scope) })}
            cost={t('用掉 1 次，剩 {n} 次；對方也會刪掉你想留的人。', { n: leftStrikes - 1 })}
            action={t('刪掉{name}', { name: t(picked.name, scope) })}
            onCommit={() => {
              setStriking(null);
              strikeJuror(picked.id);
            }}
          />
        ) : (
          <div className="acts">
            <button
              className="secondary"
              disabled={!vd.canAsk(st, picked.id)}
              onClick={() => askJuror(picked.id)}
            >
              {t('提問')} <span className="cost">{t('剩 {n}', { n: st.left })}</span>
            </button>
            <button
              className="secondary"
              disabled={!vd.canStrike(scene, st, picked.id)}
              onClick={() => setStriking(picked.id)}
            >
              {t('無因迴避', 'voirdire')}{' '}
              <span className="cost">{t('剩 {n}', { n: leftStrikes })}</span>
            </button>
            <button className="secondary" onClick={() => challengeJuror(picked.id)}>
              {t('聲請有因迴避')}
            </button>
          </div>
        ))}
    </section>
  );

  // 陪審席：12 席分兩排，後排（7–12）在上、右移半格。
  const seatCell = (k: number) => {
    const c = seated[k];
    if (!c)
      return (
        <span key={k} className="seatc empty">
          <span className="slot0">{k + 1}</span>
          <span className="n">{wide ? t('席 {n}', { n: k + 1 }) : k + 1}</span>
        </span>
      );
    const name = t(c.name, scope);
    return (
      <button
        key={k}
        className={sel === c.id ? 'seatc on' : 'seatc'}
        aria-label={t('席 {n}', { n: k + 1 }) + t('・') + name}
        onClick={() => pick(c.id)}
      >
        <IdPhoto who={c.name} size={wide ? 72 : 28} />
        <span className="n">{wide ? t('席 {n}', { n: k + 1 }) : k + 1}</span>
        <span className="nm2">{surname(name)}</span>
      </button>
    );
  };
  const seatsIdx = Array.from({ length: scene.seats }, (_, k) => k);
  const box = (
    <section className={wide ? 'box' : 'box mini'} aria-label={t('陪審席')}>
      <div className="k">
        <span>{t('陪審席・{n} 席', { n: scene.seats })}</span>
        <span>{t('由名單上往下入座')}</span>
      </div>
      {wide && scene.seats > 6 ? (
        <>
          <div className="seats back">{seatsIdx.slice(6).map(seatCell)}</div>
          <div className="seats">{seatsIdx.slice(0, 6).map(seatCell)}</div>
        </>
      ) : (
        <div className="seats">{seatsIdx.map(seatCell)}</div>
      )}
    </section>
  );

  const tally = (
    <div className="tb-tally">
      <span>
        {t('提問', 'voirdire')}
        <b className={st.left <= 1 ? 'low' : undefined}>{st.left}</b>
        <small>/{scene.questions}</small>
      </span>
      <span>
        {t('無因迴避', 'voirdire')}
        <b className={leftStrikes <= 1 ? 'low' : undefined}>{leftStrikes}</b>
        <small>/{scene.peremptories}</small>
      </span>
      <span>
        {t('候選')}
        <b>{pool.length}</b>
      </span>
    </div>
  );
  const tabs = (
    <Tabs
      label={t('候選人')}
      value={filter}
      onPick={setFilter}
      items={[
        { id: 'all', label: t('全部 {n}', { n: scene.candidates.length }) },
        { id: 'seated', label: t('會入座的 {n}', { n: seated.length }) },
        {
          id: 'unasked',
          label: t('還沒問過 {n}', { n: pool.filter((c) => !st.asked.includes(c.id)).length }),
        },
      ]}
    />
  );
  const seatButton = (
    <button className="commit" disabled={!vd.canSeat(scene, st)} onClick={seatJury}>
      <span aria-hidden>🔒 </span>
      {t('就用這 {n} 位', { n: scene.seats })}
    </button>
  );

  if (wide)
    return (
      <main className="vd-screen">
        <header className="trialbar">
          <span className="eb">
            {t(scene.act, scope)}
            {t('・')}
            {t(scene.place, scope)}
            <b>{t('陪審團遴選')}</b>
          </span>
          {tally}
        </header>
        <div className="vd">
          <div className="panel cand-list">
            <div className="panel-head">{tabs}</div>
            <div className="cand-scroll">{list}</div>
          </div>
          <div className="vd-right">
            {box}
            {profile ?? (
              <section className="panel prof empty">{t('點名單上的人看他的資料。')}</section>
            )}
            <div className="commitbar">
              <p className="who">
                {t('入座：')}
                <b>{seated.map((c) => surname(t(c.name, scope))).join(t('、'))}</b>
                {t('　剔除的人不會回來。')}
              </p>
              {seatButton}
            </div>
          </div>
        </div>
      </main>
    );

  return (
    <Shell
      resetKey={filter}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">{t('陪審團遴選')}</p>
          <div className="patience">{tally}</div>
        </header>
      }
      tabs={tabs}
      foot={seatButton}
    >
      {box}
      {list}
      {picked && (
        <CardSheet title={t(picked.name, scope)} onClose={() => setOpen(null)}>
          {profile}
        </CardSheet>
      )}
    </Shell>
  );
}

/** 「茱蒂絲・柯恩」→「柯恩」；英文取最後一個字。 */
const surname = (name: string) =>
  name
    .split(/[・·\s]+/)
    .filter(Boolean)
    .pop() ?? name;
