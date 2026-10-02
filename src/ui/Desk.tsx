import { useEffect, useState } from 'react';
import * as desk from '../engine/episode/desk';
import * as discovery from '../engine/episode/discovery';
import type { DeskScene } from '../engine/episode/schema';
import { deskState, heldArgs, useEpisode } from '../engine/game';
import { play } from '../engine/sound';
import { useT } from '../i18n';
import {
  CardPick,
  EvidenceDrawer,
  KindFilter,
  timeGroups,
  useKindFilter,
  useWide,
} from './Evidence';
import { MarkLines, Ruling } from './Marks';
import { useScope } from './lang';
import { useCardPick } from './pick';
import { Speech } from './Portrait';
import { relationMark, RelationPicker } from './RelationPicker';
import { Shell, Tabs } from './Shell';
import { Timeline } from './Timeline';

// 證據庫和左下的證據抽屜內容一模一樣，所以只留抽屜：它在每個畫面都叫得出來。
type App = 'mail' | 'docs' | 'board' | 'jobs' | 'court' | 'discovery';
const labels: Record<App, string> = {
  mail: '郵件',
  docs: '卷宗',
  board: '證據板',
  jobs: '委託',
  court: '法院系統',
  discovery: '開示',
};

/** 第二幕的桌面：盧卡斯的工作電腦，每個 App 是一個系統入口（企劃書 6.1）。 */
export function Desk({ scene }: { scene: DeskScene }) {
  const { progress, advance, clearReport, resolveTwist, wrapDesk } = useEpisode();
  const t = useT();
  const scope = useScope();
  const st = deskState(progress, scene);
  const [app, setApp] = useState<App>('mail');
  const held = desk.heldCards(scene, st, progress.cards);
  const unread = scene.mail.filter((m) => st.mail.includes(m.id) && !st.openMail.includes(m.id));
  const finished = desk.done(scene, st);
  const hoursDrop = useBump(-st.hours);

  if (st.report.length) {
    // 聲請的結果印成裁定單（設計稿 inner-voice 2e）：旁白那句是法官的話，章蓋在紙上。
    const same = (a: unknown) => JSON.stringify(a) === JSON.stringify(st.report);
    const m = scene.motions.find((x) => same(x.granted) || same(x.denied));
    const ok = m ? same(m.granted) : false;
    const a = m && desk.motionAttempt(st, m.id);
    const quote = m && st.report.find((l) => l.who === '旁白');
    const rest = m
      ? st.report.filter(
          (l) => l !== quote && !(l.mark?.kind === 'stamp' && !l.text.includes('｜')),
        )
      : st.report;
    return (
      <main className="scene report">
        <p className="eyebrow">{m ? t('回報・法院系統') : t('回報')}</p>
        {m && a && (
          <div className="ruling-wrap">
            <Ruling
              label={t(m.label, scope)}
              basis={a.basis ? t(a.basis, scope) : undefined}
              wrongBasis={!ok && !!a.basis && a.basis !== m.basis}
              request={a.request ? t(a.request, scope) : undefined}
              quote={quote ? t(quote.text, scope).replace(/^「|」$/g, '') : undefined}
              verdict={ok ? '准予' : '駁回'}
            />
          </div>
        )}
        <div className="lines">
          <MarkLines lines={rest} />
        </div>
        <button className="primary next" onClick={clearReport}>
          {t('回到桌面')}
        </button>
      </main>
    );
  }

  // 對方聲請撤銷傳票，事務所要你收手。這個抉擇擋在桌面前面，非決定不可。
  const twist = desk.pendingTwist(scene, st);
  if (twist?.twist)
    return (
      <main className="scene report">
        <p className="eyebrow">{t('事務所')}</p>
        <div className="lines">
          {twist.twist.lines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <div className="choices">
          {twist.twist.options.map((o, i) => (
            <button key={i} onClick={() => resolveTwist(twist.id, i)}>
              {t(o.text, scope)}
            </button>
          ))}
        </div>
      </main>
    );

  if (finished)
    return (
      <main className="scene report">
        <p className="eyebrow">{t(scene.act, scope)}</p>
        <div className="lines">
          {scene.goalLines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={advance}>
          {t('開庭')}
        </button>
      </main>
    );

  const pending = discovery.unanswered(scene, st, progress.cards);
  const apps = (Object.keys(labels) as App[])
    .filter((id) => id !== 'discovery' || scene.discovery.length > 0)
    .map((id) => ({
      id,
      label: t(labels[id]),
      badge:
        id === 'mail' && unread.length > 0
          ? unread.length
          : id === 'discovery' && pending > 0
            ? pending
            : undefined,
    }));

  return (
    <Shell
      resetKey={app}
      head={
        <header className="taskbar">
          <span
            className={hoursDrop ? 'hours drop' : 'hours'}
            aria-label={t('剩餘工時 {n} 小時', { n: st.hours })}
          >
            <strong>{st.hours}</strong> {t('工時')}
          </span>
          <span className="muted small">{t(scene.deadline, scope)}</span>
        </header>
      }
      tabs={<Tabs label={t('應用程式')} value={app} onPick={setApp} items={apps} />}
      foot={
        <>
          <EvidenceDrawer />
          {desk.canWrap(scene, st, progress.cards) ? (
            <WrapButton hours={st.hours} onWrap={wrapDesk} />
          ) : (
            st.confirmed.includes(scene.goal) &&
            pending > 0 && (
              <button className="wide" onClick={() => setApp('discovery')}>
                {t('結束調查')} <span className="cost">{t('開示未回應 {n}', { n: pending })}</span>
              </button>
            )
          )}
        </>
      }
    >
      {app === 'mail' && <Mail scene={scene} />}
      {app === 'docs' && <Docs scene={scene} />}
      {app === 'board' && <Board scene={scene} held={held} />}
      {app === 'jobs' && <Jobs scene={scene} held={held} />}
      {app === 'court' && <Motions scene={scene} held={held} />}
      {app === 'discovery' && <Discovery scene={scene} />}
    </Shell>
  );
}

const RESPONSES: { id: discovery.Response; label: string }[] = [
  { id: 'produce', label: '交出' },
  { id: 'privilege', label: '主張特權' },
  { id: 'overbroad', label: '範圍過廣' },
];

/** 玩家看到的結果。硬藏（concealed）當下看起來跟特權成立一樣，之後才會被揭穿。 */
const RESULT: Record<discovery.Result, string> = {
  produced: '已交出',
  withheld: '特權成立',
  concealed: '特權成立',
  strained: '特權勉強成立',
  narrowed: '範圍過廣成立',
  compelled: '裁定照交',
};

/** 證據開示：對方的每項請求選一種回應，送出就定案。 */
function Discovery({ scene }: { scene: DeskScene }) {
  const { progress, respondDiscovery } = useEpisode();
  const t = useT();
  const scope = useScope();
  const st = deskState(progress, scene);
  const done = discovery.answered(st);
  const [pick, setPick] = useState<Record<string, discovery.Response>>({});
  const name = (id: string) => t(scene.cards.find((c) => c.id === id)?.name ?? id, scope);
  return (
    <ol className="stack discovery">
      {discovery.openRequests(scene, st, progress.cards).map((r, i) => {
        const res = done[r.id];
        const sel = pick[r.id];
        return (
          <li key={r.id} className={res ? 'panel req answered' : 'panel req'}>
            <p className="eyebrow">{t('請求 {n}', { n: i + 1 })}</p>
            <p className="claim-text">{t(r.text, scope)}</p>
            <ul className="req-cards">
              {r.cards.map((c) => (
                <li key={c}>{name(c)}</li>
              ))}
            </ul>
            {res ? (
              <p className={`req-result ${res}`}>{t(RESULT[res])}</p>
            ) : (
              <div
                className="req-actions"
                role="group"
                aria-label={t('請求 {n} 的回應', { n: i + 1 })}
              >
                {RESPONSES.map((o) => (
                  <button
                    key={o.id}
                    aria-pressed={sel === o.id}
                    onClick={() => setPick({ ...pick, [r.id]: o.id })}
                  >
                    {t(o.label)}
                  </button>
                ))}
                <button
                  className="primary"
                  disabled={!sel}
                  onClick={() => sel && respondDiscovery(r.id, sel)}
                >
                  {t('送出')}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Mail({ scene }: { scene: DeskScene }) {
  const { progress, openMail } = useEpisode();
  const t = useT();
  const scope = useScope();
  const st = deskState(progress, scene);
  const [open, setOpen] = useState<string | null>(null);
  const inbox = scene.mail.filter((m) => st.mail.includes(m.id));
  const mail = inbox.find((m) => m.id === open);
  if (mail)
    return (
      <article className="panel doc">
        <button className="link" onClick={() => setOpen(null)}>
          {t('← 收件匣')}
        </button>
        <h2>{t(mail.subject, scope)}</h2>
        <p className="muted">{t('寄件者：{from}', { from: t(mail.from, scope) })}</p>
        {mail.body.map((b) => (
          <p key={b}>{t(b, scope)}</p>
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
            <strong>{t(m.subject, scope)}</strong>
            <span className="muted">{t(m.from, scope)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 文件以句子為單位。點一句話可以標記，命中關鍵事實才生成卡片，點錯沒有懲罰。 */
function Docs({ scene }: { scene: DeskScene }) {
  const { progress, openDoc, mark } = useEpisode();
  const t = useT();
  const scope = useScope();
  const st = deskState(progress, scene);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const doc = scene.docs.find((d) => d.id === open);
  if (doc)
    return (
      <article className="panel doc">
        <button className="link" onClick={() => setOpen(null)}>
          {t('← 卷宗')}
        </button>
        <h2>{t(doc.title, scope)}</h2>
        <p className="muted">{t(doc.from, scope)}</p>
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
                  <span>{t(l.text, scope)}</span>
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
            <strong>{t(d.title, scope)}</strong>
            <span className="muted">{t(d.from, scope)}</span>
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
/**
 * 證據板（設計稿 ui/design-review/board-redesign）：左邊疑問清單、中間工作台、右邊證據欄。
 * 同一個疑問的三步由上到下排在一頁：① 你的答案 ② 連線台 ③ 我的發現與論點。
 * 手機上一次只看一欄：先挑疑問，再進工作台。
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
  const t = useT();
  const scope = useScope();
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
  const nameOf = (id: string) => pool.find((c) => c.id === id)?.name ?? id;
  const found = desk.findings(scene, st).map((l, i) => ({
    id: l.id,
    name: `發現 ${i + 1}`,
    kind: '發現' as const,
    text: l.text,
    pair: [nameOf(l.cards[0]), nameOf(l.cards[1])] as const,
    relation: l.relation,
    conclusion: l.conclusion,
  }));
  // 疑問的答案都是發現；論點只在證據欄出現，拿來連線（試玩回報：兩邊各列一次太亂）。
  const answers = found;
  const showPair = (p: readonly [string, string]) => `${t(p[0], scope)} ⟷ ${t(p[1], scope)}`;
  // 還沒解鎖的疑問不列出來，免得題目先把還沒查到的線索講出來。
  const questions = desk.openQuestions(scene, st, progress.cards);
  const firstOpen = questions.find((q) => !st.confirmed.includes(q.id));
  const wide = useWide();
  // 電腦版一打開就停在第一題還沒確認的疑問；手機版先看清單。
  const [view, setView] = useState<string | null>(() =>
    wide ? (firstOpen?.id ?? 'timeline') : null,
  );
  const shown = view ?? (wide ? (firstOpen?.id ?? 'timeline') : null);
  const q = questions.find((x) => x.id === shown);
  // 電腦版：右邊證據欄的卡片直接點就放上連線台（先 A 再 B）。
  const linking = wide && !!q;
  const poolIds = pool.map((c) => c.id).join();
  const picked = st.link.cards.join();
  useEffect(() => {
    if (!linking) return;
    useCardPick.setState({
      pool: poolIds.split(','),
      on: picked ? picked.split(',') : [],
      pick: toggleLinkCard,
    });
    return () => useCardPick.setState({ pool: [], on: [], pick: undefined });
  }, [linking, poolIds, picked, toggleLinkCard]);
  const [kind, setKind, showKind] = useKindFilter();
  // 連錯、交錯的那一下才抖；之後重開畫面不再抖。
  const badShake = useBump(st.badLinks);
  // 剛連出來的那條發現亮一下；畫面一打開就有的不亮。
  const fresh = useBump(st.found.length) ? st.found[st.found.length - 1] : null;
  const missTotal = Object.values(st.tried ?? {}).reduce((n, v) => n + v.length, 0);
  const missShake = useBump(missTotal) ? shown : null;
  const status = (id: string) =>
    st.confirmed.includes(id)
      ? 'done'
      : st.attempts[id]?.cards.length || st.feedback[id]
        ? 'open'
        : 'idle';
  const num = (i: number) => String(i + 1).padStart(2, '0');
  const timedN = pool.filter((c) => 'time' in c && c.time).length;

  const list = (
    <nav className="q-list" aria-label={t('疑問')}>
      <p className="eyebrow">{t('已確認 {n}', { n: st.confirmed.length })}</p>
      <ul>
        {/* 時間線排在最上面：整理時間是每個疑問的底（試玩回報：放在最下面要捲才看得到）。 */}
        <li>
          <button
            className="q-item timeline-entry"
            aria-current={shown === 'timeline'}
            onClick={() => setView('timeline')}
          >
            <span className="q-num">{t('時間線')}</span>
            <span className="q-text">{t('把事件排在時間軸上')}</span>
            <span className="q-meta">
              <span>{t('已排 {n} / {m}', { n: st.timeline.length, m: timedN })}</span>
            </span>
            <span className="tl-meter" aria-hidden>
              <i style={{ width: `${timedN ? (st.timeline.length / timedN) * 100 : 0}%` }} />
            </span>
          </button>
        </li>
        {questions.map((x, i) => {
          const s = status(x.id);
          return (
            <li key={x.id}>
              <button
                className={`q-item ${s}`}
                aria-current={shown === x.id}
                onClick={() => setView(x.id)}
              >
                <span className="q-num">{num(i)}</span>
                <span className="q-text">{t(x.text, scope)}</span>
                <span className="q-meta">
                  {s === 'done' ? (
                    <>
                      <span className="good">✓ {t('已確認')}</span>
                      <span>{t(x.argument.name, scope).split(/：|: /)[0]}</span>
                    </>
                  ) : (
                    <span>{s === 'open' ? t('進行中') : t('尚未開始')}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {/* 還沒出現的疑問畫成鎖住的空格：玩家看得出案子還沒查完（試玩回報）。 */}
        {Array.from({ length: scene.questions.length - questions.length }, (_, i) => (
          <li key={`locked-${i}`}>
            <span className="q-item locked" aria-label={t('尚未出現的疑問')}>
              <span className="q-num">{num(questions.length + i)}</span>
              <span className="q-text">{t('？')}</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );

  const slot = (i: number) => {
    const c = pool.find((x) => x.id === st.link.cards[i]);
    const tag = i === 0 ? 'A' : 'B';
    return (
      <li className={c ? 'slot-card filled' : 'slot-card'}>
        <span className="slot-tag" aria-hidden>
          {tag}
        </span>
        {c ? (
          <button
            className="slot-clear"
            onClick={() => toggleLinkCard(c.id)}
            aria-label={t('拿下 {name}', { name: t(c.name, scope) })}
          >
            {t(c.name, scope)}
          </button>
        ) : null}
      </li>
    );
  };

  const bench = (
    <section className="panel step links">
      <h3 className="step-head">{t('連線')}</h3>
      <div
        className={
          (desk.canConnect(st) ? 'link-bench ready' : 'link-bench') +
          (badShake ? (st.linkMiss === 'relation' ? ' shake-rel' : ' shake') : '')
        }
      >
        <ul className="slots-row">
          {slot(0)}
          <li className="link-knot" aria-hidden>
            <span className={st.link.relation ? 'set' : undefined}>
              {st.link.relation ? relationMark[st.link.relation] : t('？')}
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
        <div className="row bench-foot">
          <span />
          <button className="primary" disabled={!desk.canConnect(st)} onClick={connect}>
            {t('連起來')}
          </button>
        </div>
        {st.linkNote && (
          // 連錯：兩張卡抖一下、頂端工時閃紅，也寫出來（體驗評測：只抖一下，第一次玩看不懂）。
          // 連成功也不另外寫：新的發現便條會亮一下，內容就在便條上（試玩回報：兩處同一句太雜）。
          <p
            role="status"
            className={
              st.linkNote.startsWith('連起來了')
                ? 'sr-only'
                : st.linkMiss
                  ? 'board-note bad'
                  : 'board-note'
            }
          >
            {t(st.linkNote, scope)}
          </p>
        )}
      </div>
      {!wide && (
        <details className="bench-cards">
          <summary>{t('挑卡片（{n}）', { n: pool.length })}</summary>
          <KindFilter items={pool} value={kind} onPick={setKind} />
          <ul className="stack">
            {timeGroups(
              pool.filter((c) => showKind(c) || st.link.cards.includes(c.id)),
              (c) => (
                <li key={c.id}>
                  <CardPick
                    item={c}
                    on={st.link.cards.includes(c.id)}
                    verb={
                      st.link.cards[0] === c.id ? 'A' : st.link.cards[1] === c.id ? 'B' : undefined
                    }
                    onPick={() => toggleLinkCard(c.id)}
                  />
                </li>
              ),
            )}
          </ul>
        </details>
      )}
    </section>
  );

  const work = q
    ? (() => {
        const a = st.attempts[q.id] ?? { cards: [] };
        const done = st.confirmed.includes(q.id);
        const i = questions.indexOf(q);
        const item = (id: string) => answers.find((c) => c.id === id);
        return (
          <section className="workbench chain" aria-label={t(q.text, scope)}>
            <header className="wb-head">
              <p className="eyebrow">{t('疑問 {n}', { n: num(i) })}</p>
              <h2>{t(q.text, scope)}</h2>
            </header>
            <section className={done ? 'panel step answer done' : 'panel step answer'}>
              <h3 className="step-head">{t('答案')}</h3>
              {done ? (
                <p className="good">{t('已確認：{name}', { name: t(q.argument.name, scope) })}</p>
              ) : (
                <>
                  <ul
                    className={
                      missShake === q.id ? 'slots-row answer-slots shake' : 'slots-row answer-slots'
                    }
                  >
                    {Array.from({ length: q.answer.length }, (_, k) => {
                      const c = item(a.cards[k]);
                      return (
                        <li key={k} className={c ? 'slot-card filled' : 'slot-card'}>
                          {c ? (
                            <button
                              className="slot-clear"
                              onClick={() => toggleCard(q.id, c.id)}
                              aria-label={t('從答案拿下 {name}', { name: t(c.name, scope) })}
                            >
                              <strong>{showPair(c.pair)}</strong>
                              <span className="muted small">{t(c.relation)}</span>
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="row answer-foot">
                    <span
                      className="tries"
                      role="img"
                      aria-label={t('交錯 {n} 次', { n: desk.misses(st, q.id) })}
                    >
                      {Array.from({ length: Math.max(3, desk.misses(st, q.id)) }, (_, k) => (
                        <i key={k} className={k < desk.misses(st, q.id) ? 'miss' : undefined} />
                      ))}
                    </span>
                    {st.feedback[q.id] && (
                      <p role="status" className="sr-only">
                        {t(st.feedback[q.id], scope)}
                      </p>
                    )}
                    <button
                      className="primary"
                      disabled={!desk.canSubmit(scene, st, q.id, progress.cards)}
                      onClick={() => submit(q.id)}
                    >
                      {t('提交')} <span className="cost">{t('−1 時')}</span>
                    </button>
                  </div>
                </>
              )}
              {done && st.feedback[q.id] && (
                <p role="status" className="board-note">
                  {t(st.feedback[q.id], scope)}
                </p>
              )}
            </section>
            {bench}
            <section className="panel step mine">
              <h3 className="step-head">{t('發現')}</h3>
              {found.length === 0 ? (
                <div className="slot-card" aria-label={t('還沒有發現')} />
              ) : (
                // 一條發現就是一張便條：編號與關係、連起來的兩張卡、連線的內容；點了放進答案。
                <ol className="found-list">
                  {found.map((f) => {
                    const used = a.cards.includes(f.id);
                    return (
                      <li key={f.id}>
                        <button
                          className={f.id === fresh ? 'found fresh' : 'found'}
                          aria-pressed={used}
                          aria-label={`${t(f.name, scope)}${t('：')}${showPair(f.pair)}`}
                          disabled={done}
                          onClick={() => toggleCard(q.id, f.id)}
                        >
                          <span className="found-head">
                            {t(f.name, scope)}
                            <span>{t(f.relation)}</span>
                            {used && <span className="good">{t('已放進答案')}</span>}
                          </span>
                          <strong className="found-pair">{showPair(f.pair)}</strong>
                          <span className="found-text">{t(f.text, scope)}</span>
                          {f.conclusion && (
                            <span className="found-note">{t(f.conclusion.text, scope)}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </section>
        );
      })()
    : shown === 'timeline' && (
        <Timeline
          cards={pool}
          placed={st.timeline}
          onToggle={toggleTimeline}
          onMove={moveTimeline}
          marks={scene.timelineMarks.map((m) => ({
            ...m,
            detail: m.kind === 'gap' ? gapDetail(scene, (s) => t(s, scope)) : undefined,
          }))}
        />
      );

  if (!wide)
    return shown ? (
      <div className="stack board-one">
        <button className="link back" onClick={() => setView(null)}>
          {t('← 全部疑問')}
        </button>
        {work}
      </div>
    ) : (
      list
    );
  return (
    <div className="board3">
      {list}
      <div className="board-work">{work}</div>
    </div>
  );
}

/**
 * 法院系統：提出動議與聲請傳票。三樣都要選對（企劃書 6.6）。
 * 一份聲請就有三組選項，所以一次只處理一份。
 */
function Motions({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, pickBasis, pickRequest, toggleSupport, fileMotion } = useEpisode();
  const t = useT();
  const scope = useScope();
  const st = deskState(progress, scene);
  const pool = scene.cards.filter((c) => held.includes(c.id));
  const args = heldArgs(progress);
  // 一打開就停在還沒裁定的那一份上。
  const open = scene.motions.find((m) => desk.motionAttempt(st, m.id).ruling !== 'granted');
  const [pick, setPick] = useState<string>(open?.id ?? scene.motions[0]?.id ?? '');
  if (scene.motions.length === 0) return <p className="muted">{t('目前沒有可以提出的聲請。')}</p>;
  const m = scene.motions.find((x) => x.id === pick) ?? scene.motions[0];
  const a = desk.motionAttempt(st, m.id);
  const missing = m.needs.filter((n) => !held.includes(n));
  return (
    <div className="stack">
      {scene.motions.length > 1 && (
        <Tabs
          label={t('聲請')}
          value={pick}
          onPick={setPick}
          items={scene.motions.map((x, i) => ({
            id: x.id,
            label: t('聲請 {n}', { n: i + 1 }),
            done: desk.motionAttempt(st, x.id).ruling === 'granted',
          }))}
        />
      )}
      <section className="panel job">
        <strong>{t(m.label, scope)}</strong>
        <p className="muted">{t('{n} 工時', { n: m.cost })}</p>
        <p>{t(m.detail, scope)}</p>
        {a.ruling === 'granted' && <p className="good">{t('法官准了。')}</p>}
        {a.ruling === 'denied' && (
          <p className="bad-text">
            {t('駁回。法官記得你浪費了他的時間。修正後可以重送，工時照扣。')}
          </p>
        )}
        {a.ruling !== 'granted' &&
          (missing.length ? (
            <p className="muted">{t('還缺前提：先把相關的論點確認起來。')}</p>
          ) : (
            <>
              <fieldset className="relations">
                <legend>{t('法律依據')}</legend>
                <div className="stack">
                  {m.bases.map((b) => (
                    <button
                      key={b}
                      role="radio"
                      aria-checked={a.basis === b}
                      className={a.basis === b ? 'wide on' : 'wide'}
                      onClick={() => pickBasis(m.id, b)}
                    >
                      {t(b, scope)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="relations">
                <legend>{t('請求')}</legend>
                <div className="stack">
                  {m.requests.map((r) => (
                    <button
                      key={r}
                      role="radio"
                      aria-checked={a.request === r}
                      className={a.request === r ? 'wide on' : 'wide'}
                      onClick={() => pickRequest(m.id, r)}
                    >
                      {t(r, scope)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="relations">
                <legend>{t('支撐（{n} 張）', { n: m.support.length })}</legend>
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
                {t('送出（{n} 工時）', { n: m.cost })}
              </button>
            </>
          ))}
      </section>
    </div>
  );
}

function Jobs({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, commission } = useEpisode();
  const t = useT();
  const scope = useScope();
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
    return <p className="muted">{t('目前沒有可以委託的事。多讀卷宗、多問委託人。')}</p>;
  return (
    <ul className="stack">
      {shown.map((j) => {
        const done = st.jobs.includes(j.id);
        return (
          <li key={j.id} className="panel job">
            <strong>{t(j.label, scope)}</strong>
            <p className="muted">
              {t(j.who, scope)}
              {t('・')}
              {t('{n} 工時', { n: j.cost })}
            </p>
            <p>{t(j.detail, scope)}</p>
            {/* 前提寫在卡上：沒寫的話，玩家會以為不必任何證據就能委託。 */}
            {j.needs.length > 0 && !done && (
              <ul className="needs" aria-label={t('需要')}>
                {j.needs.map((n) => (
                  <li key={n} className={held.includes(n) ? 'have' : 'lack'}>
                    {held.includes(n) ? '✓' : t('需要')} {t(nameOf(n), scope)}
                  </li>
                ))}
              </ul>
            )}
            {done ? (
              <p className="good">{t('已回報。')}</p>
            ) : (
              <button
                className="primary"
                disabled={!desk.canCommission(scene, st, j.id, progress.cards)}
                onClick={() => commission(j.id)}
              >
                {t('委託（{n} 工時）', { n: j.cost })}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 回報裡寫好的間距說明（例如「22:44 抵達 → 22:47 刷卡」），時間線上的間距標記沿用。 */
/**
 * 結束調查要按兩次：第一次只把按鈕換成確認，標出還剩幾小時（試玩回報：解完一題就以為查完了）。
 * 四秒沒按就恢復原狀。
 */
function WrapButton({ hours, onWrap }: { hours: number; onWrap: () => void }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return armed ? (
    <button className="primary wide armed" onClick={onWrap}>
      {t('確定結束')} <span className="cost">{t('剩 {n} 時', { n: hours })}</span>
    </button>
  ) : (
    <button className="wide" onClick={() => setArmed(true)}>
      {t('結束調查')}
    </button>
  );
}

/** 數字變大之後的 600ms 回傳 true，拿來觸發一次性的動畫。 */
function useBump(n: number) {
  const [base, setBase] = useState(n);
  useEffect(() => {
    if (n === base) return;
    const t = setTimeout(() => setBase(n), 600);
    return () => clearTimeout(t);
  }, [n, base]);
  return n > base;
}

function gapDetail(scene: DeskScene, tr: (s: string) => string) {
  for (const j of scene.jobs)
    for (const l of j.report)
      if (l.mark?.kind === 'gap') return tr(l.text).replace(/\s*→\s*/, '\u3000→\u3000');
  return undefined;
}
