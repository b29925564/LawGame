import { useState } from 'react';
import * as desk from '../engine/episode/desk';
import type { DeskScene } from '../engine/episode/schema';
import { deskState, useEpisode } from '../engine/game';
import type { Relation } from '../engine/schema';
import { play } from '../engine/sound';
import { Speech } from './Portrait';
import { RelationPicker } from './RelationPicker';
import { Timeline } from './Timeline';

type App = 'mail' | 'docs' | 'cards' | 'board' | 'jobs';
const apps: { id: App; label: string }[] = [
  { id: 'mail', label: '郵件' },
  { id: 'docs', label: '卷宗' },
  { id: 'cards', label: '證據庫' },
  { id: 'board', label: '證據板' },
  { id: 'jobs', label: '委託' },
];

/** 第二幕的桌面：艾莉絲的工作電腦，每個 App 是一個系統入口（企劃書 6.1）。 */
export function Desk({ scene }: { scene: DeskScene }) {
  const { progress, advance, clearReport } = useEpisode();
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

  return (
    <main className="desk">
      <header className="taskbar">
        <span className="hours" aria-label={`剩餘工時 ${st.hours} 小時`}>
          <strong>{st.hours}</strong> 工時
        </span>
        <span className="muted">{scene.deadline}</span>
      </header>
      <nav className="apps" aria-label="應用程式">
        {apps.map((a) => (
          <button key={a.id} aria-current={app === a.id} onClick={() => setApp(a.id)}>
            {a.label}
            {a.id === 'mail' && unread.length > 0 && <span className="dot">{unread.length}</span>}
          </button>
        ))}
      </nav>
      <div className="window">
        {app === 'mail' && <Mail scene={scene} />}
        {app === 'docs' && <Docs scene={scene} />}
        {app === 'cards' && <Cards scene={scene} held={held} />}
        {app === 'board' && <Board scene={scene} held={held} />}
        {app === 'jobs' && <Jobs scene={scene} held={held} />}
      </div>
    </main>
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
                  {l.text}
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

function Cards({ scene, held }: { scene: DeskScene; held: string[] }) {
  const cards = scene.cards.filter((c) => held.includes(c.id));
  const args = scene.questions.filter((q) => held.includes(q.argument.id)).map((q) => q.argument);
  return (
    <ul className="stack cards">
      {args.map((a) => (
        <li key={a.id} className="card arg">
          <strong>{a.name}</strong>
          <p>{a.text}</p>
          <span className="muted small">強度 {a.strength}</span>
        </li>
      ))}
      {cards.map((c) => (
        <li key={c.id} className="card">
          <strong>
            {c.time && <span className="time">{c.time}</span>}
            {c.name}
          </strong>
          <p>{c.text}</p>
          <span className="muted small">
            {c.kind}・{c.source}
          </span>
        </li>
      ))}
      {cards.length === 0 && <li className="muted">還沒有任何卡片。先去讀卷宗。</li>}
    </ul>
  );
}

/** 證據板：時間線與推理鏈（企劃書 6.5）。 */
function Board({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, toggleCard, setRelation, submit, toggleTimeline, moveTimeline } = useEpisode();
  const st = deskState(progress, scene);
  const pool = scene.cards.filter((c) => held.includes(c.id));
  const [view, setView] = useState<'chains' | 'timeline'>('chains');
  if (view === 'timeline')
    return (
      <div className="stack">
        <BoardTabs view={view} setView={setView} />
        <Timeline
          cards={pool}
          placed={st.timeline}
          onToggle={toggleTimeline}
          onMove={moveTimeline}
        />
      </div>
    );
  return (
    <div className="stack">
      <BoardTabs view={view} setView={setView} />
      {scene.questions.map((q) => {
        const a = st.attempts[q.id] ?? { cards: [], relation: null as Relation | null };
        const done = st.confirmed.includes(q.id);
        return (
          <section key={q.id} className="panel chain">
            <h2>{q.text}</h2>
            {done ? (
              <p className="good">已確認：{q.argument.name}</p>
            ) : (
              <>
                <p className="muted small">
                  放 {q.answer.length} 張卡片，再說明這兩張卡之間是什麼關係。提交花 1 工時。
                </p>
                <ul className="slots-row">
                  {Array.from({ length: q.answer.length }, (_, i) => (
                    <li key={i} className={a.cards[i] ? 'slot-card filled' : 'slot-card'}>
                      {a.cards[i] ? scene.cards.find((c) => c.id === a.cards[i])?.name : '（空）'}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>選卡片</summary>
                  <ul className="stack">
                    {pool.map((c) => (
                      <li key={c.id}>
                        <button
                          className={a.cards.includes(c.id) ? 'wide on' : 'wide'}
                          aria-pressed={a.cards.includes(c.id)}
                          onClick={() => toggleCard(q.id, c.id)}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
                <RelationPicker
                  cards={a.cards.map((id) => scene.cards.find((c) => c.id === id)?.name)}
                  value={a.relation}
                  onPick={(r) => setRelation(q.id, r)}
                />
                <button
                  className="primary"
                  disabled={!desk.canSubmit(scene, st, q.id)}
                  onClick={() => submit(q.id)}
                >
                  提交到案情會議（1 工時）
                </button>
              </>
            )}
            {st.feedback[q.id] && <p role="status">{st.feedback[q.id]}</p>}
          </section>
        );
      })}
    </div>
  );
}

function BoardTabs({
  view,
  setView,
}: {
  view: 'chains' | 'timeline';
  setView: (v: 'chains' | 'timeline') => void;
}) {
  return (
    <div className="row" role="tablist">
      <button role="tab" aria-selected={view === 'chains'} onClick={() => setView('chains')}>
        推理鏈
      </button>
      <button role="tab" aria-selected={view === 'timeline'} onClick={() => setView('timeline')}>
        時間線
      </button>
    </div>
  );
}

function Jobs({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, commission } = useEpisode();
  const st = deskState(progress, scene);
  return (
    <ul className="stack">
      {scene.jobs.map((j) => {
        const done = st.jobs.includes(j.id);
        const missing = j.needs.filter((n) => !held.includes(n));
        return (
          <li key={j.id} className="panel job">
            <strong>{j.label}</strong>
            <p className="muted">
              {j.who}・{j.cost} 工時
            </p>
            <p>{j.detail}</p>
            {done ? (
              <p className="good">已回報。</p>
            ) : (
              <button
                className="primary"
                disabled={!desk.canCommission(scene, st, j.id, progress.cards)}
                onClick={() => commission(j.id)}
              >
                {missing.length ? '還缺前提' : `委託（${j.cost} 工時）`}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
