import { useEffect, useRef, type ReactNode } from 'react';

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

/** 分頁列。每個分頁可以帶一個小記號（未讀數、已完成的勾）。 */
export function Tabs<T extends string>({
  label,
  value,
  onPick,
  items,
}: {
  label: string;
  value: T;
  onPick: (v: T) => void;
  items: { id: T; label: string; badge?: ReactNode; done?: boolean }[];
}) {
  return (
    <nav className="apps" aria-label={label}>
      {items.map((t) => (
        <button key={t.id} aria-current={value === t.id} onClick={() => onPick(t.id)}>
          {t.done && (
            <span className="tick" aria-label="已完成">
              ✓
            </span>
          )}
          {t.label}
          {t.badge !== undefined && <span className="dot">{t.badge}</span>}
        </button>
      ))}
    </nav>
  );
}
