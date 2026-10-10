import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

/**
 * 所有操作畫面共用的外框。
 *
 * 整個畫面就是一個視窗高度，只有中間那一塊會捲動，所以：
 * 標頭的工時、耐心、額度永遠看得到，分頁列永遠按得到，
 * 主要按鈕釘在底部不必捲到頁尾找，換分頁也會自動回到最上面
 * （不然一打開新分頁就停在上一頁捲到的位置）。
 */
export function Shell({
  head,
  tabs,
  foot,
  resetKey,
  children,
}: {
  head?: ReactNode;
  /** 釘在標頭下面、永遠看得到的一塊：分頁列，或法庭的筆錄與陪審團。 */
  tabs?: ReactNode;
  foot?: ReactNode;
  /** 這個值一變，內容區就捲回最上面。通常放目前的分頁。 */
  resetKey?: string;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [resetKey]);
  return (
    <main className="shell">
      {/* 每一格都包一層：外框是格線版面，插槽傳進來的片段會變成好幾個格子。 */}
      {head && <div className="shell-head">{head}</div>}
      {tabs && <div className="shell-tabs">{tabs}</div>}
      <div className="shell-body" ref={body}>
        {children}
      </div>
      {foot && <div className="shell-foot">{foot}</div>}
    </main>
  );
}

/** 筆錄：新的話進來就捲過去，從這次的第一句開始看。 */
export function Transcript({ count, children }: { count: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // 一次進來好幾句時，捲到第一句新的；捲到底會把前面幾句藏在框外，看起來像沒出現。
    const first = el.children[seen.current] as HTMLElement | undefined;
    seen.current = el.children.length;
    const top = first
      ? el.scrollTop + first.getBoundingClientRect().top - el.getBoundingClientRect().top - 12
      : el.scrollHeight;
    el.scrollTop = Math.min(top, el.scrollHeight);
  }, [count]);
  return (
    <div className="lines transcript" aria-live="polite" ref={box}>
      {children}
    </div>
  );
}

type TabItem<T> = { id: T; label: string; badge?: ReactNode; done?: boolean };

/**
 * 分頁列。每個分頁可以帶一個小記號（未讀數、已完成的勾）。一列、不換行（設計師 P2-6 r2）。
 * 放不下時不讓最後一格半露在邊緣（第一道關卡 N2：手機英文只露出「Dis」，看不出右邊還有一格帶著未讀數）：
 * 照順序放得下的分頁照放，選中的一定在；其他收進最後一格「更多」，收起來的未讀數加在「更多」上。
 */
export function Tabs<T extends string>({
  label,
  value,
  onPick,
  items,
}: {
  label: string;
  value: T;
  onPick: (v: T) => void;
  items: TabItem<T>[];
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // 每一格的寬（用分頁的內容當鍵：換語言、未讀數變了就重量）。收起來的分頁量不到，用上次量的。
  const widths = useRef(new Map<string, number>());
  const [hidden, setHidden] = useState('');
  const [open, setOpen] = useState(false);
  const keys = items.map(
    (it) =>
      `${it.id}|${t(it.label)}|${typeof it.badge === 'number' ? it.badge : it.badge ? '•' : ''}|${it.done ? 1 : 0}`,
  );
  const fit = () => {
    const nav = ref.current;
    if (!nav) return;
    nav.querySelectorAll<HTMLElement>(':scope > [data-key]').forEach((b) => {
      widths.current.set(b.dataset.key!, b.offsetWidth);
    });
    const ws = keys.map((k) => widths.current.get(k));
    // 有一格還沒量過（收起來的那格換了字）：先全部攤開量一次。
    if (ws.some((w) => w === undefined)) return setHidden('');
    const cs = getComputedStyle(nav);
    const gap = parseFloat(cs.columnGap) || 0;
    const sum = (list: number[]) => list.reduce((a, b) => a + b + gap, -gap);
    const room = nav.clientWidth;
    let next: number[] = [];
    // 只在會捲動的那種分頁列收（--tabs-fold: 1）；桌機頂列的分頁寬度跟著內容，不收。
    const fold =
      cs.getPropertyValue('--tabs-fold').trim() === '1' && cs.flexDirection.startsWith('row');
    if (fold && sum(ws as number[]) > room + 0.5) {
      const on = items.findIndex((it) => it.id === value);
      let left = room - (moreRef.current?.offsetWidth ?? 0) - (on >= 0 ? ws[on]! + gap : 0);
      const keep = new Set(on >= 0 ? [on] : []);
      for (let i = 0; i < items.length; i++) {
        if (i === on) continue;
        if (ws[i]! + gap > left) break;
        keep.add(i);
        left -= ws[i]! + gap;
      }
      next = items.map((_, i) => i).filter((i) => !keep.has(i));
    }
    setHidden(next.map((i) => items[i].id).join('|'));
  };
  const refit = useRef(fit);
  useLayoutEffect(() => {
    refit.current = fit;
    fit();
  });
  useEffect(() => {
    const nav = ref.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => refit.current());
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);
  // 分頁列放不下時左右捲動（舊版面的保險）：選中的分頁捲進看得到的地方。
  useEffect(() => {
    const nav = ref.current;
    const on = nav?.querySelector('[aria-current="true"]');
    if (!nav || !on) return;
    const [n, b] = [nav.getBoundingClientRect(), on.getBoundingClientRect()];
    if (b.left < n.left) nav.scrollLeft -= n.left - b.left;
    else if (b.right > n.right) nav.scrollLeft += b.right - n.right;
  }, [value]);
  // 選單開著：點外面或按 Esc 收起來。
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const off = new Set(hidden ? hidden.split('|') : []);
  const shown = items.filter((it) => !off.has(it.id));
  const rest = items.filter((it) => off.has(it.id));
  const unread = rest.reduce((n, it) => n + (typeof it.badge === 'number' ? it.badge : 0), 0);
  const face = (it: TabItem<T>) => (
    <>
      {it.done && (
        <span className="tick" aria-label={t('已完成')}>
          ✓
        </span>
      )}
      {t(it.label)}
      {it.badge !== undefined && <span className="dot">{it.badge}</span>}
    </>
  );
  return (
    <nav
      ref={ref}
      className={rest.length ? 'apps has-more' : 'apps'}
      aria-label={t(label)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        setOpen(false);
        moreRef.current?.focus();
      }}
    >
      {shown.map((it) => (
        <button
          key={it.id}
          data-key={keys[items.indexOf(it)]}
          aria-current={value === it.id}
          onClick={() => onPick(it.id)}
        >
          {face(it)}
        </button>
      ))}
      {/* 「更多」：沒收東西時也在，看不見、不佔位，只用來量寬（含一個未讀數）。 */}
      <button
        ref={moreRef}
        className={rest.length ? 'apps-more' : 'apps-more measure'}
        aria-hidden={rest.length ? undefined : true}
        tabIndex={rest.length ? undefined : -1}
        aria-expanded={rest.length ? open : undefined}
        aria-controls={rest.length ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {t('更多')}
        {(!rest.length || unread > 0) && <span className="dot">{unread}</span>}
        <span className="caret" aria-hidden />
      </button>
      {open && rest.length > 0 && (
        <div className="apps-menu" id={menuId}>
          {rest.map((it) => (
            <button
              key={it.id}
              aria-current={value === it.id}
              onClick={() => {
                setOpen(false);
                onPick(it.id);
              }}
            >
              {face(it)}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
