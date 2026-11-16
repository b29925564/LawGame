// 第六輪 3：v93 排字規則（不出框、專有名詞不拆、手機框/黑底字卡中文最後一行 ≥3 字）＋ .fl-wrap 拆開處截圖。只讀；讀檔進場景，真點擊。
// 用法：node r6-flscan.js <size> <lang> <scale> <scheme> <tag>
const L = require('./lib');
const fs = require('fs');
const NAMES = JSON.parse(fs.readFileSync(__dirname + '/names8.json', 'utf8'));
const hung = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8')).ep2;
const SCENES = [
  ['ep1', 0, '冷開場', 0, 'blank'], ['ep1', 0, '冷開場2233', 1, 'blank'], ['ep1', 0, '冷開場2241', 2, 'blank'],
  ['ep1', 0, '冷開場訊息', 3, 'blank'], ['ep1', 0, '冷開場叫車', 4, 'blank'], ['ep1', 0, '冷開場上車', 5, 'blank'],
  ['ep1', 0, '冷開場對話選項', 6, 'blank'], ['ep1', 1, '集名卡', 0, 'blank'], ['ep1', 2, '對話', 0, 'blank'],
  ['ep1', 4, '訪談', 0, 'blank'], ['ep1', 7, '桌面', 0, 'blank'], ['ep1', 10, '取證', 0, 'blank'],
  ['ep1', 11, '協商', 0, 'blank'], ['ep1', 13, '案件理論', 0, 'blank'], ['ep1', 15, '選陪審團', 0, 'blank'],
  ['ep1', 16, '開場陳述', 0, 'blank'], ['ep1', 17, '交互詰問', 0, 'blank'], ['ep1', 22, '辯方', 0, 'blank'],
  ['ep1', 26, '結辯', 0, 'blank'], ['ep2', 0, '冷開場', 0, 'blank'], ['ep2', 0, '冷開場赫克托', 1, 'blank'],
  ['ep2', 0, '冷開場派單', 4, 'blank'], ['ep2', 4, '訪談', 0, 'blank'], ['ep2', 6, '桌面', 0, 'blank'],
  ['ep2', 8, '取證', 0, 'blank'], ['ep2', 9, '取證對方', 0, 'blank'], ['ep2', 11, '幕卡', 0, 'blank'],
  ['ep2', 12, '調解', 0, 'blank'], ['ep2', 14, '案件理論', 0, 'blank'], ['ep2', 15, '選陪審團', 0, 'clear'],
  ['ep2', 16, '開場陳述', 0, 'vd'], ['ep2', 17, '交互詰問', 0, 'vd'], ['ep2', 21, '結辯', 0, 'closing'],
  ['ep2', 22, '尾聲對話', 0, 'hung'], ['ep2', 30, '尾聲來電', 0, 'hung'], ['ep2', 30, '尾聲來電通知', 2, 'hung'],
  ['ep2', 30, '尾聲來電回覆', 3, 'hung'], ['ep2', 30, '尾聲來電選項', 4, 'hung'],
];
function progressOf(ep, scene, step, seed) {
  const blank = { episode: ep, scene, step, choices: ep === 'ep1' ? { 'cold-open': { 3: 0, 6: 1 } } : { 'cold-open': { 4: 1 } }, cards: [], flags: [], ethics: [], scenes: {} };
  if (seed === 'blank') return blank;
  const scenes = { ...hung.scenes };
  const keep = seed === 'clear' ? {} : seed === 'vd' ? { 'voir-dire': scenes['voir-dire'] } : seed === 'closing' ? Object.fromEntries(Object.entries(scenes).filter(([k]) => k !== 'closing')) : scenes;
  return { ...hung, scene, step, scenes: keep };
}
const LONG = '.transcript, .speech, .narration, .vo-log, .list .row-item, .terms, .credits, .sub-card .tx, .doc-lines';
const OWN = '.act-head';

const scan = (page) => page.evaluate(([names, long, own]) => {
  const vis = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false; if (/auto|scroll/.test(cs.overflowX) && x.scrollWidth > x.clientWidth) return false; const xr = x.getBoundingClientRect(); if (cs.overflow === 'hidden' && (xr.width <= 1 || xr.height <= 1)) return false; if (x.closest('[aria-hidden="true"], [inert]')) return false; } return true; };
  const inline = (e) => /^(inline|inline-block|inline-flex|inline-grid|contents)$/.test(getComputedStyle(e).display);
  const blockOf = (e) => { let x = e; while (x && x !== document.body && inline(x)) x = x.parentElement; return x; };
  const content = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const n = (v) => parseFloat(v) || 0; return { l: r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft), r: r.right - n(cs.borderRightWidth) - n(cs.paddingRight) }; };
  const nm = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  const over = [], split = [], tail = [];
  const r = document.createRange();
  const byBlock = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
    if (n.parentElement.closest(long)) continue;
    const b = blockOf(n.parentElement); if (!b) continue;
    byBlock.set(b, [...(byBlock.get(b) || []), n]);
    if (n.parentElement.closest(own)) continue;
    r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((q) => q.width && q.height);
    let box = b;
    for (let k = 0; box && box !== document.body && k < 3; k++) {
      const c = content(box);
      const q = rects.find((q) => q.right > c.r + 1 || q.left < c.l - 1);
      if (q) { over.push(`「${n.textContent.trim().slice(0, 24)}」超出 ${nm(box)} ${Math.round(Math.max(q.right - c.r, c.l - q.left))}px`); break; }
      if (/absolute|fixed/.test(getComputedStyle(box).position)) break;
      box = blockOf(box.parentElement);
    }
    if (rects.some((q) => q.right > innerWidth + 1 || q.left < -1)) over.push(`「${n.textContent.trim().slice(0, 24)}」出視窗`);
  }
  for (const [b, nodes] of byBlock) {
    const text = nodes.map((n) => n.textContent).join('').replace(/ /g, ' ');
    const used = new Array(text.length).fill(false);
    const at = (i) => { let o = i; for (const n of nodes) { if (o < n.length) return [n, o]; o -= n.length; } return [nodes[nodes.length - 1], nodes[nodes.length - 1].length]; };
    const cw = content(b);
    for (const { n, cuts } of names) {
      for (let s = text.indexOf(n); s >= 0; s = text.indexOf(n, s + 1)) {
        if (used.slice(s, s + n.length).some(Boolean)) continue;
        used.fill(true, s, s + n.length);
        let top = null, cut = -1;
        for (let i = 0; i < n.length; i++) { const [tn, o] = at(s + i); r.setStart(tn, o); r.setEnd(tn, Math.min(o + 1, tn.length)); const q = r.getClientRects()[0]; if (!q || !q.width) continue; if (top !== null && q.top > top + 4) { cut = i; break; } top = q.top; }
        if (cut < 0) continue;
        const [tn] = at(s); const cs = getComputedStyle(tn.parentElement);
        const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
        const wide = ctx.measureText(n).width > cw.r - cw.l - 1;
        let c = cut; while (c > 0 && n[c - 1] === ' ') c--;
        const okCut = cuts.includes(cut) || cuts.includes(c) || cuts.includes(c + 1);
        if (!(wide && okCut)) split.push(`${n.slice(0, cut)}｜${n.slice(cut)}（${nm(b)}${wide ? '，放不下但拆在詞中間' : ''}）`);
      }
    }
  }
  const linesOf = (el) => { const L = []; let top = null; const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = wk.nextNode(); n; n = wk.nextNode()) for (let i = 0; i < n.length; i++) { r.setStart(n, i); r.setEnd(n, i + 1); const q = r.getClientRects()[0]; if (!q || !q.width) { if (L.length) L[L.length - 1] += n.data[i]; continue; } if (top === null || q.top > top + 4) L.push(''); top = q.top; L[L.length - 1] += n.data[i]; } return L; };
  const zh = [];
  for (const el of document.querySelectorAll('.phone-body .bubble, .phone-body .replies button, .cine-text, .phone-body .subtitles li > span, .cands .job, .cands .line')) {
    if (!vis(el) || !/\p{Script=Han}/u.test(el.textContent || '')) continue;
    const Ls = linesOf(el).map((x) => x.trim()).filter(Boolean);
    if (Ls.length < 2) continue;
    const cls = nm(el).slice(0, 30);
    Ls.forEach((l, i) => {
      const n = (l.match(/[\p{L}\p{N}]/gu) || []).length;
      if (n < 3) zh.push(`行<3字 ${Ls.join('｜')}（${cls}）`);
      if (i > 0 && /^[的了著過地得]/.test(l)) zh.push(`行首虛詞 ${Ls.join('｜')}（${cls}）`);
      const core = l.replace(/[，。、？！：；」）…—\s]+$/, '');
      if (i < Ls.length - 1 && core === l && /[把在被跟和與對從向沒又]$/.test(l)) zh.push(`行尾介連否 ${Ls.join('｜')}（${cls}）`);
      if (i < Ls.length - 1 && /[一二三四五六七八九十兩幾\d][個台輛支張件位名把條間棟層次天年週]$/.test(l)) zh.push(`數量詞留行尾 ${Ls.join('｜')}（${cls}）`);
    });
    if (/\p{Script=Han}/u.test(Ls[Ls.length - 1])) { const last = Ls[Ls.length - 1]; if ((last.match(/[\p{L}\p{N}]/gu) || []).length < 3) tail.push(`${el.textContent.trim()}（最後一行「${last}」）`); }
  }
  // .fl-wrap：拆開的單位，記錄所在區塊的分行
  const wraps = [];
  const seen = new Set();
  for (const f of document.querySelectorAll('.fl.fl-wrap')) {
    if (!vis(f)) continue;
    const b = blockOf(f); if (!b || seen.has(b)) continue; seen.add(b);
    const br = b.getBoundingClientRect();
    wraps.push({ unit: f.textContent.slice(0, 40), block: nm(b).slice(0, 60), lines: linesOf(b).map((x) => x.trim()), rect: [br.left, br.top, br.width, br.height].map(Math.round) });
  }
  const ell = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && vis(e)).map(nm);
  return { over: [...new Set(over)], split: [...new Set(split)], tail, zh: [...new Set(zh)], wraps, ell, docW: document.documentElement.scrollWidth, vw: innerWidth };
}, [NAMES, LONG, OWN]);

(async () => {
  const [size, lang, sc, scheme, tag] = process.argv.slice(2);
  const only = process.argv[7] ? process.argv[7].split(',').map(Number) : null;
  const out = [];
  for (let i = 0; i < SCENES.length; i++) {
    if (only && !only.includes(i)) continue;
    const [ep, scene, label, step, seed] = SCENES[i];
    const id = `sc-${tag}-${String(i).padStart(2, '0')}`;
    try {
      const prog = progressOf(ep, scene, step, seed);
      const { ctx, page } = await L.open(+size, { lang, scheme, ls: { 'lawgame-settings': { state: { textScale: +sc, voScale: +sc }, version: 1 }, 'lawgame-ep-auto': { version: 5, savedAt: Date.now(), label: 'x', progress: prog } } });
      await page.setViewportSize({ width: +size, height: 740 });
      await L.cont(page);
      await page.waitForTimeout(400);
      const beat = page.locator('.place-beat');
      if (await beat.count()) { await L.press(page, beat, { scroll: false }).catch(() => {}); }
      await L.fontsReady(page);
      await page.waitForTimeout(900);
      if (/選陪審團/.test(label)) { const b = page.locator('main button').filter({ hasText: /^(開始遴選|Begin|Start)/ }); if (await b.count() && (await b.first().isVisible())) { await L.press(page, b.first()); await page.waitForTimeout(900); } }
      const m = await scan(page);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('DOM.getDocument', { depth: -1 });
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      m.ax = { buttons: 0, chevron: [], space: [], mismatch: [] };
      for (const n of nodes) {
        if (n.ignored || !n.role || n.role.value !== 'button' || !n.backendDOMNodeId) continue;
        const name = n.name ? n.name.value : '';
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId }).catch(() => ({}));
        if (!object) continue;
        const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: 'function(){return {t:this.textContent, al:this.getAttribute("aria-label"), lb:this.getAttribute("aria-labelledby"), ch: !!this.closest(".choices,.replies"), cand: !!this.closest(".cands"), fits: [...this.querySelectorAll("*")].filter((e) => e.querySelector(":scope > .zh-line")).map((e) => e.textContent)}}' });
        const d = result.value; m.ax.buttons++;
        if (/^[›>»]\s?/.test(name) || /›/.test(name)) m.ax.chevron.push(name.slice(0, 50));
        if (/\s{2,}/.test(name) || name !== name.trim() || /[\p{Script=Han}（）「」，。、：；！？]\s+[\p{Script=Han}（）「」，。、：；！？]/u.test(name)) m.ax.space.push(name.slice(0, 200));
        const norm = (d.t || '').replace(/[\s\u00a0]+/g, ' ').trim();
        if (!d.al && !d.lb && name.replace(/\s/g, '') !== norm.replace(/\s/g, '')) m.ax.mismatch.push(`${name.slice(0, 60)} ≠ ${norm.slice(0, 60)}`);
        for (const f of d.fits || []) { m.ax.fits = (m.ax.fits || 0) + 1; if (!name.includes(f)) m.ax.fitBad = [...(m.ax.fitBad || []), `${f.slice(0, 30)} ∉ ${name.slice(0, 80)}`]; }
        if (/[\n\r\u2028\u2029]/.test(name)) m.ax.newline = (m.ax.newline || 0) + 1;
        if (d.cand) m.ax.cand = (m.ax.cand || 0) + 1;
        if (d.ch) m.ax.choice = (m.ax.choice || 0) + 1;
      }
      await cdp.detach();
      const shot = await L.shot(page, id);
      const crops = [];
      for (const [k, wv] of m.wraps.slice(0, 4).entries()) {
        const [x, y, wd, h] = wv.rect;
        if (wd < 2 || h < 2 || y > 740 || y + h < 0) continue;
        const cy = Math.max(0, y - 10), ch = Math.min(740 - cy, h + 20);
        crops.push(await L.shot(page, `${id}-w${k}`, { clip: { x: Math.max(0, x - 10), y: cy, width: Math.min(+size - Math.max(0, x - 10), wd + 20), height: ch } }));
      }
      const r = { id, ep, scene, step, label, ...m, shot, crops };
      out.push(r);
      console.log(JSON.stringify(r));
      await ctx.close();
    } catch (e) { console.log(JSON.stringify({ id, label, err: String(e).slice(0, 200) })); }
  }
  fs.writeFileSync(L.DIR + `/r8-scan-${tag}${only ? '-' + only.join('_') : ''}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
