import { useEffect, useRef } from 'react';
import { reducedMotion } from './a11y';
import { hidden, KEYS, opacities, useCourtLight } from './courtLight';

const url = (device: 'desktop' | 'phone', k: number, ext: 'avif' | 'webp') =>
  new URL(`./court/court-${device}-${k}.${ext}`, import.meta.url).href;

/**
 * 法庭光層試做：四張預先合成的關鍵格疊在一起，只隨陪審團平均改 opacity。
 * 心證變化時補間 750ms，玩家只感覺房間變亮變暗，不看到數字跳。開關在選項裡。
 */
export function CourtLight({ avg, threshold }: { avg: number; threshold: number }) {
  const on = useCourtLight((s) => s.on);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    if (!on) return;
    const paint = (v: number) => {
      const op = opacities(v, threshold);
      const hide = hidden(op);
      imgs.current.forEach((im, i) => {
        if (!im) return;
        im.style.opacity = String(op[i]);
        im.style.visibility = hide[i] ? 'hidden' : 'visible';
      });
      shown.current = v;
    };
    const from = shown.current;
    if (from === null || reducedMotion()) {
      paint(avg);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 750);
      paint(from + (avg - from) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, avg, threshold]);

  if (!on) return null;
  return (
    <div className="court-light" aria-hidden>
      {KEYS.map((k, i) => (
        <picture key={k}>
          <source media="(max-width: 700px)" type="image/avif" srcSet={url('phone', k, 'avif')} />
          <source media="(max-width: 700px)" type="image/webp" srcSet={url('phone', k, 'webp')} />
          <source type="image/avif" srcSet={url('desktop', k, 'avif')} />
          <img
            ref={(el) => {
              imgs.current[i] = el;
            }}
            src={url('desktop', k, 'webp')}
            alt=""
            decoding="async"
            style={{ opacity: i === 0 ? 1 : 0 }}
          />
        </picture>
      ))}
    </div>
  );
}
