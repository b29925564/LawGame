import { useEffect, useState } from 'react';
import type { VoirDireScene } from '../engine/episode/schema';
import * as vd from '../engine/episode/voirdire';
import { useEpisode, voirDireState } from '../engine/game';
import { useT } from '../i18n';
import { CommitBar } from './Commit';
import { useScope } from './lang';
import { Speech } from './Portrait';
import { Shell, Tabs } from './Shell';

type Filter = 'all' | 'seated' | 'unasked';

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
  // 定案列一出現就捲進畫面，手機上才不會被底部列擋住。
  useEffect(() => {
    if (striking) document.querySelector('.commit-bar')?.scrollIntoView({ block: 'nearest' });
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
  const shown = pool.filter((c, i) =>
    filter === 'seated' ? i < scene.seats : filter === 'unasked' ? !st.asked.includes(c.id) : true,
  );
  return (
    <Shell
      resetKey={filter}
      head={
        <header className="panel-head bench">
          <p className="eyebrow">{t('陪審團遴選')}</p>
          <p className="patience">
            {/* 手機上整列放不下時，標籤和數字一起換行，不要拆開。 */}
            <span className="nowrap">
              {t('提問', 'voirdire')} <strong>{st.left}</strong>
            </span>
            <span aria-hidden>{t('・')}</span>
            <span className="nowrap">
              {t('無因迴避', 'voirdire')} <strong>{scene.peremptories - st.struck.length}</strong>
            </span>
            <span aria-hidden>{t('・')}</span>
            <span className="nowrap">{t('候選 {n}', { n: pool.length })}</span>
          </p>
        </header>
      }
      tabs={
        <Tabs
          label={t('候選人')}
          value={filter}
          onPick={setFilter}
          items={[
            { id: 'all', label: t('全部 {n}', { n: pool.length }) },
            { id: 'seated', label: t('會入座的 {n}', { n: scene.seats }) },
            { id: 'unasked', label: t('還沒問過') },
          ]}
        />
      }
      foot={
        <button className="primary wide" disabled={!vd.canSeat(scene, st)} onClick={seatJury}>
          {t('就用這 {n} 位（由上往下）', { n: scene.seats })}
        </button>
      }
    >
      <ul className="stack list">
        {shown.map((c) => {
          const seat = pool.indexOf(c);
          const asked = st.asked.includes(c.id);
          const isOpen = open === c.id;
          return (
            <li key={c.id} className={seat < scene.seats ? 'candidate in' : 'candidate'}>
              <button
                className="row-item"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : c.id);
                  setStriking(null);
                }}
              >
                <strong>
                  <span className="seat">{seat < scene.seats ? seat + 1 : '—'}</span>
                  {t(c.name, scope)}
                  {t('・')}
                  {t(c.job, scope)}
                  {asked && <span className="good"> {t('・問過')}</span>}
                </strong>
                <span className="muted small">{t(c.sheet, scope)}</span>
              </button>
              {isOpen && (
                <div className="candidate-body">
                  {asked && (
                    <>
                      <p className="claim-text">
                        {t('「{text}」', { text: t(c.question.q, scope) })}
                      </p>
                      <p>{t(c.question.a, scope)}</p>
                      {c.hidden && <p className="muted small">{t(c.hidden, scope)}</p>}
                    </>
                  )}
                  <div className="row">
                    <button disabled={!vd.canAsk(st, c.id)} onClick={() => askJuror(c.id)}>
                      {t('提問')}
                    </button>
                    <button onClick={() => challengeJuror(c.id)}>{t('聲請有因迴避')}</button>
                    <button
                      disabled={!vd.canStrike(scene, st, c.id)}
                      aria-pressed={striking === c.id}
                      onClick={() => setStriking(striking === c.id ? null : c.id)}
                    >
                      {t('無因迴避')}
                    </button>
                  </div>
                  {striking === c.id && vd.canStrike(scene, st, c.id) && (
                    <CommitBar
                      what={t('無因迴避：{name}', { name: t(c.name, scope) })}
                      cost={t('用掉 1 次，剩 {n} 次；對方也會刪掉你想留的人。', {
                        n: scene.peremptories - st.struck.length - 1,
                      })}
                      action={t('刪掉{name}', { name: t(c.name, scope) })}
                      onCommit={() => {
                        setStriking(null);
                        strikeJuror(c.id);
                      }}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="muted">{t('這個篩選沒有人。')}</li>}
      </ul>
    </Shell>
  );
}
