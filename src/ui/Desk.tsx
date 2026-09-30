import { episode, useGame } from '../engine/store';
import type { AppId } from '../engine/schema';
import { EvidenceList } from './EvidenceList';

const apps: { id: AppId; icon: string; name: string }[] = [
  { id: 'mail', icon: '✉', name: '郵件' },
  { id: 'files', icon: '🗂', name: '卷宗' },
  { id: 'cctv', icon: '📹', name: '監視器' },
  { id: 'phone', icon: '☎', name: '通聯紀錄' },
];

export function Desk() {
  const { app, doc, collected, openApp, openDoc, collect, goToTrial } = useGame();
  const docs = episode.documents.filter((d) => d.app === app);
  const current = episode.documents.find((d) => d.id === doc);

  return (
    <main className="desk">
      <header className="taskbar">
        <span>{episode.title}</span>
        <button className="primary" onClick={goToTrial}>
          前往法庭 ⚖
        </button>
      </header>

      <nav className="apps">
        {apps.map((a) => (
          <button
            key={a.id}
            className={a.id === app ? 'app active' : 'app'}
            onClick={() => openApp(a.id === app ? null : a.id)}
          >
            <span className="icon">{a.icon}</span>
            {a.name}
          </button>
        ))}
      </nav>

      {app && (
        <section className="window" aria-label={apps.find((a) => a.id === app)!.name}>
          {current ? (
            <article className="document">
              <button className="link" onClick={() => openDoc(null)}>
                ◂ 返回列表
              </button>
              <h3>{current.title}</h3>
              {current.from && <p className="meta">寄件者：{current.from}</p>}
              <pre>{current.body}</pre>
              {current.evidence.map((id) => {
                const e = episode.evidence.find((x) => x.id === id)!;
                const has = collected.includes(id);
                return (
                  <button key={id} disabled={has} onClick={() => collect(id)}>
                    {has ? `已列為證據：${e.name}` : `列為證據：${e.name}`}
                  </button>
                );
              })}
            </article>
          ) : (
            <ul className="doclist">
              {docs.map((d) => (
                <li key={d.id}>
                  <button className="link" onClick={() => openDoc(d.id)}>
                    {d.title}
                  </button>
                  {d.from && <span className="meta">{d.from}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <aside className="board">
        <h2>證據板</h2>
        <EvidenceList />
      </aside>
    </main>
  );
}
