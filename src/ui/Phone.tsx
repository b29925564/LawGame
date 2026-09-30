import { phoneView, type PhoneView } from '../engine/episode/phone';
import type { PhoneScene } from '../engine/episode/schema';
import { sceneChoices, useEpisode } from '../engine/game';

/** 冷開場：伊森的手機畫面。 */
export function Phone({ scene }: { scene: PhoneScene }) {
  const { progress, advance, choose } = useEpisode();
  const v = phoneView(scene, progress.step, sceneChoices(progress));

  if (v.screen === 'caption' && v.step.do === 'caption')
    return (
      <main className="cine" aria-live="polite">
        {v.time && <p className="cine-time">{v.time}</p>}
        <p className="cine-text">{v.step.text}</p>
        <button className="cine-next" onClick={advance}>
          繼續
        </button>
      </main>
    );

  return (
    <main className="phone-stage">
      <div className="phone" role="region" aria-label={`${scene.owner}的手機`}>
        <div className="phone-status">
          <span>{v.time}</span>
          <span aria-hidden>▂▄▆ 62%</span>
        </div>
        <Screen v={v} owner={scene.owner} advance={advance} choose={choose} />
      </div>
    </main>
  );
}

function Screen({
  v,
  owner,
  advance,
  choose,
}: {
  v: PhoneView;
  owner: string;
  advance: () => void;
  choose: (i: number) => void;
}) {
  const s = v.step;
  switch (s.do) {
    case 'notify':
      return (
        <div className="phone-body lock">
          <p className="lock-clock">{v.time}</p>
          <button className="notif" onClick={advance} aria-label={`打開 ${s.message.from} 的訊息`}>
            <span className="notif-app">聊天</span>
            <strong>{s.message.from}</strong>
            <span>{s.message.text}</span>
          </button>
        </div>
      );
    case 'say':
    case 'retract':
    case 'choose':
      if (s.do === 'choose' && s.mode === 'talk') break;
      return (
        <div className="phone-body chat">
          <header className="chat-head">{v.thread}</header>
          <ol className="bubbles" aria-live="polite">
            {(v.threads[v.thread ?? ''] ?? []).map((b, i) => (
              <li
                key={i}
                className={`bubble${b.mine ? ' mine' : ''}${b.retracted ? ' retracted' : ''}`}
              >
                {b.retracted ? '此訊息已被收回' : b.text}
              </li>
            ))}
          </ol>
          {s.do === 'choose' && v.chosen === null ? (
            <div className="replies" role="group" aria-label="回覆">
              {s.options.map((o, i) => (
                <button key={i} onClick={() => choose(i)}>
                  {o.text}
                </button>
              ))}
            </div>
          ) : (
            <Next onClick={advance} />
          )}
        </div>
      );
    case 'ride':
      return (
        <div className="phone-body ride">
          <header className="chat-head">叫車</header>
          <dl className="ride-route">
            <dt>上車</dt>
            <dd>{s.from}</dd>
            <dt>下車</dt>
            <dd>{s.to}</dd>
          </dl>
          <p className="muted">最近的司機：{s.driver}，2 分鐘</p>
          <button className="primary" onClick={advance}>
            叫車
          </button>
        </div>
      );
    case 'badge':
      return (
        <div className="phone-body badge">
          <p className="muted">{s.place}</p>
          <div className="reader" aria-hidden>
            ◉
          </div>
          <button className="primary" onClick={advance}>
            感應員工證
          </button>
        </div>
      );
    case 'door':
      return (
        <div className="phone-body door">
          <p>{s.text}</p>
          <button className="primary" onClick={advance}>
            {s.action}
          </button>
        </div>
      );
  }
  // talk 與 choose(talk)：手機收進口袋，畫面是字幕。
  return (
    <div className="phone-body talk">
      <ol className="subtitles" aria-live="polite">
        {v.talk.map((l, i) => (
          <li key={i} className={l.who === owner ? 'own' : ''}>
            <strong>{l.who}</strong>
            {l.text}
          </li>
        ))}
      </ol>
      {s.do === 'choose' && v.chosen === null ? (
        <div className="replies" role="group" aria-label={`${owner}要說什麼`}>
          {s.options.map((o, i) => (
            <button key={i} onClick={() => choose(i)}>
              {o.text}
            </button>
          ))}
        </div>
      ) : (
        <Next onClick={advance} />
      )}
    </div>
  );
}

function Next({ onClick }: { onClick: () => void }) {
  return (
    <button className="phone-next" onClick={onClick}>
      繼續
    </button>
  );
}
