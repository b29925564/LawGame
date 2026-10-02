import { create } from 'zustand';

/**
 * 一格一黃（設計稿 inner-voice 1.1）：螢光筆黃是盧卡斯的手，同一時間只亮一個手的記號。
 * 元件出現時認領自己的種類，優先序最高的寫到畫面根節點的 data-hand，
 * 其他手的記號由 CSS 退成鉛筆。
 */
export const handOrder = ['sync', 'gap', 'conclusion', 'highlight', 'confirm'] as const;
export type Hand = (typeof handOrder)[number];

type State = { claims: Partial<Record<Hand, number>> };

export const useHandStore = create<State>(() => ({ claims: {} }));

export function topHand(claims: State['claims']): Hand | undefined {
  return handOrder.find((h) => (claims[h] ?? 0) > 0);
}

function write(claims: State['claims']) {
  const top = topHand(claims);
  const root = typeof document === 'undefined' ? null : document.documentElement;
  if (!root) return;
  if (top) root.dataset.hand = top;
  else delete root.dataset.hand;
}

export function claimHand(h: Hand): () => void {
  const bump = (d: number) =>
    useHandStore.setState((s) => {
      const claims = { ...s.claims, [h]: Math.max(0, (s.claims[h] ?? 0) + d) };
      write(claims);
      return { claims };
    });
  bump(1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    bump(-1);
  };
}
