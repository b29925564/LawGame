import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { useT } from '../i18n';
import { stamp } from './Evidence';
import { useScope } from './lang';
import { announce, useHand } from './Marks';
/** 時間線：順序由玩家自己排。遊戲不會自動排序，也不會標出衝突（企劃書 6.5）。 */
export interface TimelineCard {
  id: string;
  name: string;
  text: string;
  date?: string;
  time?: string;
  arrivesAt?: string;
}

/** 時間線上的手的記號（設計稿 inner-voice 2d）。 */
export interface TimelineMark {
  kind: 'gap' | 'sync';
  cards: string[];
  /** 間距標記的說明，例如「22:44 抵達 → 22:47 刷卡」；沒有就用兩張卡的時間。 */
  detail?: string;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** 已經播完的 sync：同時亮起只在第一次看到時播一次。 */
const synced = new Set<string>();

export function Timeline({
  cards,
  placed,
  onToggle,
  onMove,
  marks = [],
}: {
  cards: TimelineCard[];
  placed: string[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  marks?: TimelineMark[];
}) {
  const t = useT();
  const scope = useScope();
  const timed = cards.filter((c) => c.time);
  const rows = placed.map((id) => timed.find((c) => c.id === id)).filter((c) => !!c);
  // 間距標記：兩張卡的先後排對了（不必相鄰），就標在較晚那張上方。
  const gaps = new Map<string, { min: number; detail: string }>();
  for (const m of marks.filter((x) => x.kind === 'gap')) {
    const [a, b] = m.cards.map((id) => rows.find((c) => c.id === id));
    if (!a?.time || !b?.time) continue;
    const ta = a.arrivesAt ?? a.time;
    const min = minutes(b.time) - minutes(ta);
    if (min < 0 || rows.indexOf(a) > rows.indexOf(b)) continue;
    gaps.set(b.id, { min, detail: m.detail ?? `${ta}\u3000→\u3000${b.time}` });
  }
  // 同時亮起：兩張卡都放上去了，第一次打開時亮 2400ms。
  const sync = marks.find((m) => m.kind === 'sync' && m.cards.every((id) => placed.includes(id)));
  const syncKey = sync?.cards.join();
  // 還沒播過就亮著；播完（2400ms 後）記下來，之後打開不再亮。
  const [, setDone] = useState(0);
  const lit = !!syncKey && !synced.has(syncKey);
  useEffect(() => {
    if (!syncKey || synced.has(syncKey)) return;
    const [a, b] = sync!.cards.map((id) => timed.find((c) => c.id === id));
    announce.mark({
      from: 'sync',
      text: t('兩點同時亮起：{a}，{b}', {
        a: `${a?.time} ${a ? t(a.name, scope) : ''}`,
        b: `${b?.time} ${b ? t(b.name, scope) : ''}`,
      }),
    });
    const timer = setTimeout(() => {
      synced.add(syncKey);
      setDone((n) => n + 1);
    }, 2400);
    return () => clearTimeout(timer);
  }, [syncKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useHand('sync', lit);
  useHand('gap', gaps.size > 0);
  const loose = timed.filter((c) => !placed.includes(c.id));
  // 拖曳：被拖的那列跟著手指走，其他列用位移讓位，放開才真的搬。整段只改 transform，不重排版面。
  const [drag, setDrag] = useState<{
    id: string;
    from: number;
    to: number;
    y0: number;
    dy: number;
    h: number;
    mids: number[];
  } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const link = useRef<HTMLSpanElement>(null);
  // 連線：量兩列的位置；排序、拖曳、視窗縮放後都重量一次，拖曳中先藏起來。
  useLayoutEffect(() => {
    const ol = list.current;
    const el = link.current;
    if (!ol || !el || !sync) return;
    const measure = () => {
      const rs = sync.cards.map((id) => ol.querySelector<HTMLElement>(`[data-id="${id}"]`));
      if (!rs[0] || !rs[1]) return;
      const [y0, y1] = rs.map((r) => r!.offsetTop + 12).sort((x, y) => x - y);
      el.style.setProperty('--y', `${y0}px`);
      el.style.setProperty('--h', `${y1 - y0}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    return () => ro.disconnect();
  });
  const grab = (e: PointerEvent<HTMLButtonElement>, id: string, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const els = [...(list.current?.children ?? [])];
    const rect = els[i].getBoundingClientRect();
    const next = els[i + 1]?.getBoundingClientRect();
    const mids = els
      .filter((_, k) => k !== i)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    setDrag({
      id,
      from: i,
      to: i,
      y0: e.clientY,
      dy: 0,
      h: next ? next.top - rect.top : rect.height + 14,
      mids,
    });
  };
  const slide = (e: PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    const mid = e.clientY;
    const to = drag.mids.filter((m) => m < mid).length;
    setDrag({ ...drag, dy, to });
  };
  const drop = () => {
    if (!drag) return;
    const dir = drag.to > drag.from ? 1 : -1;
    for (let k = 0; k < Math.abs(drag.to - drag.from); k++) onMove(drag.id, dir);
    setDrag(null);
  };
  const shift = (k: number) => {
    if (!drag || k === drag.from) return drag ? drag.dy : 0;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -drag.h;
    if (drag.to < drag.from && k >= drag.to && k < drag.from) return drag.h;
    return 0;
  };
  return (
    <section className="panel timeline-panel">
      {/* 還沒放上去的卡片釘在上緣：時間軸再長，加卡片也不必捲回去。 */}
      <div className="timeline-tray">
        <h2>
          {t('時間軸')}{' '}
          <span className="muted small">
            {rows.length} / {timed.length}
          </span>
        </h2>
        {loose.length > 0 ? (
          <div className="chips kinds" role="group" aria-label={t('還沒放上時間軸的卡片')}>
            {loose.map((c) => (
              <button key={c.id} aria-pressed={false} onClick={() => onToggle(c.id)}>
                ＋ {stamp(c, scope)} {t(c.name, scope)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">
            {timed.length ? t('有時間的卡片都放上去了。') : t('目前沒有帶時間的卡片。')}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t('點上面的卡片，把它放上時間軸。')}</p>
      ) : (
        <ol className={drag ? 'timeline sorting' : 'timeline'} ref={list}>
          {rows.map((c, i) => (
            <li
              key={c.id}
              data-id={c.id}
              className={
                [
                  drag?.id === c.id && 'dragging',
                  gaps.has(c.id) && 'has-gap',
                  lit && sync?.cards.includes(c.id) && 'sync',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              style={drag ? { transform: `translateY(${shift(i)}px)` } : undefined}
            >
              {gaps.has(c.id) && (
                <span
                  className="gap-mark enter"
                  role="note"
                  aria-label={t('間距 {n} 分鐘：{detail}', {
                    n: gaps.get(c.id)!.min,
                    detail: gaps.get(c.id)!.detail,
                  })}
                >
                  <b>{t('{n} 分鐘', { n: gaps.get(c.id)!.min })}</b>
                  <span>{gaps.get(c.id)!.detail}</span>
                </span>
              )}
              <button
                className="grip"
                aria-label={t('移動「{name}」：拖曳，或用上下鍵', { name: t(c.name, scope) })}
                onPointerDown={(e) => grab(e, c.id, i)}
                onPointerMove={slide}
                onPointerUp={drop}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' && i > 0) onMove(c.id, -1);
                  else if (e.key === 'ArrowDown' && i < rows.length - 1) onMove(c.id, 1);
                  else return;
                  e.preventDefault();
                }}
              >
                <span className="dots" aria-hidden />
              </button>
              <time>{stamp(c, scope)}</time>
              <div>
                <strong>{t(c.name, scope)}</strong>
                <p>{t(c.text, scope)}</p>
              </div>
              <button
                className="drop-off"
                aria-label={t('把「{name}」拿下來', { name: t(c.name, scope) })}
                onClick={() => onToggle(c.id)}
              >
                <span className="cross" aria-hidden />
              </button>
            </li>
          ))}
          {lit && sync && !drag && <span className="sync-link" ref={link} aria-hidden />}
        </ol>
      )}
    </section>
  );
}

/** 唯讀的時間軸：庭上、談判時從證據抽屜翻出來對照。 */
export function TimelineView({ rows }: { rows: TimelineCard[] }) {
  const t = useT();
  const scope = useScope();
  if (rows.length === 0)
    return <p className="muted">{t('時間軸上還沒有東西。調查時在證據板排好，這裡就看得到。')}</p>;
  return (
    <ol className="timeline readonly">
      {rows.map((c) => (
        <li key={c.id}>
          <time>{stamp(c, scope)}</time>
          <div>
            <strong>{t(c.name, scope)}</strong>
            <p>{t(c.text, scope)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
