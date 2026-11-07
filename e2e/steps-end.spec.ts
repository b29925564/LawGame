import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 分格動畫（steps(n, end)）播完要停在最後一格。
 * Chrome 在某些「延遲＋長度」組合下，算到結尾時的進度是 0.9999999999999989：steps(4) 停在 3/4，steps(1, end) 停在前一格
 * （例：167ms steps(4) 延遲 3000ms 停在 scale 0.75；延遲 0／600／1600ms 正常）。黑條蓋不滿、燈管停在暗的那一閃。
 * 修法：每個用 steps() 而且要停在終值（forwards／both）的 @keyframes，終值從 99.9% 就寫明。
 */

/** 現在用 steps() 停在終值的動畫：全部都要找得到，免得檢查漏掉。 */
const EXPECTED = [
  'dk-swipe',
  'hand-char',
  'swipe',
  'swipe-y',
  'bar-in',
  'bar-out',
  'rec-redact',
  'rec-unbar',
  'v-cover',
  'act-ignite',
  'act-lit',
  'act-pull',
  'place-slate-cut',
  'tube-spent',
  // 片頭（#319）
  'ti-bar',
  'ti-gone',
  'ti-lit',
  'ti-on',
  'ti-out',
  'ti-show',
  'ti-sweep',
  'ti-swipe',
];

/** 原始碼的樣式表（打包後 steps(1, end) 會被縮成 step-end、簡寫裡有 var() 時 CSSOM 也讀不出來，所以讀原始碼）。 */
const CSS = readdirSync(new URL('../src/', import.meta.url), { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** 每個 @keyframes 的內容（連媒體查詢裡的）。 */
const KEYFRAMES = (() => {
  const out: Record<string, string> = {};
  for (const m of CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const from = i;
    for (; i < CSS.length && depth; i++) depth += CSS[i] === '{' ? 1 : CSS[i] === '}' ? -1 : 0;
    out[m[1]] = CSS.slice(from, i - 1);
  }
  return out;
})();

/** 用 steps() 而且停在終值（forwards／both）的動畫名。 */
const STEPPED = (() => {
  const names = new Set<string>();
  for (const m of CSS.matchAll(/(?:^|[;{\s])animation\s*:\s*([^;}]+)/g)) {
    let depth = 0;
    let cur = '';
    const parts: string[] = [];
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts) {
      if (!/steps\(|step-(end|start)/.test(p) || !/\b(both|forwards)\b/.test(p)) continue;
      for (const w of p.trim().split(/\s+/)) if (w in KEYFRAMES) names.add(w);
    }
  }
  return [...names].sort();
})();

test('每個分格動畫的終值從 99.9% 就寫明', () => {
  expect(STEPPED).toEqual([...EXPECTED].sort());
  const missing = STEPPED.filter((n) => !/(^|[\s,}])99\.9%\s*[,{]/.test(KEYFRAMES[n]));
  expect(missing).toEqual([]);
});

test('延遲 3000ms 的分格動畫停在最後一格，和沒有延遲的一樣', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const bad = await page.evaluate(async (names) => {
    // 每個動畫動到哪些屬性：讀打包後的 @keyframes（外部字型的樣式表讀不到規則，跳過）。
    const props: Record<string, string[]> = {};
    const walk = (rules: CSSRuleList) => {
      for (const r of rules) {
        if (r instanceof CSSKeyframesRule) {
          const set = new Set<string>();
          for (const k of r.cssRules) for (const p of (k as CSSKeyframeRule).style) set.add(p);
          props[r.name] = [...set];
        } else if (r instanceof CSSGroupingRule) walk(r.cssRules);
      }
    };
    for (const sh of document.styleSheets) {
      try {
        walk(sh.cssRules);
      } catch {
        continue;
      }
    }
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:0;width:200px;';
    document.body.append(box);
    const make = (name: string, n: number, delay: number) => {
      const el = document.createElement('div');
      el.style.cssText = `width:100px;height:10px;animation:${name} 167ms steps(${n}, end) ${delay}ms both;`;
      box.append(el);
      return el;
    };
    const pairs = names.flatMap((name) =>
      [1, 4, 12].map((n) => ({ name, n, late: make(name, n, 3000), now: make(name, n, 0) })),
    );
    await new Promise((r) => setTimeout(r, 3600));
    const out: string[] = [];
    for (const { name, n, late, now } of pairs)
      for (const p of props[name] ?? []) {
        const a = getComputedStyle(late).getPropertyValue(p);
        const b = getComputedStyle(now).getPropertyValue(p);
        if (a !== b) out.push(`${name} steps(${n}) ${p}: ${a} ≠ ${b}`);
      }
    box.remove();
    const lost = names.filter((n) => !props[n]?.length);
    return lost.length ? [`打包後找不到：${lost.join('、')}`, ...out] : out;
  }, STEPPED);
  expect(bad).toEqual([]);
});
