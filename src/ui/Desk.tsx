import { useLayoutEffect, useRef, useState } from 'react';
import * as desk from '../engine/episode/desk';
import type { DeskScene } from '../engine/episode/schema';
import { deskState, useEpisode } from '../engine/game';
import { play } from '../engine/sound';
import { CardPick, EvidenceDrawer, KindFilter, timeGroups, useKindFilter } from './Evidence';
import { Speech } from './Portrait';
import { RelationPicker } from './RelationPicker';
import { Shell, Tabs } from './Shell';
import { Timeline } from './Timeline';

// 證據庫和左下的證據抽屜內容一模一樣，所以只留抽屜：它在每個畫面都叫得出來。
type App = 'mail' | 'docs' | 'board' | 'jobs' | 'court';
const labels: Record<App, string> = {
  mail: '郵件',
  docs: '卷宗',
  board: '證據板',
  jobs: '委託',
  court: '法院系統',
};

/** 第二幕的桌面：艾莉絲的工作電腦，每個 App 是一個系統入口（企劃書 6.1）。 */
export function Desk({ scene }: { scene: DeskScene }) {
  const { progress, advance, clearReport, resolveTwist, wrapDesk } = useEpisode();
  const st = deskState(progress, scene);
  const [app, setApp] = useState<App>('mail');
  const held = desk.heldCards(scene, st, progress.cards);
  const unread = scene.mail.filter((m) => st.mail.includes(m.id) && !st.openMail.includes(m.id));
  const finished = desk.done(scene, st);

  if (st.report.length)
    return (
      <main className="scene report">
        <p className="eyebrow">回報</p>
        <div className="lines">
          {st.report.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={clearReport}>
          回到桌面
        </button>
      </main>
    );

  // 對方聲請撤銷傳票，事務所要你收手。這個抉擇擋在桌面前面，非決定不可。
  const twist = desk.pendingTwist(scene, st);
  if (twist?.twist)
    return (
      <main className="scene report">
        <p className="eyebrow">事務所</p>
        <div className="lines">
          {twist.twist.lines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <div className="choices">
          {twist.twist.options.map((o, i) => (
            <button key={i} onClick={() => resolveTwist(twist.id, i)}>
              {o.text}
            </button>
          ))}
        </div>
      </main>
    );

  if (finished)
    return (
      <main className="scene report">
        <p className="eyebrow">{scene.act}</p>
        <div className="lines">
          {scene.goalLines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={advance}>
          開庭
        </button>
      </main>
    );

  const apps = (Object.keys(labels) as App[]).map((id) => ({
    id,
    label: labels[id],
    badge: id === 'mail' && unread.length > 0 ? unread.length : undefined,
  }));

  return (
    <Shell
      resetKey={app}
      head={
        <header className="taskbar">
          <span className="hours" aria-label={`剩餘工時 ${st.hours} 小時`}>
            <strong>{st.hours}</strong> 工時
          </span>
          <span className="muted small">{scene.deadline}</span>
        </header>
      }
      tabs={<Tabs label="應用程式" value={app} onPick={setApp} items={apps} />}
      foot={
        <>
          <EvidenceDrawer />
          {desk.canWrap(scene, st) && (
            <button className="primary wide" onClick={wrapDesk}>
              結束調查
            </button>
          )}
        </>
      }
    >
      {app === 'mail' && <Mail scene={scene} />}
      {app === 'docs' && <Docs scene={scene} />}
      {app === 'board' && <Board scene={scene} held={held} />}
      {app === 'jobs' && <Jobs scene={scene} held={held} />}
      {app === 'court' && <Motions scene={scene} held={held} />}
    </Shell>
  );
}

function Mail({ scene }: { scene: DeskScene }) {
  const { progress, openMail } = useEpisode();
  const st = deskState(progress, scene);
  const [open, setOpen] = useState<string | null>(null);
  const inbox = scene.mail.filter((m) => st.mail.includes(m.id));
  const mail = inbox.find((m) => m.id === open);
  if (mail)
    return (
      <article className="panel doc">
        <button className="link" onClick={() => setOpen(null)}>
          ← 收件匣
        </button>
        <h2>{mail.subject}</h2>
        <p className="muted">寄件者：{mail.from}</p>
        {mail.body.map((b) => (
          <p key={b}>{b}</p>
        ))}
      </article>
    );
  return (
    <ul className="stack list">
      {inbox.map((m) => (
        <li key={m.id}>
          <button
            className={st.openMail.includes(m.id) ? 'row-item' : 'row-item unread'}
            onClick={() => {
              openMail(m.id);
              setOpen(m.id);
            }}
          >
            <strong>{m.subject}</strong>
            <span className="muted">{m.from}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 文件以句子為單位。點一句話可以標記，命中關鍵事實才生成卡片，點錯沒有懲罰。 */
function Docs({ scene }: { scene: DeskScene }) {
  const { progress, openDoc, mark } = useEpisode();
  const st = deskState(progress, scene);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const doc = scene.docs.find((d) => d.id === open);
  if (doc)
    return (
      <article className="panel doc">
        <button className="link" onClick={() => setOpen(null)}>
          ← 卷宗
        </button>
        <h2>{doc.title}</h2>
        <p className="muted">{doc.from}</p>
        <p className="muted small">點一句話標記。標到關鍵事實會生成卡片。</p>
        <ol className="doc-lines">
          {doc.lines.map((l, i) => {
            const key = `${doc.id}:${i}`;
            const made = l.fact && st.marked.includes(l.fact);
            return (
              <li key={key}>
                <button
                  className={
                    made ? 'sentence made' : notes.includes(key) ? 'sentence noted' : 'sentence'
                  }
                  aria-pressed={!!made || notes.includes(key)}
                  onClick={() => {
                    if (l.fact) {
                      mark(l.fact);
                      play('mark');
                    } else
                      setNotes((n) => (n.includes(key) ? n.filter((x) => x !== key) : [...n, key]));
                  }}
                >
                  <span>{l.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </article>
    );
  return (
    <ul className="stack list">
      {scene.docs.map((d) => (
        <li key={d.id}>
          <button
            className={st.readDocs.includes(d.id) ? 'row-item' : 'row-item unread'}
            onClick={() => {
              openDoc(d.id);
              setOpen(d.id);
            }}
          >
            <strong>{d.title}</strong>
            <span className="muted">{d.from}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 證據板：時間線與推理（企劃書 6.5）。推理分兩步：
 * 先在「連線」把兩張卡用一種關係連成發現，再拿發現去回答疑問。
 * 一次只顯示一個分頁，免得選卡清單把下一題推到看不見的地方。
 */
function Board({ scene, held }: { scene: DeskScene; held: string[] }) {
  const {
    progress,
    toggleCard,
    toggleLinkCard,
    setLinkRelation,
    connect,
    submit,
    toggleTimeline,
    moveTimeline,
  } = useEpisode();
  const st = deskState(progress, scene);
  // 確認過的論點也是卡片，可以拿來連線或回答後面的疑問（例如「那則訊息是誰傳的」要用論點 B）。
  const args = scene.questions
    .filter((q) => st.confirmed.includes(q.id))
    .map((q) => ({
      id: q.argument.id,
      name: q.argument.name,
      kind: '論點' as const,
      text: q.argument.text,
    }));
  const pool = [...args, ...scene.cards.filter((c) => held.includes(c.id))];
  const found = desk.findings(scene, st).map((l, i) => ({
    id: l.id,
    name: `發現 ${i + 1}`,
    kind: '發現' as const,
    text: l.text,
  }));
  const answers = [...found, ...args];
  // 一打開就停在第一題還沒確認的疑問；還沒有任何發現時先到連線。
  const firstOpen = scene.questions.find((q) => !st.confirmed.includes(q.id));
  const [view, setView] = useState<string>(
    found.length === 0 && firstOpen ? 'links' : (firstOpen?.id ?? 'timeline'),
  );
  const q = scene.questions.find((x) => x.id === view);
  const items = [
    { id: 'links', label: '連線' },
    ...scene.questions.map((x, i) => ({
      id: x.id,
      label: `疑問 ${i + 1}`,
      done: st.confirmed.includes(x.id),
    })),
    { id: 'timeline', label: '時間線' },
  ];
  const [kind, setKind, showKind] = useKindFilter();
  const board = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const t = tabs.current;
    if (t) board.current?.style.setProperty('--tabs-h', `${t.offsetHeight}px`);
  }, [view]);
  const slot = (i: number) => {
    const c = pool.find((x) => x.id === st.link.cards[i]);
    return (
      <li className={c ? 'slot-card filled' : 'slot-card'}>
        {c ? c.name : i === 0 ? '第一張卡' : '第二張卡'}
      </li>
    );
  };
  return (
    <div className="stack" ref={board}>
      {/* 分頁列釘在上緣，連線台再釘在它下面：往下挑卡時兩者都不會捲走。 */}
      <div className="board-tabs" ref={tabs}>
        <Tabs label="證據板" value={view} onPick={setView} items={items} />
      </div>
      {view === 'timeline' && (
        <Timeline
          cards={pool}
          placed={st.timeline}
          onToggle={toggleTimeline}
          onMove={moveTimeline}
        />
      )}
      {view === 'links' && (
        <section className="panel chain links">
          <h2>連線</h2>
          <p className="muted small">
            挑兩張卡，說明它們之間是什麼關係。連對了得到一條發現；連錯扣 1 工時。
          </p>
          {/*
           * 連線台黏在捲動區上緣：往下挑卡、選關係時都看得到自己拼了什麼，
           * 按下「連起來」的結果也出現在這裡。連錯時卡片會留在槽裡，連對或重複時槽會清空。
           */}
          <div className={desk.canConnect(st) ? 'link-bench ready' : 'link-bench'}>
            <ul className="slots-row">
              {slot(0)}
              <li className="link-knot" aria-hidden>
                <span className={st.link.relation ? 'set' : undefined}>
                  {st.link.relation ?? '？'}
                </span>
              </li>
              {slot(1)}
            </ul>
            <RelationPicker
              cards={st.link.cards.map((id) => pool.find((c) => c.id === id)?.name)}
              value={st.link.relation}
              onPick={setLinkRelation}
              compact
            />
            <button
              className="primary wide-center"
              disabled={!desk.canConnect(st)}
              onClick={connect}
            >
              連起來
            </button>
            {st.linkNote && (
              <p role="status" className={st.link.cards.length ? 'board-note bad' : 'board-note'}>
                {st.linkNote}
              </p>
            )}
          </div>
          <KindFilter items={pool} value={kind} onPick={setKind} />
          <ul className="stack">
            {timeGroups(
              pool.filter((c) => showKind(c) || st.link.cards.includes(c.id)),
              (c) => (
                <li key={c.id}>
                  <CardPick
                    item={c}
                    on={st.link.cards.includes(c.id)}
                    onPick={() => toggleLinkCard(c.id)}
                  />
                </li>
              ),
            )}
          </ul>
          {found.length > 0 && (
            <>
              <h3 className="findings-head">
                發現 <span>{found.length}</span>
              </h3>
              <ol className="findings">
                {found.map((f) => (
                  <li key={f.id}>
                    <strong>{f.name}</strong>
                    <p>{f.text}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
      {q &&
        (() => {
          const a = st.attempts[q.id] ?? { cards: [] };
          const done = st.confirmed.includes(q.id);
          return (
            <section className={done ? 'panel chain done' : 'panel chain'}>
              <h2>{q.text}</h2>
              {done ? (
                <p className="good">已確認：{q.argument.name}</p>
              ) : answers.length === 0 ? (
                <div className="board-empty">
                  <p className="muted">還沒有發現。先到「連線」把證據拼起來。</p>
                  <button onClick={() => setView('links')}>去連線</button>
                </div>
              ) : (
                <>
                  <p className="muted small">
                    挑 {q.answer.length} 條發現或論點來回答。提交花 1 工時。
                  </p>
                  <ul className="stack">
                    {answers.map((c) => (
                      <li key={c.id}>
                        <CardPick
                          item={c}
                          on={a.cards.includes(c.id)}
                          onPick={() => toggleCard(q.id, c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                  <button
                    className="primary pin-bottom"
                    disabled={!desk.canSubmit(scene, st, q.id)}
                    onClick={() => submit(q.id)}
                  >
                    提交到案情會議（1 工時）
                  </button>
                </>
              )}
              {st.feedback[q.id] && (
                <p role="status" className={done ? 'board-note' : 'board-note bad'}>
                  {st.feedback[q.id]}
                </p>
              )}
            </section>
          );
        })()}
    </div>
  );
}

/**
 * 法院系統：提出動議與聲請傳票。三樣都要選對（企劃書 6.6）。
 * 一份聲請就有三組選項，所以一次只處理一份。
 */
function Motions({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, pickBasis, pickRequest, toggleSupport, fileMotion } = useEpisode();
  const st = deskState(progress, scene);
  const pool = scene.cards.filter((c) => held.includes(c.id));
  const args = scene.questions.filter((q) => held.includes(q.argument.id)).map((q) => q.argument);
  // 一打開就停在還沒裁定的那一份上。
  const open = scene.motions.find((m) => desk.motionAttempt(st, m.id).ruling === null);
  const [pick, setPick] = useState<string>(open?.id ?? scene.motions[0]?.id ?? '');
  if (scene.motions.length === 0) return <p className="muted">目前沒有可以提出的聲請。</p>;
  const m = scene.motions.find((x) => x.id === pick) ?? scene.motions[0];
  const a = desk.motionAttempt(st, m.id);
  const missing = m.needs.filter((n) => !held.includes(n));
  return (
    <div className="stack">
      {scene.motions.length > 1 && (
        <Tabs
          label="聲請"
          value={pick}
          onPick={setPick}
          items={scene.motions.map((x, i) => ({
            id: x.id,
            label: `聲請 ${i + 1}`,
            done: desk.motionAttempt(st, x.id).ruling !== null,
          }))}
        />
      )}
      <section className="panel job">
        <strong>{m.label}</strong>
        <p className="muted">{m.cost} 工時</p>
        <p>{m.detail}</p>
        {a.ruling === 'granted' && <p className="good">法官准了。</p>}
        {a.ruling === 'denied' && <p className="bad-text">駁回。法官記得妳浪費了他的時間。</p>}
        {a.ruling === null &&
          (missing.length ? (
            <p className="muted">還缺前提：先把相關的論點確認起來。</p>
          ) : (
            <>
              <fieldset className="relations">
                <legend>法律依據</legend>
                <div className="stack">
                  {m.bases.map((b) => (
                    <button
                      key={b}
                      role="radio"
                      aria-checked={a.basis === b}
                      className={a.basis === b ? 'wide on' : 'wide'}
                      onClick={() => pickBasis(m.id, b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="relations">
                <legend>請求</legend>
                <div className="stack">
                  {m.requests.map((r) => (
                    <button
                      key={r}
                      role="radio"
                      aria-checked={a.request === r}
                      className={a.request === r ? 'wide on' : 'wide'}
                      onClick={() => pickRequest(m.id, r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="relations">
                <legend>支撐（{m.support.length} 張）</legend>
                <div className="stack">
                  {[...args, ...pool].map((c) => (
                    <CardPick
                      key={c.id}
                      item={c}
                      on={a.support.includes(c.id)}
                      onPick={() => toggleSupport(m.id, c.id)}
                    />
                  ))}
                </div>
              </fieldset>
              <button
                className="primary pin-bottom"
                disabled={!desk.canFile(scene, st, m.id, progress.cards)}
                onClick={() => fileMotion(m.id)}
              >
                送出（{m.cost} 工時）
              </button>
            </>
          ))}
      </section>
    </div>
  );
}

function Jobs({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, commission } = useEpisode();
  const st = deskState(progress, scene);
  // 前提還沒出現的委託不顯示：先有線索，才知道可以查什麼。
  const shown = scene.jobs.filter(
    (j) => st.jobs.includes(j.id) || j.needs.every((n) => held.includes(n)),
  );
  const nameOf = (id: string) =>
    scene.cards.find((c) => c.id === id)?.name ??
    scene.questions.find((q) => q.argument.id === id)?.argument.name ??
    id;
  if (shown.length === 0)
    return <p className="muted">目前沒有可以委託的事。多讀卷宗、多問委託人。</p>;
  return (
    <ul className="stack">
      {shown.map((j) => {
        const done = st.jobs.includes(j.id);
        return (
          <li key={j.id} className="panel job">
            <strong>{j.label}</strong>
            <p className="muted">
              {j.who}・{j.cost} 工時
            </p>
            <p>{j.detail}</p>
            {/* 前提寫在卡上：沒寫的話，玩家會以為不必任何證據就能委託。 */}
            {j.needs.length > 0 && !done && (
              <ul className="needs" aria-label="需要">
                {j.needs.map((n) => (
                  <li key={n} className={held.includes(n) ? 'have' : 'lack'}>
                    {held.includes(n) ? '✓' : '需要'} {nameOf(n)}
                  </li>
                ))}
              </ul>
            )}
            {done ? (
              <p className="good">已回報。</p>
            ) : (
              <button
                className="primary"
                disabled={!desk.canCommission(scene, st, j.id, progress.cards)}
                onClick={() => commission(j.id)}
              >
                {`委託（${j.cost} 工時）`}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
