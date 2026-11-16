// 第八輪：labels7 加完整無障礙名稱檢查（多空白、箭頭、名稱和畫面字一致）。
// 第七輪 3＋4：第 1 集 short-labels 19 個場景（加法庭開庭後），320／360 × 125／150% × 中英。讀檔進去，真點「繼續（」；
// 有定場字卡（.place-beat）時先量一次（待放 3D 機位佔位字），再真點字卡、量第二次。
// 規則（自己的量法）：出框（區塊＋外兩層＋裁切祖先＋視窗）、專有名詞／房名／12th-floor 不拆、英文最後一行單字、
// 中文數詞量詞在行尾或單獨一行、中文每行 ≥3 字（字卡、手機框、候選人卡）、行首「的了著過地得」、行尾「把在被跟和與對從向沒又」、
// 譯名只在「・」後斷；選單鈕四向 8px（字的逐行框、有框或底色的元素）；CDP 無障礙樹裡按鈕名稱有沒有「›」。
const L = require('../lib.js');
const fs = require('fs');
const [sizesA = 'm320,m360', langsA = 'zh,en', scalesA = '1.25,1.5', only] = process.argv.slice(2);
const PFX = process.env.SHOTPFX || 'a8-';
const src = (f) => fs.readFileSync((process.env.REPO_ROOT || '.') + '/src/ui/' + f, 'utf8');
const strs = (s) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const en = src('enNames.ts'); const EN = strs(en.slice(en.indexOf('EN_NAMES = ['), en.indexOf('];', en.indexOf('EN_NAMES = ['))));
const lu = src('lineUnits.ts'); const ZH = strs(lu.slice(lu.indexOf('PROPER_ZH = ['), lu.indexOf('\n];', lu.indexOf('PROPER_ZH = ['))));
const ORDS = ['一', '二', '三', '四', '五', '六', '七'].map((n) => `第${n}幕`);
const NAMES = [...new Set([...EN, ...ZH, ...ORDS, 'Conference Room A', 'Conference Room B', 'Courtroom 5', 'Courtroom 3', 'Room A', 'Room B'])].sort((a, b) => b.length - a.length);
const kow = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/court-kowalski.json', 'utf8')).ep1;
const SCENES = [[0, '冷開場', 0], [0, '冷開場2233', 1], [0, '冷開場2241', 2], [0, '冷開場訊息', 3], [0, '冷開場叫車', 4], [0, '冷開場上車', 5], [0, '冷開場對話選項', 6], [1, '集名卡', 0], [2, '對話', 0], [4, '訪談', 0], [7, '桌面', 0], [10, '取證', 0], [11, '協商', 0], [13, '案件理論', 0], [15, '選陪審團', 0], [16, '開場陳述', 0], [17, '交互詰問', 0], [22, '辯方', 0], [26, '結辯', 0], ['court', '法庭（開庭後）', 0]];
const LONG = '.transcript, .speech, .narration, .vo-log, .list .row-item, .terms, .credits, .sub-card .tx, .doc-lines, .cam-sub';
const SCAN = ([names, long]) => {
  const vis = (e) => {
    if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    if (e.closest('[aria-hidden="true"], [inert]')) return false;
    for (let x = e; x && x !== document.body; x = x.parentElement) { const r = x.getBoundingClientRect(); const c = getComputedStyle(x); if (c.overflow !== 'visible' && (r.width <= 1 || r.height <= 1)) return false; if (/auto|scroll/.test(c.overflowX) && x.scrollWidth > x.clientWidth + 1) return false; }
    return true;
  };
  const isInline = (e) => /^inline|^contents$/.test(getComputedStyle(e).display);
  const blk = (e) => { let x = e; while (x && x !== document.body && isInline(x)) x = x.parentElement; return x; };
  const inner = (e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e), n = (v) => parseFloat(v) || 0; return { l: r.left + n(c.borderLeftWidth) + n(c.paddingLeft), r: r.right - n(c.borderRightWidth) - n(c.paddingRight) }; };
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const over = [], split = [], rules = [];
  const rg = document.createRange();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const by = new Map();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.parentElement || n.parentElement.closest(long) || n.parentElement.closest('.game-menu') || !vis(n.parentElement)) continue;
    const b = blk(n.parentElement); if (!b) continue;
    by.set(b, [...(by.get(b) || []), n]);
    if (!n.data.trim()) continue;
    if (n.parentElement.closest('.act-head')) continue;
    rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter((q) => q.width && q.height);
    const t = n.data.trim().slice(0, 24);
    let box = b;
    for (let k = 0; box && box !== document.body && k < 3; k++) { const c = inner(box); const q = rects.find((q) => q.right > c.r + 1 || q.left < c.l - 1); if (q) { over.push(`「${t}」出 ${nm(box)} ${Math.round(Math.max(q.right - c.r, c.l - q.left))}px`); break; } if (/absolute|fixed/.test(getComputedStyle(box).position)) break; box = blk(box.parentElement); }
    for (let x = n.parentElement; x && x !== document.documentElement; x = x.parentElement) { const c = getComputedStyle(x); if (c.overflowX === 'visible') continue; const a = x.getBoundingClientRect(); const q = rects.find((q) => q.right > a.right + 1 || q.left < a.left - 1); if (q) { over.push(`「${t}」被 ${nm(x)} 裁掉 ${Math.round(Math.max(q.right - a.right, a.left - q.left))}px`); break; } }
    if (rects.some((q) => q.right > innerWidth + 1 || q.left < -1)) over.push(`「${t}」出視窗`);
  }
  const ctx = document.createElement('canvas').getContext('2d');
  const blocks = [];
  for (const [b, nodes] of by) {
    if (!nodes.some((n) => n.data.trim())) continue;
    // 逐字元分行
    const chars = [];
    for (const n of nodes) for (let i = 0; i < n.length; i++) { rg.setStart(n, i); rg.setEnd(n, i + 1); const q = rg.getClientRects()[0]; chars.push({ c: n.data[i], top: q && q.width ? q.top : null }); }
    const lines = []; let top = null;
    chars.forEach((x, i) => { if (x.top === null) { if (lines.length) lines[lines.length - 1].s += x.c; return; } if (top === null || x.top > top + 4) { lines.push({ s: '', start: i }); } top = x.top; lines[lines.length - 1].s += x.c; });
    const text = chars.map((x) => x.c).join('').replace(/ /g, ' ');
    const ls = lines.map((l) => l.s.replace(/ /g, ' ').trim()).filter(Boolean);
    const zh = /\p{Script=Han}/u.test(text);
    const where = nm(b);
    if (ls.length > 1) blocks.push({ where, ls });
    // 專有名詞（含房名、數字連字號）
    const dyn = [...text.matchAll(/\b\d+(?:st|nd|rd|th)-[a-z]+\b/g)].map((m) => m[0]);
    const used = new Array(text.length).fill(false);
    const lineOf = (i) => { let k = -1; for (let j = 0; j < lines.length; j++) if (lines[j].start <= i) k = j; return k; };
    for (const name of [...names, ...dyn]) for (let s = text.indexOf(name); s >= 0; s = text.indexOf(name, s + 1)) {
      if (used.slice(s, s + name.length).some(Boolean)) continue; used.fill(true, s, s + name.length);
      const a = lineOf(s), z = lineOf(s + name.length - 1);
      if (a === z) continue;
      const cs = getComputedStyle(nodes[0].parentElement); ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      const c = inner(b); const w = ctx.measureText(name).width;
      split.push(`${name}｜跨${z - a + 1}行（${where} 名${Math.round(w)}/框${Math.round(c.r - c.l)}${w > c.r - c.l - 1 ? ' 放不下' : ''}）`);
    }
    if (ls.length < 2) continue;
    const card = !!b.closest('.cine-text, .phone, .cand') || b.matches('.cine-text');
    if (zh) {
      ls.forEach((l, i) => {
        const k = (l.match(/[\p{L}\p{N}]/gu) || []).length;
        if (card && k < 3) rules.push(`每行≥3字「${ls.join('｜')}」第${i + 1}行「${l}」（${where}）`);
        if (i > 0 && /^[的了著過地得]/.test(l)) rules.push(`行首「${l[0]}」「${ls[i - 1]}｜${l}」（${where}）`);
        if (i < ls.length - 1 && /[把在被跟和與對從向沒又]$/.test(l)) rules.push(`行尾「${l.slice(-1)}」「${l}｜${ls[i + 1]}」（${where}）`);
        if (i < ls.length - 1 && /(?:[一二三四五六七八九十兩幾半每某這那]|\d+\s?)[個台張件位名條次天週年月號樓層份道支輛間家封則句聲口隻頁幕集枚把杯塊根筆項]$/.test(l)) rules.push(`數量詞在行尾「${l}｜${ls[i + 1]}」（${where}）`);
        if (/^(?:[一二三四五六七八九十兩幾半每某這那]|\d+\s?)[個台張件位名條次天週年月號樓層份道支輛間家封則句聲口隻頁幕集枚把杯塊根筆項][，。、]?$/.test(l)) rules.push(`數量詞單獨一行「${l}」（${where}）`);
      });
      // 譯名只在「・」後斷
      for (const m of text.matchAll(/[一-鿿]{1,6}・[一-鿿A-Z]{1,6}/g)) {
        for (let j = 1; j < lines.length; j++) { const p = lines[j].start; if (p > m.index && p < m.index + m[0].length && text[p - 1] !== '・') rules.push(`譯名斷在「・」以外「${m[0].slice(0, p - m.index)}｜${m[0].slice(p - m.index)}」（${where}）`); }
      }
    } else {
      const last = ls[ls.length - 1];
      if (last.split(/\s+/).length === 1 && text.trim().split(/\s+/).length > 1) rules.push(`英文最後一行單字「${ls.slice(-2).join('｜')}」（${where}）`);
    }
  }
  // 選單鈕四向 8px
  const mb = document.querySelector('.menu-toggle');
  const near = [];
  if (mb && mb.checkVisibility()) {
    const m = mb.getBoundingClientRect();
    const dist = (q) => { const dx = Math.max(0, m.left - q.right, q.left - m.right); const dy = Math.max(0, m.top - q.bottom, q.top - m.bottom); return { dx, dy, d: Math.max(dx, dy), ov: q.left < m.right && q.right > m.left && q.top < m.bottom && q.bottom > m.top }; };
    const menuRoot = mb.closest('.game-menu') || mb;
    const push = (q, what) => { if (!q.width || !q.height) return; const d = dist(q); if (d.dx < 8 && d.dy < 8) near.push({ what, d: Math.round(d.d * 10) / 10, dx: Math.round(d.dx * 10) / 10, dy: Math.round(d.dy * 10) / 10, ov: d.ov }); };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim() || menuRoot.contains(n) || !vis(n.parentElement)) continue; rg.selectNodeContents(n); for (const q of rg.getClientRects()) push(q, `字「${n.data.trim().slice(0, 16)}」`); }
    for (const e of document.querySelectorAll('body *')) {
      if (menuRoot.contains(e) || e.contains(menuRoot) || !vis(e)) continue;
      const q = e.getBoundingClientRect();
      if (q.left <= m.left && q.right >= m.right && q.top <= m.top && q.bottom >= m.bottom) continue; // 包住鈕的底
      const c = getComputedStyle(e);
      const bg = c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent';
      const bd = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(c[`border${s}Width`]) > 0 && !/rgba\(.*, 0\)$/.test(c[`border${s}Color`]));
      if (bg || bd || /^(IMG|SVG|CANVAS|VIDEO)$/i.test(e.tagName)) push(q, `框 ${nm(e)}`);
    }
  }
  return { over: [...new Set(over)], split: [...new Set(split)], rules: [...new Set(rules)], near, blocks, docW: document.documentElement.scrollWidth, vv: Math.round(visualViewport.width) };
};
async function axArrows(p) {
  // 第八輪：所有按鈕類節點（button／menuitem／radio／option／checkbox／tab／link）名稱：多空白、›‹»、和畫面上的字（innerText）一不一致。
  const cdp = await p.context().newCDPSession(p);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const out = [];
  for (const n of nodes) {
    if (n.ignored || !/^(button|menuitem|menuitemradio|radio|option|checkbox|tab|link|switch)$/.test(n.role?.value || '') || !n.backendDOMNodeId) continue;
    const name = n.name?.value ?? '';
    let text = '', vis = true, aria = null;
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
      const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: 'function(){ const v = this.checkVisibility ? this.checkVisibility({opacityProperty:true,visibilityProperty:true}) : true; return { t: this.innerText || this.value || "", v, a: this.getAttribute && this.getAttribute("aria-label"), lb: this.getAttribute && this.getAttribute("aria-labelledby") }; }' });
      text = r.result.value.t; vis = r.result.value.v; aria = r.result.value.a || r.result.value.lb;
    } catch (e) { text = '?'; }
    if (!vis) continue;
    const norm = (x) => x.replace(/\s+/g, ' ').trim();
    const iss = [];
    if (/[›‹»]/.test(name)) iss.push('箭頭');
    if (name !== name.trim()) iss.push('頭尾空白');
    if (/\s{2,}/.test(name)) iss.push('雙空白');
    if (/\n/.test(name)) iss.push('換行');
    const tn = norm(text);
    if (tn && norm(name) !== tn) iss.push(norm(name).replace(/\s/g, '') === tn.replace(/\s/g, '') ? '空白不同' : '和畫面字不同');
    if (iss.length) out.push(`${n.role.value}「${name}」${iss.join('/')}${iss.some((x) => /不同/.test(x)) ? `（畫面「${tn.slice(0, 60)}」${aria ? '，aria' : ''}）` : ''}`);
  }
  await cdp.detach();
  return out;
}
(async () => {
  const out = [];
  for (const size of sizesA.split(',')) for (const lang of langsA.split(',')) for (const scale of scalesA.split(',').map(Number)) {
    const base = await L.newPage(size, { scheme: 'dark' });
    for (const [scene, label, step] of SCENES) {
      if (only && !only.split(',').includes(String(scene))) continue;
      const tag = `lb-${size}-${lang}-${Math.round(scale * 100)}-sc${scene}s${step}`;
      const progress = scene === 'court' ? kow : { episode: 'ep1', scene, step, choices: { 'cold-open': { 3: 0, 6: 1 } }, cards: [], flags: [], ethics: [], scenes: {} };
      const p = await base.context().newPage(); p.__touch = base.__touch;
      await p.addInitScript((s) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, L.seedObj({ lang, progress, settings: { textScale: scale, voScale: scale } }));
      await p.goto(L.BASE);
      try { await L.tap(p, p.getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ }).first()); } catch (e) { console.log(tag, 'NO CONTINUE'); await p.close(); continue; }
      await p.waitForTimeout(500);
      const res = [];
      if (scene === 'court') {
        await p.waitForTimeout(1000);
        await L.tap(p, p.getByRole('button', { name: lang === 'en' ? 'Go to court' : '開庭' }).first());
        for (const wait of [1500, 2500, 4000]) { await p.waitForTimeout(wait); await p.evaluate(() => document.fonts.ready); res.push({ phase: `court+${wait}`, ...(await p.evaluate(SCAN, [NAMES, LONG])), ax: await axArrows(p), shot: await L.shot(p, `${tag}-${res.length}`) }); }
      } else {
        const beat = p.locator('.place-beat');
        if (await beat.count()) {
          await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
          res.push({ phase: 'beat', ...(await p.evaluate(SCAN, [NAMES, LONG])), ax: await axArrows(p), shot: await L.shot(p, `${tag}-beat`) });
          await L.tap(p, beat).catch(() => {});
        }
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(900);
        res.push({ phase: 'main', ...(await p.evaluate(SCAN, [NAMES, LONG])), ax: await axArrows(p), shot: await L.shot(p, tag, { fullPage: true }) });
      }
      for (const m of res) {
        out.push({ tag, label, ...m });
        const nearBad = m.near.filter((x) => x.d < 8);
        const issues = [...m.over.map((x) => '出框 ' + x), ...m.split.map((x) => '拆名 ' + x), ...m.rules, ...nearBad.map((x) => `選單鈕 ${x.what} 距${x.d}${x.ov ? '（重疊）' : ''}`), ...m.ax.map((x) => 'AX ' + x), ...(m.docW > m.vv ? [`撐寬 ${m.docW}>${m.vv}`] : [])];
        console.log(tag, label, m.phase, issues.length ? 'ISSUES ' + issues.join(' ; ') : 'ok');
      }
      await p.close();
    }
    await base.context().close();
  }
  fs.writeFileSync(`${L.DIR}/data-${PFX}labels-${sizesA.replace(/,/g, '_')}-${langsA.replace(/,/g, '_')}-${scalesA.replace(/,/g, '_')}${only ? '-' + only.replace(/,/g, '_') : ''}.json`, JSON.stringify(out, null, 1));
  await L.close();
})().catch((e) => { console.error(e); process.exit(1); });
