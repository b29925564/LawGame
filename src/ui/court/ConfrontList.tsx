import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';

/** 捲動框四周留給焦點圈的空間（outline 2px＋offset 2px），框用負邊距退回原位。 */
const RING = 4;

/**
 * 交互詰問「3 對質」的論點清單（v97 第二道關卡第 6 點，設計師裁定 A）。
 *
 * 桌機：清單自己捲，不讓外面的工作區在某一列中間切掉。框高取「工作區放得下的高度」裡最後一張完整的列；
 * 下面還有列時下緣出現內陰影，捲過頂端時上緣也出現（不用虛線、不加字）。
 * 鍵盤 Tab 到框外的列，框自己捲到那一列完整露出。
 * 手機（boxed=false）：照舊，整頁捲。
 */
export function ConfrontList({ boxed, children }: { boxed: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [shade, setShade] = useState({ up: false, down: false });

  const edges = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const up = el.scrollTop > 1;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setShade((s) => (s.up === up && s.down === down ? s : { up, down }));
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const body = el.closest<HTMLElement>('.shell-body');
    const fit = () => {
      el.style.maxHeight = '';
      if (!boxed || !body) return edges();
      const rows = [...el.children] as HTMLElement[];
      // 其他東西都放得下之後，剩下給清單的高度。
      const avail = body.clientHeight - (body.scrollHeight - el.offsetHeight);
      if (rows.length < 2 || el.offsetHeight <= avail) return edges();
      const top = el.getBoundingClientRect().top;
      const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const fits = rows.map((r) => r.getBoundingClientRect().bottom - top + pad);
      // 至少兩列：工作區再矮也要看得出是一份可以捲的清單（外面的工作區照舊可以捲）。
      let k = 2;
      while (k < rows.length && fits[k] <= avail) k++;
      el.style.maxHeight = `${Math.ceil(fits[k - 1])}px`;
      edges();
    };
    fit();
    if (!boxed || !body || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(body);
    const panel = el.closest('.panel');
    if (panel) ro.observe(panel);
    return () => ro.disconnect();
  }, [boxed, edges]);

  /** Tab 到被框切到的列：框捲到那一列完整露出（只捲這個框，不動外面）。 */
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el || !boxed || el.scrollHeight <= el.clientHeight) return;
    const row = [...el.children].find((c) => c.contains(e.target)) as HTMLElement | undefined;
    if (!row) return;
    const show = () => {
      const r = row.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (r.top < b.top + RING) el.scrollTop -= b.top + RING - r.top;
      else if (r.bottom > b.bottom - RING) el.scrollTop += r.bottom - (b.bottom - RING);
    };
    show();
    // 瀏覽器自己的焦點捲動可能在這之後才跑：下一格再對一次。
    requestAnimationFrame(show);
  };

  if (!boxed) return <div className="stack">{children}</div>;
  return (
    <div
      className="confront-list"
      data-up={shade.up || undefined}
      data-down={shade.down || undefined}
    >
      <div
        ref={box}
        className="stack confront-scroll"
        onScroll={edges}
        onFocus={onFocus}
        style={{ padding: RING, margin: -RING }}
      >
        {children}
      </div>
      <span aria-hidden className="confront-shade top" />
      <span aria-hidden className="confront-shade bottom" />
    </div>
  );
}
