import { useState } from 'react';
import type { VoirDireScene } from '../engine/episode/schema';
import * as vd from '../engine/episode/voirdire';
import { useEpisode, voirDireState } from '../engine/game';
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
  const [intro, setIntro] = useState(st.asked.length === 0 && st.struck.length === 0);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {scene.act}・{scene.place}
        </p>
        <div className="lines">
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          開始遴選
        </button>
      </main>
    );

  if (vd.done(st))
    return (
      <main className="scene">
        <p className="eyebrow">陪審團已選定</p>
        <ul className="stack">
          {vd.panel(scene, st).map((j) => (
            <li key={j.id} className="panel">
              <strong>{j.label}</strong>
              {j.foreperson && <span className="muted"> ・陪審長</span>}
            </li>
          ))}
        </ul>
        {st.wrong > 0 && (
          <p className="muted">
            沒有根據的聲請有 {st.wrong} 次。開庭第一天的法官耐心會少 {st.wrong} 點。
          </p>
        )}
        <button className="primary next" onClick={advance}>
          繼續
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
          <p className="eyebrow">陪審團遴選</p>
          <p className="patience">
            提問 <strong>{st.left}</strong> ・ 無因迴避{' '}
            <strong>{scene.peremptories - st.struck.length}</strong> ・ 候選 {pool.length}
          </p>
        </header>
      }
      tabs={
        <Tabs
          label="候選人"
          value={filter}
          onPick={setFilter}
          items={[
            { id: 'all', label: `全部 ${pool.length}` },
            { id: 'seated', label: `會入座的 ${scene.seats}` },
            { id: 'unasked', label: '還沒問過' },
          ]}
        />
      }
      foot={
        <button className="primary wide" disabled={!vd.canSeat(scene, st)} onClick={seatJury}>
          就用這 {scene.seats} 位（由上往下）
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
                onClick={() => setOpen(isOpen ? null : c.id)}
              >
                <strong>
                  <span className="seat">{seat < scene.seats ? seat + 1 : '—'}</span>
                  {c.name}・{c.job}
                  {asked && <span className="good"> ・問過</span>}
                </strong>
                <span className="muted small">{c.sheet}</span>
              </button>
              {isOpen && (
                <div className="candidate-body">
                  {asked && (
                    <>
                      <p className="claim-text">「{c.question.q}」</p>
                      <p>{c.question.a}</p>
                      {c.hidden && <p className="muted small">{c.hidden}</p>}
                    </>
                  )}
                  <div className="row">
                    <button disabled={!vd.canAsk(st, c.id)} onClick={() => askJuror(c.id)}>
                      提問
                    </button>
                    <button onClick={() => challengeJuror(c.id)}>聲請有因迴避</button>
                    <button
                      disabled={!vd.canStrike(scene, st, c.id)}
                      onClick={() => strikeJuror(c.id)}
                    >
                      無因迴避
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="muted">這個篩選沒有人。</li>}
      </ul>
    </Shell>
  );
}
