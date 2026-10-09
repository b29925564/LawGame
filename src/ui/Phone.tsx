import { phoneView, type PhoneView } from '../engine/episode/phone';
import type { PhoneScene } from '../engine/episode/schema';
import { sceneChoices, useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { useScope } from './lang';
import { Redaction } from './Redaction';

/** 冷開場：伊森的手機畫面。 */
export function Phone({ scene }: { scene: PhoneScene }) {
  const { progress, advance, choose } = useEpisode();
  const t = useT();
  const scope = useScope();
  const v = phoneView(scene, progress.step, sceneChoices(progress));

  if (v.screen === 'caption' && v.step.do === 'caption')
    return (
      <main className="cine" aria-live="polite">
        {v.time && <p className="cine-time">{t(v.time, scope)}</p>}
        <p className="cine-text">{t(v.step.text, scope)}</p>
        <button className="cine-next" onClick={advance}>
          {t('繼續')}
        </button>
      </main>
    );

  return (
    <main className="phone-stage">
      <div
        className="phone"
        role="region"
        aria-label={t('{owner}的手機', { owner: t(scene.owner, scope) })}
      >
        <div className="phone-status">
          <span>{v.time && t(v.time, scope)}</span>
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
  const t = useT();
  const scope = useScope();
  switch (s.do) {
    case 'notify':
      return (
        <div className="phone-body lock">
          <p className="lock-clock">{v.time && t(v.time, scope)}</p>
          <button
            className="notif"
            onClick={advance}
            aria-label={t('打開 {from} 的訊息', { from: t(s.message.from, scope) })}
          >
            <span className="notif-app">{t('聊天')}</span>
            <strong>{t(s.message.from, scope)}</strong>
            <span>{t(s.message.text, scope)}</span>
          </button>
          <span className="notif-hint" aria-hidden>
            {t('點一下查看')}
          </span>
        </div>
      );
    case 'say':
    case 'retract':
    case 'choose':
      if (s.do === 'choose' && s.mode === 'talk') break;
      return (
        <div className="phone-body chat">
          <header className="chat-head">{v.thread && t(v.thread, scope)}</header>
          <ol className="bubbles" aria-live="polite">
            {(v.threads[v.thread ?? ''] ?? []).map((b, i) => (
              <li
                key={i}
                className={`bubble${b.mine ? ' mine' : ''}${b.retracted ? ' retracted' : ''}`}
              >
                {b.retracted ? (
                  <Redaction label={t('此訊息已被收回')} meta={b.retractedAt} />
                ) : (
                  t(b.text, scope)
                )}
              </li>
            ))}
          </ol>
          {s.do === 'choose' && v.chosen === null ? (
            <div className="replies" role="group" aria-label={t('回覆')}>
              {s.options.map((o, i) => (
                <button key={i} onClick={() => choose(i)}>
                  {t(o.text, scope)}
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
          <header className="chat-head">{t('叫車')}</header>
          <dl className="ride-route">
            <dt>{t('上車')}</dt>
            <dd>{t(s.from, scope)}</dd>
            <dt>{t('下車')}</dt>
            <dd>{t(s.to, scope)}</dd>
          </dl>
          <p className="muted">
            {t('最近的司機：{driver}，2 分鐘', { driver: t(s.driver, scope) })}
          </p>
          <button className="primary" onClick={advance}>
            {t('叫車')}
          </button>
        </div>
      );
    case 'badge':
      return (
        <div className="phone-body badge">
          <p className="muted">{t(s.place, scope)}</p>
          <div className="reader" aria-hidden>
            ◉
          </div>
          <button className="primary" onClick={advance}>
            {t('感應員工證')}
          </button>
        </div>
      );
    case 'door':
      return (
        <div className="phone-body door">
          <p>{t(s.text, scope)}</p>
          <button className="primary" onClick={advance}>
            {t(s.action, scope)}
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
            <strong>{t(l.who, scope)}</strong>
            {t(l.text, scope)}
          </li>
        ))}
      </ol>
      {s.do === 'choose' && v.chosen === null ? (
        <div
          className="replies"
          role="group"
          aria-label={t('{owner}要說什麼', { owner: t(owner, scope) })}
        >
          {s.options.map((o, i) => (
            <button key={i} onClick={() => choose(i)}>
              {t(o.text, scope)}
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
  const t = useT();
  return (
    <button className="phone-next" onClick={onClick}>
      {t('繼續')}
    </button>
  );
}
