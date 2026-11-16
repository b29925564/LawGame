/*
 * 法官耐心燈管（設定集 10.2、10.6）：熄一根（spent）與歸零（zero）在光敏安全 0/1 × 減少動態 0/1 四種組合下的行為。
 * 用正式建置的 CSS，在標題頁塞一組 .patience .pips（和 Courtroom.tsx 的 Tubes 同結構），換 class 後逐格取樣背景色。
 * 期望：
 *   一般：熄一根 240ms 平滑降到 0、不閃；歸零閃兩下（每秒 < 3 次）後變空心。
 *   光敏安全：熄一根照常、不閃；歸零不閃，900ms 漸暗。
 *   減少動態：直接熄，不閃、不漸變（≤ 1 格）。
 * 結果寫 /tmp/qa-tubes.txt。2026-11-16 從 qa/tests/tubes.spec.ts 搬進 repo（process-v2 第 5 節第 13 項）。
 */
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';

const LOG = '/tmp/qa-tubes.txt';
const log = (s: string) => appendFileSync(LOG, s + '\n');

async function sample(page: Page, idx: number, cls: string) {
  return page.evaluate(
    ({ idx, cls }) =>
      new Promise<{ t: number; lit: number; bg: string; border: string }[]>((res) => {
        const pip = document.querySelectorAll('#zz-tubes .pip')[idx] as HTMLElement;
        const on = getComputedStyle(
          document.querySelector('#zz-tubes .pip.on') as HTMLElement,
        ).backgroundColor;
        const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
        const ref = rgb(on);
        const out: { t: number; lit: number; bg: string; border: string }[] = [];
        const t0 = performance.now();
        pip.className = cls;
        const step = () => {
          const s = getComputedStyle(pip);
          const c = rgb(s.backgroundColor);
          const a = c[3] ?? 1;
          // 亮度：和亮著的燈管色的接近程度（1＝全亮，0＝透明或差很遠）
          const d = Math.hypot(c[0] - ref[0], c[1] - ref[1], c[2] - ref[2]) / 441;
          out.push({
            t: performance.now() - t0,
            lit: a * (1 - d),
            bg: s.backgroundColor,
            border: s.borderTopColor,
          });
          if (performance.now() - t0 < 1600) requestAnimationFrame(step);
          else res(out);
        };
        requestAnimationFrame(step);
      }),
    { idx, cls },
  );
}

function judge(s: { t: number; lit: number }[]) {
  // 亮→暗→亮 的次數＝閃；從第一格到最後一次變化的時間＝漸變長度
  let pulses = 0;
  let state = s[0].lit > 0.5;
  const rises: number[] = [];
  for (const x of s) {
    const now = x.lit > 0.5;
    if (now && !state) {
      pulses++;
      rises.push(x.t);
    }
    state = now;
  }
  const last = s[s.length - 1].lit;
  let settle = 0;
  for (const x of s) if (Math.abs(x.lit - last) > 0.03) settle = x.t;
  const mids = s.filter((x) => x.lit > 0.08 && x.lit < 0.92).length;
  const rate = rises.length >= 2 ? 1000 / (rises[1] - rises[0]) : 0;
  return { pulses, settle: Math.round(settle), mids, rate: Math.round(rate * 10) / 10, end: last };
}

for (const photosafe of ['0', '1'])
  for (const reduced of ['0', '1'])
    test(`tubes photosafe=${photosafe} reduced=${reduced}`, async ({ page }, info) => {
      await page.addInitScript(
        ({ p, r }) => {
          localStorage.setItem('rd.a11y.photosafe', p);
          localStorage.setItem('rd.a11y.reducedmotion', r);
        },
        { p: photosafe, r: reduced },
      );
      await page.goto('/');
      await page.waitForTimeout(800);
      const attrs = await page.evaluate(() => ({
        ps: document.documentElement.dataset.photosafe,
        rm: document.documentElement.dataset.reducedMotion,
      }));
      await page.evaluate(() => {
        const d = document.createElement('div');
        d.id = 'zz-tubes';
        d.innerHTML = `<span class="patience"><span class="pips">${'<span class="pip on"></span>'.repeat(5)}</span></span>`;
        d.style.cssText = 'position:fixed;top:40px;left:40px;z-index:999';
        document.body.appendChild(d);
      });
      await page.waitForTimeout(300);
      const area = await page.evaluate(() => {
        const b = (document.querySelector('#zz-tubes .pip') as HTMLElement).getBoundingClientRect();
        return {
          w: b.width,
          h: b.height,
          pct: (b.width * b.height * 100) / (innerWidth * innerHeight),
        };
      });
      // spent：5 → 4，第 5 根熄掉
      const a = judge(await sample(page, 4, 'pip'));
      // zero：把 1–4 根先直接熄掉，剩第 1 根，再 1 → 0
      await page.evaluate(() =>
        document.querySelectorAll('#zz-tubes .pip').forEach((p, i) => {
          if (i > 0) (p as HTMLElement).className = 'pip';
        }),
      );
      await page.waitForTimeout(1200);
      const zs = await sample(page, 0, 'pip spent');
      const z = judge(zs);
      const dur = await page.evaluate(() => {
        const p = document.querySelector('#zz-tubes .pip') as HTMLElement;
        const c = getComputedStyle(p);
        return `transition ${c.transitionDuration}／animation ${c.animationName} ${c.animationDuration}`;
      });
      const endBorder = zs[zs.length - 1].border;
      const endBg = zs[zs.length - 1].bg;
      const proj = info.project.name;
      log(
        `[燈管 ${proj}] photosafe=${photosafe}（html ${attrs.ps}） reduced=${reduced}（html ${attrs.rm ?? '未設'}）：燈管 ${area.w}×${area.h}px 佔畫面 ${area.pct.toFixed(3)}%`,
      );
      log(
        `  熄一根：閃 ${a.pulses} 次；漸變 ${a.settle}ms（中間格 ${a.mids}）；終點亮度 ${a.end.toFixed(2)}`,
      );
      log(
        `  歸零：閃 ${z.pulses} 次（每秒 ${z.rate}）；漸變到 ${z.settle}ms（中間格 ${z.mids}）；終點 ${endBg} 邊 ${endBorder}；${dur}`,
      );
      // 判定
      const bad: string[] = [];
      if (a.pulses) bad.push('熄一根會閃');
      if (z.rate >= 3) bad.push('歸零每秒閃 ≥ 3 次');
      if (area.pct >= 2) bad.push('燈管面積 ≥ 2%');
      if (a.end > 0.1 || z.end > 0.1) bad.push('熄了還亮');
      if (reduced === '1') {
        if (z.pulses || a.mids > 1 || z.mids > 1) bad.push('減少動態仍有閃或漸變');
      } else if (photosafe === '1') {
        if (z.pulses) bad.push('光敏安全歸零仍閃');
        // ease-light 尾段很平，900ms 的漸變在取樣上約 650–700ms 就到 3% 以內
        if (z.settle < 500) bad.push(`光敏安全歸零沒有漸暗（${z.settle}ms）`);
      } else {
        if (z.pulses !== 2) bad.push(`歸零閃 ${z.pulses} 次（應 2）`);
        if (a.settle < 150 || a.settle > 400) bad.push(`熄一根 ${a.settle}ms（應約 240）`);
      }
      log(`  判定：${bad.length ? '不過 ' + bad.join('、') : '過'}`);
      expect.soft(bad, bad.join('、')).toEqual([]);
    });
