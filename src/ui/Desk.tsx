import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as desk from '../engine/episode/desk';
import * as discovery from '../engine/episode/discovery';
import type { DeskScene } from '../engine/episode/schema';
import * as branch from '../engine/episode/branch';
import { branchContext, deskState, heldArgs, useEpisode } from '../engine/game';
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
import { CommitBar } from './Commit';
import { EffectLines, effectsIf } from './Effects';
import { MarkLines } from './Marks';
import { ExhibitTag, exhibitNo, FilingThumb, Pleading, Written } from './Pleading';
import { useScope } from './lang';
import { useCardPick } from './pick';
import { Speech } from './Portrait';
import { RelationPicker } from './RelationPicker';
import { Cork, type CorkItem } from './Cork';
import { Redaction } from './Redaction';
import { Shell, Tabs } from './Shell';
import { Timeline } from './Timeline';
import { Recap } from './ActCard';

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
  // 翻開卷宗是資料夾聲，其他程式是翻頁聲；點同一個不出聲。
  const pickApp = (next: App) => {
    if (next !== app) play(next === 'docs' ? 'folder' : 'page');
    setApp(next);
  };
  const held = desk.heldCards(scene, st, progress.cards);
  const unread = scene.mail.filter((m) => st.mail.includes(m.id) && !st.openMail.includes(m.id));
  // 卷宗也掛未讀數：新進來的文件（例如法官的裁定）不會被跳過（體驗評測、劇本與內容）。
  const unreadDocs = scene.docs.filter((d) => !st.readDocs.includes(d.id)).length;
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
            <Pleading
              m={m}
              n={scene.motions.indexOf(m) + 1}
              request={<Written text={a.request && t(a.request, scope)} />}
              basis={<Written text={a.basis && t(a.basis, scope)} />}
              support={a.support.map((id, i) => {
                const c = [...heldArgs(progress), ...scene.cards].find((x) => x.id === id);
                return (
                  <span key={id} className="blank filled exhibit">
                    {c ? (
                      <ExhibitTag
                        name={t(c.name, scope)}
                        arg={!('kind' in c) || c.kind === '論點'}
                      />
                    ) : (
                      id
                    )}
                    <span className="ex" aria-hidden>
                      {t('證物')} {exhibitNo(i)}
                    </span>
                  </span>
                );
              })}
              received
              ruling={{
                ok,
                quote: quote ? t(quote.text, scope).replace(/^「|」$/g, '') : undefined,
              }}
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
          : id === 'docs' && unreadDocs > 0
            ? unreadDocs
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
      tabs={<Tabs label={t('應用程式')} value={app} onPick={pickApp} items={apps} />}
      foot={
        <>
          <EvidenceDrawer noTimeline={app === 'board'} />
          {desk.canWrap(scene, st, progress.cards) ? (
            <WrapButton
              hours={st.hours}
              open={scene.questions.length - st.confirmed.length}
              onWrap={wrapDesk}
            />
          ) : (
            st.confirmed.includes(scene.goal) &&
            pending > 0 && (
              <button className="wide" onClick={() => pickApp('discovery')}>
                {t('結束調查')} <span className="cost">{t('開示未回應 {n}', { n: pending })}</span>
              </button>
            )
          )}
        </>
      }
    >
      {st.hours === scene.hours && <Recap />}
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
      {discovery.openRequests(scene, st, progress.cards).map((r) => {
        const res = done[r.id];
        const sel = pick[r.id];
        return (
          <li key={r.id} className={res ? 'panel req answered' : 'panel req'}>
            {/* 編號寫在請求本文（「請求五：…」）；這裡不再自己數，第二批只剩一項時會和本文對不上（體驗評測）。 */}
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
                aria-label={t('{req} 的回應', { req: t(r.text, scope).split(/[：:]/)[0] })}
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
                {sel && (
                  // 定案列（UX 決策代價規格三）：選了先看帳，按定案鈕才送出。
                  <CommitBar
                    what={t(RESPONSES.find((o) => o.id === sel)!.label)}
                    cost={
                      sel === 'produce'
                        ? t('對方拿到這 {n} 份文件', { n: r.cards.length })
                        : sel === 'privilege'
                          ? // 固定文案：不可以依 privilege 值改寫，不然等於告訴玩家答案。
                            // 只有特權已經被自己放棄的（錄取時沒擋住），才把原因說出來。
                            r.waived && branch.matches(r.waived, branchContext(progress))
                            ? t(
                                '證人在錄取時已經說出這份意見的內容，特權視同放棄；法官多半會命令交出',
                              )
                            : t('法官可能不認；沒有正當理由硬藏，之後被揭穿會很重')
                          : t('由法官決定範圍')
                    }
                    detail={
                      // 交出去才確定會發生的事（集層級 effects）；特權與範圍的結果要法官裁，不先講。
                      sel === 'produce' ? (
                        <EffectLines items={effectsIf(progress, [`discovery:${r.id}:produced`])} />
                      ) : undefined
                    }
                    action={t(
                      sel === 'produce'
                        ? r.cards.length > 1
                          ? '交出這些文件'
                          : '交出這份文件'
                        : sel === 'privilege'
                          ? '主張特權'
                          : '以範圍過廣回應',
                    )}
                    onCommit={() => respondDiscovery(r.id, sel)}
                  />
                )}
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

/**
 * 文件裡別人加上去的便利貼（「（羅根的便利貼）……」）跟文件本文分開畫：
 * 黃紙、手寫署名，才不會被讀成法官或作者寫的話（體驗評測）。
 */
function DocLine({ text }: { text: string }) {
  const m = /^[（(]([^）)]*(?:便利貼|sticky note))[）)]\s*/i.exec(text);
  if (!m) return <span>{text}</span>;
  return (
    <span className="sticky-note">
      <span className="sticky-from">{m[1]}</span>
      {text.slice(m[0].length)}
    </span>
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
                  <DocLine text={t(l.text, scope)} />
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
  // 手機版整頁捲動：換題或回清單時回到頁首，不然會停在上一題捲到的地方。
  useEffect(() => {
    if (!wide) window.scrollTo({ top: 0 });
  }, [shown, wide]);
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
  const [picking, setPicking] = useState(false);
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
          if (s === 'done') {
            // 確認過的縮成一行：✓ 編號、論點的短句、◆字母（UX 規格：清單只留還要做的事）。
            const [head, gist] = splitArg(t(x.argument.name, scope));
            return (
              <li key={x.id}>
                <button
                  className="q-item done"
                  aria-current={shown === x.id}
                  aria-label={`${num(i)} ${t(x.text, scope)}：${t('已確認')}`}
                  onClick={() => setView(x.id)}
                >
                  <span className="good" aria-hidden>
                    ✓
                  </span>
                  <span className="q-num">{num(i)}</span>
                  <span className="q-gist">{gist ?? head}</span>
                  <span className="arg-mark">{argLetter(head)}</span>
                </button>
              </li>
            );
          }
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
                  <span>{s === 'open' ? t('進行中') : t('尚未開始')}</span>
                </span>
              </button>
            </li>
          );
        })}
        {/* 還沒出現的疑問只留一行：看得出案子還沒查完，又不佔一排空框（UX 規格）。 */}
        {scene.questions.length > questions.length && (
          <li className="q-locked">
            <Redaction
              label={t('還有 {n} 題，查到線索後出現', {
                n: scene.questions.length - questions.length,
              })}
            />
          </li>
        )}
      </ul>
    </nav>
  );

  const [juryView, setJuryView] = useState(false);
  // 陪審團只知道被法庭採納的證據（卡片的 admitted）；論點、發現是盧卡斯自己的推理。
  const juryCards = pool.filter((c) => 'admitted' in c && c.admitted);
  // 出處小字（設定集 6.6）：誰畫的、什麼時候。桌面上的板永遠在開庭前，所以是「預審」。
  const sketchSource = [t('法庭速寫'), 'M. Osei', t('預審')].join('\u3000');
  // 軟木板上的 A、B：放了卡就是那張卡（點了拿下來），空的是提示或挑卡入口。
  const corkSlot = (i: 0 | 1, face: ReactNode) => {
    const c = pool.find((x) => x.id === st.link.cards[i]);
    if (c)
      return (
        <button
          className="cork-pick"
          onClick={() => toggleLinkCard(c.id)}
          aria-label={t('拿下 {name}', { name: t(c.name, scope) })}
        >
          {face}
        </button>
      );
    return wide ? (
      <span className="cork-empty">{t('點右邊的卡片放上來')}</span>
    ) : (
      // 手機：空格就是挑卡片的入口，挑完回到這裡看得到 A、B（UX 規格 P1-11）。
      <button
        className="cork-empty"
        disabled={i > st.link.cards.length}
        onClick={() => setPicking(true)}
      >
        {t('放一張卡')}
      </button>
    );
  };
  // 板邊連過的線：最新的兩條、不含正在比對的卡。
  const byId = (id: string) => pool.find((c) => c.id === id);
  const corkLinks = desk
    .findings(scene, st)
    .slice()
    .reverse()
    .filter((l) => !l.cards.some((id) => st.link.cards.includes(id)))
    .flatMap((l) => {
      const [a, b] = [byId(l.cards[0]), byId(l.cards[1])];
      return a && b ? [{ a, b, relation: l.relation }] : [];
    })
    .filter(
      (l, i, all) =>
        i === 0 || ![all[0].a.id, all[0].b.id].some((id) => id === l.a.id || id === l.b.id),
    )
    .slice(0, 2);
  // 提得出聲請、還沒核准的卡：黑條佔位（設定集第 9 章「尚未取得」）。一個畫面最多三條黑條。
  const bars = (scene.questions.length > questions.length ? 1 : 0) + (found.length === 0 ? 1 : 0);
  const have = pool.map((c) => c.id);
  const pending = scene.motions
    .filter((m) => m.gives.length && m.needs.every((n) => have.includes(n)))
    .filter((m) => !desk.motionAttempt(st, m.id).ruling)
    .flatMap((m) =>
      m.gives
        .filter((id) => !have.includes(id))
        .map((id) => ({
          id,
          name: scene.cards.find((c) => c.id === id)?.name ?? id,
          why: m.label.includes('傳票') ? '尚未取得　需傳票' : '尚未取得　需聲請',
        })),
    )
    .slice(0, Math.max(0, 3 - bars));

  // 確認之後連線台照常能用（發現是共用的），但不再是頁面主角（UX 規格四之 3）。
  const qDone = !!q && st.confirmed.includes(q.id);
  // 「下一題 →」：先找後面還沒確認的，再從頭找；都確認了就去時間線，時間線也排完就回清單收工。
  const after = q ? questions.slice(questions.indexOf(q) + 1) : [];
  const nextQ = [...after, ...questions].find((x) => !st.confirmed.includes(x.id));
  const nextView = nextQ?.id ?? (st.timeline.length < timedN ? 'timeline' : null);
  const bench = (
    <section className="panel step links">
      <div className="row bench-head">
        <h3 className="step-head">
          <span className="step-num">1</span>
          {qDone ? t('繼續連線') : t('連線')}
        </h3>
        {/* 陪審團視角（設定集 8.6）：同一塊板，只畫陪審團聽過的東西。 */}
        <div className="view-switch" role="group" aria-label={t('看誰知道的案情')}>
          <button aria-pressed={!juryView} onClick={() => setJuryView(false)}>
            {t('我知道的案情')}
          </button>
          <button aria-pressed={juryView} onClick={() => setJuryView(true)}>
            {t('陪審團知道的案情')}
          </button>
        </div>
      </div>
      <div
        className={
          (desk.canConnect(st) ? 'link-bench ready' : 'link-bench') +
          (badShake ? (st.linkMiss === 'relation' ? ' shake-rel' : ' shake') : '')
        }
      >
        <Cork
          focus={
            [0, 1].map((i) => pool.find((x) => x.id === st.link.cards[i])) as [
              CorkItem | undefined,
              CorkItem | undefined,
            ]
          }
          relation={st.link.relation}
          relationLabel={st.link.relation ? t(st.link.relation) : t('？')}
          ready={desk.canConnect(st)}
          links={corkLinks}
          loose={pool}
          pending={pending}
          compact={!wide}
          onPick={toggleLinkCard}
          slot={corkSlot}
          jury={{ on: juryView, cards: juryCards, provenance: sketchSource }}
        />
        {/* 陪審團視角只看不動：連線操作收起來，畫面上不留黃（一格一黃給的是下一步，這裡沒有下一步）。
            位置照留，切換時版面不跳（捲軸出現或消失會讓板子變寬，速寫也得重畫）。 */}
        <div className="bench-ops-wrap">
          {juryView && (
            <p className="jury-note" role="status">
              {juryCards.length
                ? t('陪審團只看過法庭採納的證據：{list}。你的連線和推理他們都還沒聽過。', {
                    list: juryCards.map((c) => t(c.name, scope)).join(t('、')),
                  })
                : t('陪審團還沒看過任何證據。你查到的一切，要在法庭上被採納，他們才會知道。')}
            </p>
          )}
          <div className={juryView ? 'bench-ops off' : 'bench-ops'} inert={juryView}>
            <RelationPicker
              cards={st.link.cards.map((id) => pool.find((c) => c.id === id)?.name)}
              value={st.link.relation}
              onPick={setLinkRelation}
              compact
            />
            <div className="row bench-foot">
              <span />
              {/* 一格一黃：這題確認了，主按鈕是「下一題」，連起來退成一般按鈕。 */}
              <button
                className={qDone ? undefined : 'primary'}
                disabled={!desk.canConnect(st)}
                onClick={connect}
              >
                {t('連起來')}
              </button>
            </div>
            {found.length === 0 && (
              <p className="bench-hint">{t('把兩張卡連起來，發現會出現在下面。')}</p>
            )}
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
        </div>
      </div>
      {!wide && picking && (
        <CardSheet
          title={t('放到 {slot}', { slot: st.link.cards.length === 0 ? 'A' : 'B' })}
          onClose={() => setPicking(false)}
        >
          <KindFilter items={pool} value={kind} onPick={setKind} />
          <ul className="stack sheet-list">
            {timeGroups(
              pool.filter((c) => showKind(c) || st.link.cards.includes(c.id)),
              (c) => {
                const at = st.link.cards[0] === c.id ? 'A' : st.link.cards[1] === c.id ? 'B' : '';
                return (
                  <li key={c.id}>
                    <CardPick
                      item={c}
                      on={!!at}
                      disabled={!!at}
                      tag={at ? t('已在 {slot}', { slot: at }) : undefined}
                      onPick={() => {
                        toggleLinkCard(c.id);
                        setPicking(false);
                      }}
                    />
                  </li>
                );
              },
            )}
          </ul>
        </CardSheet>
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
            {bench}
            <section className="panel step mine">
              <h3 className="step-head">
                <span className="step-num">2</span>
                {t('發現')}
              </h3>
              {found.length === 0 ? (
                <p className="found-empty">
                  <Redaction label={t('尚未發現')} />
                </p>
              ) : (
                (() => {
                  // 一條發現就是一張便條：編號與關係、連起來的兩張卡、連線的內容；點了放進答案。
                  const note = (f: (typeof found)[number]) => (
                    <FoundNote
                      key={f.id}
                      fresh={f.id === fresh}
                      used={a.cards.includes(f.id)}
                      done={done}
                      label={`${t(f.name, scope)}${t('：')}${showPair(f.pair)}`}
                      onPick={() => toggleCard(q.id, f.id)}
                      head={
                        <>
                          {t(f.name, scope)}
                          <span>{t(f.relation)}</span>
                        </>
                      }
                      pair={showPair(f.pair)}
                      text={t(f.text, scope)}
                      note={f.conclusion && t(f.conclusion.text, scope)}
                    />
                  );
                  // 別題已確認的答案用掉的發現收進「已用過」（UX 規格 P1-10）；新的排最上面。
                  const spent = new Set(
                    st.confirmed
                      .filter((id) => id !== q.id)
                      .flatMap((id) => st.attempts[id]?.cards ?? []),
                  );
                  const live = found.filter((f) => !spent.has(f.id) || a.cards.includes(f.id));
                  const old = found.filter((f) => !live.includes(f));
                  return (
                    <>
                      <ol className="found-list">{[...live].reverse().map(note)}</ol>
                      {old.length > 0 && (
                        <details className="found-used">
                          <summary>{t('已用過 {n}', { n: old.length })}</summary>
                          <ol className="found-list">{[...old].reverse().map(note)}</ol>
                        </details>
                      )}
                    </>
                  );
                })()
              )}
            </section>
            {/* 工作台順序＝動作順序：連線 → 發現 → 答案；答案列釘在底部（UX 規格）。 */}
            <section
              className={
                done ? 'panel step answer answer-bar done' : 'panel step answer answer-bar'
              }
            >
              <h3 className="step-head">
                <span className="step-num">3</span>
                {t('答案')}
              </h3>
              {done ? (
                // 結果卡：確認了什麼、得到哪張論點，旁邊直接去下一題。
                <div className="row result-card">
                  <p className="good">
                    ✓ {t('已確認')} → <span className="arg-name">{t(q.argument.name, scope)}</span>
                  </p>
                  {(nextView || !wide) && (
                    <button
                      className={juryView ? undefined : 'primary'}
                      onClick={() => setView(nextView)}
                    >
                      {nextView === 'timeline'
                        ? t('去排時間線 →')
                        : nextView
                          ? t('下一題 →')
                          : t('回疑問清單 →')}
                    </button>
                  )}
                </div>
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
                          ) : (
                            // 連起來之後下一步要點發現再提交（體驗評測：沒有提示，會以為連起來就解完了）。
                            <span className="slot-hint">
                              {found.length ? t('點一條發現放到這裡') : t('先連線，得到發現')}
                            </span>
                          )}
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
                    {/* 板上兩張卡和關係都擺好時，眼前的動作是「連起來」，提交先退成一般按鈕。 */}
                    <button
                      className={desk.canConnect(st) || juryView ? undefined : 'primary'}
                      disabled={!desk.canSubmit(scene, st, q.id, progress.cards)}
                      onClick={() => submit(q.id)}
                    >
                      {t('提交')} <span className="cost">{t('−1 時')}</span>
                    </button>
                  </div>
                </>
              )}
              {done && st.feedback[q.id] && (
                // 結果卡已經寫了「✓ 已確認 → 論點」，這句只給讀屏（體驗評測：手機上講兩次）。
                <p role="status" className="sr-only">
                  {t(st.feedback[q.id], scope)}
                </p>
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
    <div className={juryView ? 'board3 jury' : 'board3'}>
      {list}
      <div className="board-work">{work}</div>
    </div>
  );
}

/**
 * 法院系統：提出動議與聲請傳票。三樣都要選對（企劃書 6.6）。
 * 每份聲請是一張聲請狀（UX board-spec §10）：請求、依據兩格點開小選單，證物格從證據欄出示，
 * 三格填好才出現遞狀；裁定回到同一張紙上蓋章。上面一排是桌上的狀紙縮圖。
 */
function Motions({ scene, held }: { scene: DeskScene; held: string[] }) {
  const { progress, pickBasis, pickRequest, toggleSupport, fileMotion } = useEpisode();
  const t = useT();
  const scope = useScope();
  const wide = useWide();
  const st = deskState(progress, scene);
  // 一打開就停在還沒裁定的那一份上。
  const open = scene.motions.find((m) => desk.motionAttempt(st, m.id).ruling !== 'granted');
  const [pick, setPick] = useState<string>(open?.id ?? scene.motions[0]?.id ?? '');
  // 哪一個空格開著：請求、依據的小選單，或手機上挑證物的底部抽屜。
  const [menu, setMenu] = useState<'request' | 'basis' | 'support' | null>(null);
  const m = scene.motions.find((x) => x.id === pick) ?? scene.motions[0];
  const a = m ? desk.motionAttempt(st, m.id) : null;
  const all = [...heldArgs(progress), ...scene.cards.filter((c) => held.includes(c.id))];
  // 證物格只列這份聲請的候選（正解、替代卡、誘答），不是整個證據庫。
  const pool = m
    ? desk.supportPool(
        scene,
        st,
        m.id,
        all.map((c) => c.id),
      )
    : [];
  const cards = all.filter((c) => pool.includes(c.id));
  const missing = m ? m.needs.filter((n) => !held.includes(n)) : [];
  const editable = !!a && a.ruling !== 'granted' && missing.length === 0;
  // 電腦版：右邊證據欄點一張＝出示，放進證物格；滿了就換掉最早那張（引擎的規則）。
  const poolIds = cards.map((c) => c.id).join();
  const on = a?.support.join() ?? '';
  const slots = m?.support.length ?? 0;
  const mid = m?.id;
  const exhibit = t('證物');
  useEffect(() => {
    if (!wide || !editable || !mid) return;
    useCardPick.setState({
      pool: poolIds.split(','),
      on: on ? on.split(',') : [],
      pick: (id) => toggleSupport(mid, id),
      tags: Array.from({ length: slots }, (_, i) => `${exhibit} ${exhibitNo(i)}`),
    });
    return () => useCardPick.setState({ pool: [], on: [], pick: undefined, tags: undefined });
  }, [wide, editable, mid, poolIds, on, slots, exhibit, toggleSupport]);
  // 小選單：按 Esc 或點別的地方就收起來。
  useEffect(() => {
    if (!menu || !wide) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    const away = (e: PointerEvent) =>
      !(e.target as Element).closest?.('.blank-wrap') && setMenu(null);
    window.addEventListener('keydown', esc);
    window.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('keydown', esc);
      window.removeEventListener('pointerdown', away);
    };
  }, [menu, wide]);
  if (!m || !a) return <p className="muted">{t('目前沒有可以提出的聲請。')}</p>;
  const n = scene.motions.indexOf(m) + 1;
  const nameOf = (id: string) => cards.find((c) => c.id === id);
  const quoteOf = (lines: { who: string; text: string }[]) => {
    const q = lines.find((l) => l.who === '旁白');
    return q ? t(q.text, scope).replace(/^「|」$/g, '') : undefined;
  };
  const ruling = a.ruling
    ? { ok: a.ruling === 'granted', quote: quoteOf(a.ruling === 'granted' ? m.granted : m.denied) }
    : null;

  const words = (key: 'request' | 'basis', options: string[], value: string | null) => {
    const hint = key === 'request' ? t('點這裡選請求') : t('點這裡選依據');
    const title = key === 'request' ? t('請求') : t('法律依據');
    if (!editable) return <Written text={value && t(value, scope)} />;
    const choose = (o: string) => {
      if (key === 'request') pickRequest(m.id, o);
      else pickBasis(m.id, o);
      setMenu(null);
    };
    const list = (
      <span className="pop-list" role="listbox" aria-label={title}>
        {options.map((o) => (
          <button
            key={o}
            role="option"
            aria-selected={value === o}
            className={value === o ? 'on' : undefined}
            onClick={() => choose(o)}
          >
            {t(o, scope)}
          </button>
        ))}
      </span>
    );
    return (
      <span className="blank-wrap">
        <button
          className={'blank' + (value ? ' filled' : '') + (menu === key ? ' open' : '')}
          aria-haspopup="listbox"
          aria-expanded={menu === key}
          aria-label={value ? `${title}：${t(value, scope)}` : hint}
          onClick={() => setMenu(menu === key ? null : key)}
        >
          {value ? t(value, scope) : <span className="hint">{hint}</span>}
        </button>
        {menu === key &&
          (wide ? (
            <span className="pop">
              <span className="k">
                {title}
                {t('・')}
                {t('選一個')}
              </span>
              {list}
            </span>
          ) : (
            <CardSheet title={title} onClose={() => setMenu(null)}>
              <div className="sheet-options">{list}</div>
            </CardSheet>
          ))}
      </span>
    );
  };

  const pickHint = wide ? t('從右邊拿一張證物') : t('點這裡出示證物');
  const support = Array.from({ length: m.support.length }, (_, i) => {
    const id = a.support[i];
    const c = id ? nameOf(id) : undefined;
    const tag = c && (
      <ExhibitTag name={t(c.name, scope)} arg={!('kind' in c) || c.kind === '論點'} />
    );
    const ex = (
      <span className="ex" aria-hidden>
        {exhibit} {exhibitNo(i)}
      </span>
    );
    if (!editable)
      return (
        <span className="blank filled exhibit">
          {tag ?? '—'}
          {c && ex}
        </span>
      );
    return (
      <span className="blank-wrap" key={i}>
        <button
          className={c ? 'blank exhibit filled' : 'blank exhibit'}
          aria-label={c ? `${exhibit} ${exhibitNo(i)}：${t(c.name, scope)}` : pickHint}
          // 電腦版點空格不必做什麼：卡從右邊證據欄來。手機打開挑卡片抽屜。
          onClick={() => !wide && setMenu('support')}
        >
          {tag ?? <span className="hint">{pickHint}</span>}
          {c && ex}
        </button>
      </span>
    );
  });

  const ready = desk.canFile(scene, st, m.id, progress.cards);
  const filled = !!a.basis && !!a.request && a.support.length === m.support.length;
  const foot =
    a.ruling === 'granted' ? null : !filled ? (
      <span className="zh">{t('三格都填好，這裡才出現遞狀')}</span>
    ) : st.hours < m.cost ? (
      <span className="zh">{t('工時不足')}</span>
    ) : (
      <>
        {a.ruling === 'denied' && <span className="zh">{t('修正後可重送，工時照扣')}</span>}
        <button className="commit" disabled={!ready} onClick={() => fileMotion(m.id)}>
          <span aria-hidden>🔒 </span>
          {a.ruling === 'denied' ? t('重新遞狀') : t('遞狀')}
          <span className="cost">{t('−{n} 工時', { n: m.cost })}</span>
        </button>
      </>
    );

  return (
    <div className="court-desk">
      {scene.motions.length > 1 && (
        <nav className="filings" aria-label={t('聲請')}>
          {scene.motions.map((x, i) => (
            <FilingThumb
              key={x.id}
              a={desk.motionAttempt(st, x.id)}
              n={i + 1}
              on={x.id === m.id}
              onPick={() => {
                setPick(x.id);
                setMenu(null);
              }}
            />
          ))}
        </nav>
      )}
      {missing.length > 0 && a.ruling !== 'granted' ? (
        // 前提沒到：不給狀紙，給一張便條（UX 10.3）。
        <aside className="prereq-note">
          <small>
            {t('聲請 {n}', { n })}
            {t('・')}
            {t('還不能寫')}
          </small>
          <strong>
            {t('還缺前提：先把 {names} 確認起來', {
              names: missing
                .map((id) => `◆ ${t(nameOf(id)?.name ?? argName(scene, id), scope)}`)
                .join('、'),
            })}
          </strong>
          <span>{t(m.detail, scope)}</span>
        </aside>
      ) : (
        <Pleading
          m={m}
          n={n}
          request={words('request', m.requests, a.request)}
          basis={words('basis', m.bases, a.basis)}
          support={support}
          received={!!a.ruling}
          ruling={ruling}
          foot={foot}
        />
      )}
      {menu === 'support' && !wide && (
        <CardSheet title={t('出示證物')} onClose={() => setMenu(null)}>
          <div className="stack">
            {cards.map((c) => (
              <CardPick
                key={c.id}
                item={c}
                compact
                on={a.support.includes(c.id)}
                onPick={() => {
                  toggleSupport(m.id, c.id);
                  setMenu(null);
                }}
              />
            ))}
          </div>
        </CardSheet>
      )}
    </div>
  );
}

/** 前提是還沒確認的論點時，名稱從證據板的疑問裡找。 */
const argName = (scene: DeskScene, id: string) =>
  scene.questions.find((q) => q.argument.id === id)?.argument.name ?? id;

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
            {/* 委託會留下旗標的，先把會發生的事列出來（決策代價規格一）；已委託的不必再看。 */}
            {!done && <EffectLines items={effectsIf(progress, j.flags)} />}
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
              // 每張委託卡各一顆，一個畫面會有好幾顆：用次要鈕，黃只留給畫面上唯一的主按鈕（規格 v2.0 §10）。
              <button
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
/** 手機的挑卡片底部抽屜：從連線台的空格打開，點一張就放上去並關掉。 */
export function CardSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="sheet-wrap">
      <button className="sheet-back" aria-label={t('關閉')} onClick={onClose} />
      <section className="sheet card-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="link" onClick={onClose}>
            {t('關閉')}
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

/**
 * 一條發現一張便條：編號與關係、連起來的兩張卡、內容。點了放進答案。
 * 內容預設兩行，超過才出現「展開」（UX 規格：便條一長，發現區就要捲好幾屏）。
 */
function FoundNote({
  fresh,
  used,
  done,
  label,
  onPick,
  head,
  pair,
  text,
  note,
}: {
  fresh: boolean;
  used: boolean;
  done: boolean;
  label: string;
  onPick: () => void;
  head: ReactNode;
  pair: string;
  text: string;
  note?: string;
}) {
  const t = useT();
  const body = useRef<HTMLSpanElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || open) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text, note]);
  return (
    <li className={long || open ? 'found-item long' : 'found-item'}>
      <button
        className={fresh ? 'found fresh' : 'found'}
        aria-pressed={used}
        aria-label={label}
        disabled={done}
        onClick={onPick}
      >
        <span className="found-head">
          {head}
          {used && <span className="good">{t('已放進答案')}</span>}
        </span>
        <strong className="found-pair">{pair}</strong>
        <span ref={body} className={'found-body' + (long ? ' long' : '') + (open ? ' open' : '')}>
          <span className="found-text">{text}</span>
          {note && <span className="found-note">{note}</span>}
        </span>
      </button>
      {(long || open) && (
        <button className="link found-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('收起') : t('展開')}
        </button>
      )}
    </li>
  );
}

function WrapButton({ hours, open, onWrap }: { hours: number; open: number; onWrap: () => void }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  // 第二下是定案鈕：寫出還剩多少工時、多少疑問沒確認（UX 決策代價規格三）。
  return armed ? (
    <button className="commit wide armed" onClick={onWrap}>
      <span aria-hidden>🔒 </span>
      {t('確定結束')}{' '}
      <span className="cost">
        {open ? t('剩 {n} 時・{m} 題沒確認', { n: hours, m: open }) : t('剩 {n} 時', { n: hours })}
      </span>
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

/** 「論點 A：伊森是被叫上樓的」→ ['論點 A', '伊森是被叫上樓的']；英文用「: 」分。 */
function splitArg(name: string): [string, string | undefined] {
  const [head, ...rest] = name.split(/：|: /);
  return [head, rest.length ? rest.join('：') : undefined];
}

/** 「論點 A」「Argument A」→ ◆A；沒有字母的論點只畫菱形。 */
function argLetter(head: string) {
  const m = /\s([A-Z])$/.exec(head);
  return m ? m[1] : '';
}

function gapDetail(scene: DeskScene, tr: (s: string) => string) {
  for (const j of scene.jobs)
    for (const l of j.report)
      if (l.mark?.kind === 'gap') return tr(l.text).replace(/\s*→\s*/, '\u3000→\u3000');
  return undefined;
}
