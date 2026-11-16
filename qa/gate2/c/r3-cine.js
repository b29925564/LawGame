// 第三輪 3b：兩集冷開場每一張黑底字卡，320／360 × 125／150 × 中英：不撐寬、字不出視窗、詞中斷／孤字；放不下會捲，捲到中段截圖。
const L = require('./lib');
const fs = require('fs');
const STEPS = { ep1: [0, 1, 8, 9, 10, 11, 12, 14], ep2: [0, 5, 6] };
const CH = { ep1: { 'cold-open': { 3: 0, 6: 1 } }, ep2: { 'cold-open': { 4: 1 } } };
const sizes = (process.argv[2] || '320,360').split(',').map((x) => +x);
const langs = (process.argv[3] || 'zh,en').split(',');
const out = [];
async function dragUp(page, x, y, dist) {
  let left = dist;
  while (left > 2) { const step = Math.min(left, page.viewportSize().height * 0.35); await L.dragAt(page, x, y + step / 2, -step); left -= step; }
}
(async () => {
  for (const size of sizes) for (const sc of [1.25, 1.5]) for (const lang of langs) for (const ep of ['ep1', 'ep2']) for (const step of STEPS[ep]) {
    const tag = `cine3-${ep}-${step}-${size}-${lang}-${sc * 100}`;
    try {
      const { ctx, page } = await L.open(size, { lang, scheme: 'light', ls: { 'lawgame-settings': { state: { textScale: sc }, version: 1 }, 'lawgame-ep-auto': L.seed({ episode: ep, scene: 0, step, choices: CH[ep] }) } });
      await L.cont(page); await page.waitForTimeout(900); await L.fontsReady(page);
      const m = await page.evaluate(() => {
        const c = document.querySelector('.cine') || document.querySelector('.cold-scope');
        if (!c) return null;
        const vw = innerWidth, de = document.documentElement;
        const over = [];
        for (const e of c.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (!r.width) continue; if (r.right > vw + 0.5 || r.left < -0.5) over.push(`${e.className.toString().slice(0, 24)} ${Math.round(r.left)}..${Math.round(r.right)}`); }
        const t = c.querySelector('.cine-text');
        const tg = document.querySelector('.menu-toggle')?.getBoundingClientRect();
        const first = c.querySelector('.cine-time, .cine-text, p, h1, h2');
        let lines = null;
        if (t) {
          const rg = document.createRange(); const L2 = {}; const tw = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let n;
          while ((n = tw.nextNode())) for (let i = 0; i < n.length; i++) { rg.setStart(n, i); rg.setEnd(n, i + 1); const r = [...rg.getClientRects()].find((x) => x.width > 0); if (!r) continue; const k = Math.round(r.top / 6); L2[k] = (L2[k] || '') + n.textContent[i]; }
          lines = Object.values(L2);
        }
        return { cls: c.className.toString().slice(0, 40), docW: de.scrollWidth, vw, docH: de.scrollHeight, vh: innerHeight, over: over.slice(0, 6), lines, textBox: t && [Math.round(t.getBoundingClientRect().left), Math.round(t.getBoundingClientRect().right)], topGap: tg && first ? Math.round(first.getBoundingClientRect().top - tg.bottom) : null };
      });
      if (!m) { console.log(JSON.stringify({ tag, none: true })); await ctx.close(); continue; }
      const a = await L.textAudit(page, '.cine, .cold-scope');
      // 英文：行界是否在單字中間
      const en = m.lines ? m.lines.slice(0, -1).map((l, i) => [l.slice(-1), m.lines[i + 1][0]]).filter(([x, y]) => /[A-Za-z]/.test(x) && /[A-Za-z]/.test(y)).length : 0;
      const shot = await L.shot(page, tag);
      let mid = null;
      if (m.docH > m.vh + 4) {
        await dragUp(page, m.vw / 2, m.vh * 0.55, (m.docH - m.vh) / 2);
        await page.waitForTimeout(250);
        mid = await L.shot(page, tag + '-mid');
        const after = await page.evaluate(() => ({ sy: scrollY, docW: document.documentElement.scrollWidth }));
        m.scrolledTo = after.sy; m.docWmid = after.docW;
      }
      const r = { tag, ...m, kwSplit: a.kwSplit, orphans: a.orphans, midWord: a.midWord, enMid: en, shot, mid };
      out.push(r); console.log(JSON.stringify(r));
      await ctx.close();
    } catch (e) { console.log(JSON.stringify({ tag, err: String(e).slice(0, 200) })); }
  }
  fs.writeFileSync(`${L.DIR}/r3-cine-${sizes.join('')}-${langs.join('')}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
