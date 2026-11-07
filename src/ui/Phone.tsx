import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { phoneView, type PhoneView } from '../engine/episode/phone';
import type { Line, PhoneScene } from '../engine/episode/schema';
import { sceneChoices, useEpisode } from '../engine/game';
import { useLang, useT } from '../i18n';
import { PlaceBeat } from './ActCard';
import { fitUnits } from './fitUnits';
import { FitLine, fitLine } from './prose';
import { useScope } from './lang';
import { useHand } from './Marks';
import { Redaction } from './Redaction';
import {
  OnPlate,
  onPlateOf,
  plateFor,
  useAvoidSubjects,
  usePlate,
  useShown,
  warmPlate,
} from './scenePlate';
import { useSubs } from './SubCard';

/** 冷開場：伊森的手機畫面。 */
/**
 * 叫車畫面的上車／下車（設計師 v93 排字規則，退路 A）：地址旁邊那一欄放不下黏住的地名（"East River Street"）時，
 * 不讓地名在窄欄裡一個字一行，整組改成標籤在上、地址在下，地址用整個框的寬。放得下就照原本左右兩欄。
 */
function RideRoute({ from, to }: { from: string; to: string }) {
  const t = useT();
  const ref = useRef<HTMLDListElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      el.removeAttribute('data-stack');
      fitUnits(el);
      if (!el.querySelector('dd > .fl.fl-wrap')) return;
      el.setAttribute('data-stack', '');
      fitUnits(el);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(document.documentElement);
    document.fonts?.addEventListener('loadingdone', check);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener('loadingdone', check);
    };
  }, [from, to]);
  return (
    <dl className="ride-route" ref={ref}>
      <dt>{t('上車')}</dt>
      <dd>{fitLine(from)}</dd>
      <dt>{t('下車')}</dt>
      <dd>{fitLine(to)}</dd>
    </dl>
  );
}

export function Phone({ scene }: { scene: PhoneScene }) {
  const { progress, advance, choose } = useEpisode();
  const t = useT();
  const scope = useScope();
  const lang = useLang((s) => s.lang);
  const v = phoneView(scene, progress.step, sceneChoices(progress));
  useHand('coldopen', !scene.epilogue);
  // 有定場鏡頭的那一格（do: caption 帶 place＋rig）：底圖照「場景 id＋那一格的 rig」找。
  // 先演定場（圖＋左下場記），再把那一格的字當旁白字幕放在同一張圖上（和其他有底圖的場一樣，設計師 #296）。
  const cap = v.step.do === 'caption' && v.step.rig && v.step.place ? v.step : null;
  const plate = cap ? plateFor(progress.episode, { id: scene.id, rig: cap.rig }, lang) : null;
  const shown = useShown(plate);
  const [framed, setFramed] = useState<number | null>(null);
  const slated = !!shown && framed === progress.step;
  usePlate(slated ? shown : null, 'scene');
  const narr: Line | null = cap
    ? { who: '旁白', text: cap.text, mood: '平', thought: false }
    : null;
  const subs = useSubs(slated ? narr : null, progress.step, true);
  // 字幕框和按鈕不蓋圖上的主體（獎盃、手）：每換一張卡重量一次。
  const platedMain = useAvoidSubjects(
    slated ? shown : null,
    `${progress.step}|${subs.ix}|${subs.text}`,
  );
  // 下一格有底圖就先載，進那一格時不用等。
  const ahead = scene.steps.slice(progress.step + 1).find((s) => s.do === 'caption' && s.rig);
  const next =
    ahead && ahead.do === 'caption' && ahead.rig
      ? plateFor(progress.episode, { id: scene.id, rig: ahead.rig }, lang)
      : null;
  const [nextDesk, nextPhone] = [next?.desktop, next?.phone];
  useEffect(() => {
    for (const url of [nextDesk, nextPhone]) if (url) void warmPlate(url);
  }, [nextDesk, nextPhone]);

  if (cap && shown && !slated)
    return (
      <PlaceBeat
        key={progress.step}
        id={scene.id}
        episode={progress.episode}
        place={{ raw: cap.place ?? '', text: t(cap.place ?? '', scope), rig: cap.rig }}
        onDone={() => setFramed(progress.step)}
        cold
      />
    );

  if (cap && slated)
    return (
      <OnPlate.Provider value={onPlateOf(shown)}>
        <main
          ref={platedMain}
          className="scene dialogue plated subs cold-plated cold-scope"
          aria-live="polite"
        >
          {subs.node}
          <div className="sub-actions">
            <button
              className="primary next"
              onClick={() => {
                if (subs.step()) return;
                advance();
              }}
            >
              {t('繼續')}
            </button>
          </div>
        </main>
      </OnPlate.Provider>
    );

  if (v.screen === 'caption' && v.step.do === 'caption')
    return (
      <main className={scene.epilogue ? 'cine' : 'cine cold-scope'} aria-live="polite">
        {v.time && <p className="cine-time">{t(v.time, scope)}</p>}
        <FitLine className="cine-text" text={t(v.step.text, scope)} />
        <button className="cine-next" onClick={advance}>
          {t('繼續')}
        </button>
      </main>
    );

  return (
    <main className={scene.epilogue ? 'phone-stage' : 'phone-stage cold-scope'}>
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

/**
 * 對話泡泡捲在最底（設計師 #328 審查：選項出現時，派單的「You have been online…」只露出前兩行，下緣被選項區切掉）。
 * 換一步、選項出現或收起、泡泡換行讓高度變了（fitUnits 在畫面寫好之後才拆字），都捲回最底；
 * 玩家自己往上捲去看前面的訊息時不拉回來，捲回最底才再跟著。
 */
function usePinnedBottom<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    pinned.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [key]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const toBottom = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    // 只有玩家自己捲（滾輪、手指、鍵盤）才可能離開最底；框變矮時瀏覽器自己夾 scrollTop 發的 scroll 不算。
    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    const onScroll = () => {
      if (atBottom()) pinned.current = true;
    };
    const onUser = () => requestAnimationFrame(() => (pinned.current = atBottom()));
    const ro = new ResizeObserver(toBottom);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    const mo = new MutationObserver(() => {
      for (const c of el.children) ro.observe(c);
      toBottom();
    });
    mo.observe(el, { childList: true });
    const user = ['wheel', 'touchmove', 'keydown'] as const;
    el.addEventListener('scroll', onScroll, { passive: true });
    for (const k of user) el.addEventListener(k, onUser, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', onScroll);
      for (const k of user) el.removeEventListener(k, onUser);
    };
  });
  return ref;
}

/**
 * 字幕框上緣切到一半的那一行整行拿掉（設計師「溢出時整行切掉」）：量每一行字，跨在框上緣的那一行，
 * 用 clip-path 從框頂切到那一行的下緣。字換行、加了一句、框的高變了，都重量一次。
 */
function useWholeLines<T extends HTMLElement>(given?: RefObject<T | null>) {
  const own = useRef<T>(null);
  const ref = given ?? own;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const box = el.getBoundingClientRect();
      const top = box.top + el.clientTop;
      let cut = top;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const b of r.getClientRects())
          if (b.height > 0.5 && b.top < top - 0.5 && b.bottom > top + 0.5)
            cut = Math.max(cut, b.bottom);
      }
      if (cut > top + 0.5) el.style.clipPath = `inset(${Math.ceil(cut - box.top)}px 0 0 0)`;
      else el.style.removeProperty('clip-path');
    };
    // 捲動、換字型、貼底之後位置還會再動一點（Pixel 7 的 2.625 倍像素差 2px）：當下量一次，下一格畫面前再量一次。
    let raf = 0;
    const late: number[] = [];
    const soon = () => {
      fit();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
      // 貼底、字型、捲動定下來不一定再發事件：稍後再量兩次。
      late.splice(0).forEach((id) => clearTimeout(id));
      late.push(window.setTimeout(fit, 150), window.setTimeout(fit, 500));
    };
    soon();
    const ro = new ResizeObserver(soon);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    const mo = new MutationObserver(() => {
      for (const c of el.children) ro.observe(c);
      soon();
    });
    mo.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ['class'],
    });
    // 可以捲的列表（聊天室）：捲到哪裡，最上面那行都整行藏掉或整行露出。
    el.addEventListener('scroll', soon, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      late.forEach((id) => clearTimeout(id));
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', soon);
    };
  });
  return ref;
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
  const log = usePinnedBottom<HTMLOListElement>(
    `${v.thread}|${(v.threads[v.thread ?? ''] ?? []).length}|${v.chosen}|${s.do}`,
  );
  const subs = useWholeLines<HTMLOListElement>();
  // 聊天室也一樣：舊訊息被標題列切到的那一行整行藏掉，不留半行（第二道關卡 464a280 第 3 項，第 2 集派單手機）。
  useWholeLines(log);
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
            <strong>{fitLine(t(s.message.from, scope))}</strong>
            <span>{fitLine(t(s.message.text, scope))}</span>
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
          <ol className="bubbles" aria-live="polite" ref={log}>
            {(v.threads[v.thread ?? ''] ?? []).map((b, i) => (
              <li
                key={i}
                className={`bubble${b.mine ? ' mine' : ''}${b.retracted ? ' retracted' : ''}`}
              >
                {b.retracted ? (
                  <Redaction label={t('此訊息已被收回')} meta={b.retractedAt} />
                ) : (
                  fitLine(t(b.text, scope))
                )}
              </li>
            ))}
          </ol>
          {s.do === 'choose' && v.chosen === null ? (
            <div className="replies" role="group" aria-label={t('回覆')}>
              {s.options.map((o, i) => (
                <button key={i} onClick={() => choose(i)}>
                  {fitLine(t(o.text, scope))}
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
          <RideRoute from={t(s.from, scope)} to={t(s.to, scope)} />
          <p className="muted">
            {fitLine(t('最近的司機：{driver}，2 分鐘', { driver: t(s.driver, scope) }))}
          </p>
          <button className="primary" onClick={advance}>
            {t('叫車')}
          </button>
        </div>
      );
    case 'badge':
      return (
        <div className="phone-body badge">
          <p className="muted">{fitLine(t(s.place, scope))}</p>
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
          <p>{fitLine(t(s.text, scope))}</p>
          <button className="primary" onClick={advance}>
            {t(s.action, scope)}
          </button>
        </div>
      );
  }
  // talk 與 choose(talk)：手機收進口袋，畫面是字幕。
  return (
    <div className="phone-body talk">
      <ol className="subtitles" aria-live="polite" ref={subs}>
        {v.talk.map((l, i) => (
          <li key={i} className={l.who === owner ? 'own' : ''}>
            <strong>{t(l.who, scope)}</strong>
            {/* li 是 flex：包成一段，fitLine 的每個詞才不會各自變成一格。 */}
            <span>{fitLine(t(l.text, scope))}</span>
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
              {fitLine(t(o.text, scope))}
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
