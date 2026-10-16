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
 * 照順序放得下的分頁照放，其他收進最後一格「更多」，收起來的未讀數加在「更多」上。
 * 列上的順序不跟著選的那頁變（設計師 r8：玩家靠位置找分頁）：選中的那頁在選單裡時，「更多」那一格
 * 直接寫那一頁的名字加 ⌄、畫底線；這一格的寬照收起來的分頁裡最長的留，切頁時列不會跳。
 * 量寬一律用粗體量（選中的那格是粗體），選了哪一頁都不會把最後一格擠進選單。
 */
export function Tabs<T extends string>({
  label,
  value,
  onPick,
  items,
  className,
}: {
  label: string;
  value: T;
  onPick: (v: T) => void;
  items: TabItem<T>[];
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // 每一格的粗體寬（用分頁的內容當鍵：換語言、未讀數變了就重量）。收起來的分頁量不到，用上次量的。
  const widths = useRef(new Map<string, number>());
  // 收進選單的分頁從第幾格開始（-1：全部放得下），和「更多」那一格要留的寬。
  const [cut, setCut] = useState(-1);
  const [moreW, setMoreW] = useState(0);
  const [open, setOpen] = useState(false);
  const keys = items.map(
    (it) =>
      `${it.id}|${t(it.label)}|${typeof it.badge === 'number' ? it.badge : it.badge ? '•' : ''}|${it.done ? 1 : 0}`,
  );
  const bold = (b: HTMLElement) => {
    const w = b.style.fontWeight;
    b.style.fontWeight = '700';
    const out = b.offsetWidth;
    b.style.fontWeight = w;
    return out;
  };
  const fit = () => {
    const nav = ref.current;
    const probe = measureRef.current;
    if (!nav || !probe) return;
    nav.querySelectorAll<HTMLElement>(':scope > [data-key]').forEach((b) => {
      widths.current.set(b.dataset.key!, bold(b));
    });
    const ws = keys.map((k) => widths.current.get(k));
    // 有一格還沒量過（收起來的那格換了字）：先全部攤開量一次。
    if (ws.some((w) => w === undefined)) return setCut(-1);
    const cs = getComputedStyle(nav);
    const gap = parseFloat(cs.columnGap) || 0;
    const sum = (list: number[]) => list.reduce((a, b) => a + b + gap, -gap);
    const room = nav.clientWidth;
    // 只在會捲動的那種分頁列收（--tabs-fold: 1）；桌機頂列的分頁寬度跟著內容，不收。
    const fold =
      cs.getPropertyValue('--tabs-fold').trim() === '1' && cs.flexDirection.startsWith('row');
    if (!fold || sum(ws as number[]) <= room + 0.5) return setCut(-1);
    // 「更多」那一格：「更多」加一個未讀數，或收起來的任何一頁的名字，加上 ⌄，取最寬的。
    const caret = probe.querySelector<HTMLElement>('.caret');
    const cm = caret ? getComputedStyle(caret) : null;
    const caretW = caret
      ? caret.getBoundingClientRect().width +
        parseFloat(cm!.marginLeft) +
        parseFloat(cm!.marginRight)
      : 0;
    const base = bold(probe);
    const slot = (k: number) => Math.max(base, ...(ws.slice(k) as number[]).map((x) => x + caretW));
    let k = items.length - 1;
    while (k > 0 && sum(ws.slice(0, k) as number[]) + gap + slot(k) > room + 0.5) k--;
    setCut(k);
    setMoreW(Math.ceil(slot(k)));
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
    // 字型載完分頁會變寬，列本身的寬不變、ResizeObserver 不會叫：量過的寬全部作廢，攤開重量。
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const reset = () => {
      widths.current.clear();
      setCut(-1);
      refit.current();
    };
    fonts?.addEventListener('loadingdone', reset);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener('loadingdone', reset);
    };
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

  const shown = cut < 0 ? items : items.slice(0, cut);
  const rest = cut < 0 ? [] : items.slice(cut);
  const unread = rest.reduce((n, it) => n + (typeof it.badge === 'number' ? it.badge : 0), 0);
  const picked = rest.find((it) => it.id === value);
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
      className={['apps', rest.length && 'has-more', className].filter(Boolean).join(' ')}
      aria-label={t(label)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        setOpen(false);
        moreRef.current?.focus();
      }}
    >
      {shown.map((it, i) => (
        <button
          key={it.id}
          data-key={keys[i]}
          aria-current={value === it.id}
          onClick={() => onPick(it.id)}
        >
          {face(it)}
        </button>
      ))}
      {rest.length > 0 && (
        <button
          ref={moreRef}
          className="apps-more"
          style={{ minWidth: moreW }}
          aria-current={!!picked}
          aria-label={picked ? t('更多：{tab}', { tab: t(picked.label) }) : undefined}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          {picked ? face(picked) : t('更多')}
          {!picked && unread > 0 && <span className="dot">{unread}</span>}
          <span className="caret" aria-hidden />
        </button>
      )}
      {/* 量「更多」那一格的寬（含一個未讀數）：看不見、不佔位。 */}
      <button ref={measureRef} className="apps-more measure" aria-hidden tabIndex={-1}>
        {t('更多')}
        <span className="dot">0</span>
        <span className="caret" />
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
