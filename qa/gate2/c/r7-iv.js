// 第七輪 2：會見底部按鈕列（提問／施壓／安撫）＋問題鈕／施壓鈕的中文排行。讀檔進 ep1 s4／ep2 s4，之後真點擊、觸控捲動。只讀量測。
// 用法：BASE=... node r7-iv.js <tag>
const L = require('./lib');
const fs = require('fs');
const tagBase = process.argv[2] || 'new';
const BAD_HEAD = /^[的了著過地得]/;
const BAD_TAIL = /[把在被跟和與對從向沒又]$/;

const measureRow = (page) => page.evaluate(() => {
  const rg = document.createRange();
  const linesOf = (el) => { const L = []; let top = null; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let q; while ((q = tw.nextNode())) for (let i = 0; i < q.length; i++) { rg.setStart(q, i); rg.setEnd(q, i + 1); const r = [...rg.getClientRects()].find((x) => x.width > 0); if (!r) { if (L.length) L[L.length - 1] += q.data[i]; continue; } if (top === null || r.top > top + r.height * 0.5) L.push(''); top = r.top; L[L.length - 1] += q.data[i]; } return L.map((x) => x.trim()); };
  // 可見範圍：往上找會裁切的祖先
  const visible = (el) => { let r = el.getBoundingClientRect(); let v = { l: r.left, t: r.top, r: r.right, b: r.bottom }; for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (/hidden|clip|auto|scroll/.test(cs.overflowY) || /hidden|clip|auto|scroll/.test(cs.overflowX)) { const p = x.getBoundingClientRect(); v = { l: Math.max(v.l, p.left), t: Math.max(v.t, p.top), r: Math.min(v.r, p.right), b: Math.min(v.b, p.bottom) }; } } return v; };
  const calm = [...document.querySelectorAll('button')].find((b) => /安撫|Reassure|Calm/.test(b.textContent));
  if (!calm) return { err: 'no calm' };
  const row = calm.parentElement;
  const btns = [...row.querySelectorAll(':scope > button, :scope > div > button, :scope button')].filter((b, i, a) => a.indexOf(b) === i);
  const res = btns.map((b) => { const r = b.getBoundingClientRect(); const v = visible(b); return { text: b.textContent.trim(), lines: linesOf(b), w: Math.round(r.width), h: Math.round(r.height * 10) / 10, top: Math.round(r.top), left: Math.round(r.left), clipB: Math.round((r.bottom - v.b) * 10) / 10, clipT: Math.round((v.t - r.top) * 10) / 10, clipR: Math.round((r.right - v.r) * 10) / 10, sw: b.scrollWidth, cw: b.clientWidth }; });
  const panel = row.closest('.panel, section, .card, .actions') || row.parentElement;
  const pr = panel.getBoundingClientRect(); const rr = row.getBoundingClientRect();
  const pcs = getComputedStyle(panel);
  const rows = [...new Set(res.map((x) => x.top))].length;
  return { btns: res, rows, row: [rr.left, rr.top, rr.width, rr.height].map(Math.round), panel: { cls: panel.className.toString().slice(0, 40), rect: [pr.left, pr.top, pr.width, pr.height].map(Math.round), ovf: pcs.overflow, rowInside: Math.round((pr.bottom - parseFloat(pcs.paddingBottom) - rr.bottom) * 10) / 10 }, docW: document.documentElement.scrollWidth, vw: innerWidth };
});
const measureList = (page) => page.evaluate(() => {
  const rg = document.createRange();
  const linesOf = (el) => { const L = []; let top = null; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let q; while ((q = tw.nextNode())) for (let i = 0; i < q.length; i++) { rg.setStart(q, i); rg.setEnd(q, i + 1); const r = [...rg.getClientRects()].find((x) => x.width > 0); if (!r) { if (L.length) L[L.length - 1] += q.data[i]; continue; } if (top === null || r.top > top + r.height * 0.5) L.push(''); top = r.top; L[L.length - 1] += q.data[i]; } return L.map((x) => x.trim()); };
  const pan = document.querySelector('#iv-panel');
  if (!pan) return [];
  return [...pan.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), lines: linesOf(b), h: Math.round(r.height), fl: !!b.querySelector('.fl'), over: b.scrollWidth > b.clientWidth + 1 }; });
});

(async () => {
  const out = [];
  for (const ep of ['ep1', 'ep2'])
    for (const size of [320, 360])
      for (const ts of [1.25, 1.5])
        for (const lang of ['zh', 'en']) {
          const tag = `iv-${tagBase}-${ep}-${size}-${lang}-${ts * 100}`;
          try {
            const { ctx, page } = await L.open(size, { lang, ls: { 'lawgame-settings': { state: { textScale: ts }, version: 1 }, 'lawgame-ep-auto': L.seed({ episode: ep, scene: 4 }) } });
            await L.cont(page); await page.waitForTimeout(1500); await L.fontsReady(page);
            const vp = page.viewportSize();
            // 觸控捲到按鈕列整個看得到
            for (let k = 0; k < 8; k++) {
              const b = await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find((b) => /安撫|Reassure|Calm/.test(b.textContent)); const r = c.parentElement.getBoundingClientRect(); return r.bottom; });
              if (b < vp.height - 8) break;
              await L.dragAt(page, vp.width / 2, vp.height * 0.7, -vp.height * 0.35); await page.waitForTimeout(350);
            }
            const row = await measureRow(page);
            const ask = await measureList(page);
            const shotRow = await L.shot(page, tag);
            // 施壓分頁：真點擊
            const pressTab = page.locator('#iv-tab-press');
            let press = [];
            if (await pressTab.count()) { await L.press(page, pressTab); await page.waitForTimeout(600); press = await measureList(page); }
            const shotPress = await L.shot(page, tag + '-press');
            const lineIssues = [];
            for (const [kind, list] of [['ask', ask], ['press', press]])
              for (const b of list) {
                if (b.over) lineIssues.push(`${kind} 出框 ${b.text}`);
                if (lang !== 'zh' || b.lines.length < 2) continue;
                b.lines.forEach((l, i) => {
                  const n = (l.match(/[\p{L}\p{N}]/gu) || []).length;
                  if (n < 3) lineIssues.push(`${kind} 行<3字 ${b.lines.join('｜')}`);
                  if (i > 0 && BAD_HEAD.test(l)) lineIssues.push(`${kind} 行首虛詞 ${b.lines.join('｜')}`);
                  if (i < b.lines.length - 1 && BAD_TAIL.test(l.replace(/[，。、？！：；」）]+$/, ''))) lineIssues.push(`${kind} 行尾介連否 ${b.lines.join('｜')}`);
                });
              }
            const r = { tag, row, ask, press, lineIssues: [...new Set(lineIssues)], shotRow, shotPress };
            out.push(r); console.log(JSON.stringify(r));
            await ctx.close();
          } catch (e) { console.log(JSON.stringify({ tag, err: String(e).slice(0, 200) })); }
        }
  fs.writeFileSync(L.DIR + `/r7-iv-${tagBase}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
