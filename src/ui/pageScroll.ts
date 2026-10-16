import { reducedMotion } from './a11y';
import { easeOf } from './court/climb';

/** 捲動時長（ms）：設計師 2026-10-16 裁定 ≤300ms。 */
const DUR = 280;

/**
 * 把頁面捲到 top（px）：--ease-light、不回彈；減少動態時直接跳過去。
 * 玩家自己動手（滾輪、觸控、鍵盤）就停手，不跟玩家搶。
 */
export function scrollPageTo(top: number) {
  const to = Math.max(0, Math.round(top));
  if (reducedMotion()) {
    window.scrollTo(0, to);
    return;
  }
  const root = document.documentElement;
  const ease = easeOf(getComputedStyle(root).getPropertyValue('--ease-light'));
  const from = window.scrollY;
  if (Math.abs(to - from) < 1) return;
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    for (const ev of ['wheel', 'touchstart', 'keydown'] as const)
      window.removeEventListener(ev, stop);
  };
  for (const ev of ['wheel', 'touchstart', 'keydown'] as const)
    window.addEventListener(ev, stop, { passive: true });
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / DUR);
    window.scrollTo(0, from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(step);
    else stop();
  };
  raf = requestAnimationFrame(step);
}
