// 第 14 輪：兩集對白頁（含大立繪）和證據板的規則 1 快掃、無障礙名稱、主控台。node scan14.js size lang spec...
// spec = ep:scene:seed（seed: blank | hung | board1 | board2 | board2b）。讀檔進場，之後只按「繼續」、地點字卡、證據板、疑問（真實點擊）。page.evaluate 只讀 DOM。
const L = require('../lib.js');
const fs = require('fs');
const rules8 = require('./rules8.js');
const NM = JSON.parse(fs.readFileSync(__dirname + '/names7.json', 'utf8'));
const N = { all: [...NM.en, ...NM.zh, ...NM.ords].sort((a, b) => b.length - a.length), keepInner: NM.keepInner };
const seeds = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8'));
const [size, lang, ...specs] = process.argv.slice(2);
const port = (process.env.BASE || '4189').slice(-4);
const OUT = __dirname + `/scan14-${port}.jsonl`;
const desk = { hours: 20, timeline: [], spent: 4, marked: [], readDocs: [], jobs: [], mail: [], openMail: [], link: { cards: [], relation: null }, found: [], badLinks: 0, linkNote: null, attempts: {}, confirmed: [], submissions: 0, wrong: 0, report: [], feedback: {}, motions: {}, flags: [], wrapped: false };
function progressOf(ep, scene, seed) {
  if (seed === 'blank') return { episode: ep, scene, step: 0, choices: ep === 'ep2' ? { 'cold-open': { 4: 1 } } : {}, cards: [], flags: [], ethics: [], scenes: {} };
  if (seed === 'board1') return { episode: 'ep1', scene: 7, step: 0, choices: {}, cards: ['ethan-accused', 'ethan-ride', 'ethan-message', 'indictment', 'watch-listed', 'access-partial', 'sophie-home', 'ride-receipt', 'watch-notice', 'car-statement', 'watch-photo'], flags: [], ethics: [], scenes: { investigate: { ...desk } } };
  if (seed === 'board2') return { episode: 'ep2', scene: 10, step: 0, choices: {}, cards: ['contract', 'voice-memo', 'rating-penalty', 'trevor-sworn', 'change-ticket', 'lock-spec'], flags: [], ethics: [], scenes: { pretrial: { ...desk, found: ['l-perjury'] } } };
  if (seed === 'board2b') return { episode: 'ep2', scene: 6, step: 0, choices: { 'cold-open': { 4: 1 } }, cards: ['contract', 'voice-memo', 'med-record', 'pharmacy'], flags: [], ethics: [], scenes: {} };
  const p = structuredClone(seeds[ep]); p.scene = scene; p.step = 0; return p;
}
async function axButtons(page) {
  const cdp = page._cdp || (page._cdp = await page.context().newCDPSession(page));
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const out = [];
  for (const n of nodes) {
    if (n.ignored || !n.role || n.role.value !== 'button' || !n.backendDOMNodeId) continue;
    let info = null;
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
      const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: 'function(){const b=this.getBoundingClientRect();const cs=getComputedStyle(this);return {text:this.innerText,aria:this.getAttribute("aria-label"),labelledby:this.getAttribute("aria-labelledby"),cls:(this.className&&this.className.baseVal===undefined?this.className:"")+"",tag:this.tagName,vis:b.width>0&&b.height>0&&cs.visibility!=="hidden",menu:!!this.closest(".game-menu")}}' });
      info = r.result.value;
      await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
    } catch (e) { info = { err: e.message.slice(0, 60) }; }
    out.push({ name: n.name ? n.name.value : '', ...info });
  }
  return out;
}
const MEASURE = async () => {
  const st = document.querySelector('.lucas-stage');
  const mainEl = document.querySelector('main.scene');
  const res = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, stage: !!st };
  const menu = [...document.querySelectorAll('button')].find((b) => /^(選單|Menu)$/.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
  if (menu) { const r = menu.getBoundingClientRect(); res.menu = [r.left, r.top, r.right, r.bottom].map((v) => +v.toFixed(1)); }
  if (mainEl) { const r = mainEl.getBoundingClientRect(); const cs = getComputedStyle(mainEl); res.col = { l: +(r.left + parseFloat(cs.paddingLeft)).toFixed(1), r: +(r.right - parseFloat(cs.paddingRight)).toFixed(1), boxR: +r.right.toFixed(1), cls: mainEl.className }; }
  if (!st) return res;
  const fr = st.getBoundingClientRect();
  res.frame = [fr.left, fr.top, fr.right, fr.bottom].map((v) => +v.toFixed(1));
  const imgs = [...st.querySelectorAll('img')];
  res.imgs = imgs.map((i) => ({ f: (i.currentSrc || '').split('/').slice(-2).join('/').replace(/-[A-Za-z0-9_-]{8}\.webp$/, ''), on: i.classList.contains('on'), op: +getComputedStyle(i).opacity, nw: i.naturalWidth }));
  const img = imgs.find((i) => i.classList.contains('on'));
  if (!img || !img.complete || !img.naturalWidth) { res.loading = true; return res; }
  const im2 = new Image(); im2.src = img.currentSrc; await im2.decode(); const nw = im2.naturalWidth, nh = im2.naturalHeight, ir = img.getBoundingClientRect();
  const s = Math.min(ir.width / nw, ir.height / nh); const cr = { l: ir.left + (ir.width - nw * s) / 2, t: ir.top + (ir.height - nh * s) / 2, w: nw * s, h: nh * s };
  const cv = document.createElement('canvas'); cv.width = nw; cv.height = nh; const g = cv.getContext('2d'); g.drawImage(im2, 0, 0);
  const px = g.getImageData(0, 0, nw, nh).data; const a = (x, y) => px[(y * nw + x) * 4 + 3];
  const X = (x) => cr.l + x / nw * cr.w, Y = (y) => cr.t + y / nh * cr.h;
  // 不透明像素外框（全圖）
  let l = 1e9, r = -1, t = 1e9, b = -1;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) if (a(x, y) > 128) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  const fig = { l: +X(l).toFixed(1), r: +X(r + 1).toFixed(1), t: +Y(t).toFixed(1), b: +Y(b + 1).toFixed(1) };
  res.fig = fig; res.cr = [cr.l, cr.t, cr.w, cr.h].map((v) => +v.toFixed(1)); res.nat = [nw, nh];
  res.gapCol = res.col ? +(fig.l - res.col.boxR).toFixed(1) : null; res.gapColContent = res.col ? +(fig.l - res.col.r).toFixed(1) : null;
  res.gapRight = +(innerWidth - fig.r).toFixed(1);
  res.gapTop = +fig.t.toFixed(1);
  res.figBelowScreen = +(fig.b - innerHeight).toFixed(1);
  res.frameBottomVsVh = +(fr.bottom - innerHeight).toFixed(2);
  // 圖片四邊有沒有不透明像素（圖邊直線）
  const colOpaque = (x) => { let n = 0; for (let y = 0; y < nh; y++) if (a(x, y) > 10) n++; return n; };
  const rowOpaque = (y) => { let n = 0; for (let x = 0; x < nw; x++) if (a(x, y) > 10) n++; return n; };
  res.imgEdgeOpaque = { l: colOpaque(0), r: colOpaque(nw - 1), t: rowOpaque(0), b: rowOpaque(nh - 1) };
  // 畫面最後一列（vh-1）落在圖的哪一列，那一列人物的左右
  const by = Math.floor((innerHeight - 0.5 - cr.t) / cr.h * nh);
  if (by >= 0 && by < nh) { let bl = -1, br = -1; for (let x = 0; x < nw; x++) if (a(x, by) > 128) { if (bl < 0) bl = x; br = x; } res.screenBottomRow = { imgRowPct: +(by / nh * 100).toFixed(1), l: bl < 0 ? null : +X(bl).toFixed(1), r: br < 0 ? null : +X(br + 1).toFixed(1) }; }
  // 畫面內人物左右輪廓的直線段（同一 x 連續多少列，換成螢幕 px）——找衣服的硬切直邊
  const yEnd = Math.min(nh - 1, by >= 0 ? by : nh - 1);
  const run = (side) => { let best = 0, cur = 0, prev = null, bestY = null; for (let y = t; y <= yEnd; y++) { let xx = -1; if (side === 'l') { for (let x = 0; x < nw; x++) if (a(x, y) > 128) { xx = x; break; } } else { for (let x = nw - 1; x >= 0; x--) if (a(x, y) > 128) { xx = x; break; } } if (xx >= 0 && prev !== null && Math.abs(xx - prev) <= 0) { cur++; if (cur > best) { best = cur; bestY = y; } } else cur = 0; prev = xx; } return { px: +(best * cr.h / nh).toFixed(1), atY: bestY === null ? null : +Y(bestY).toFixed(1) }; };
  res.straight = { l: run('l'), r: run('r') };
  // 頭頂和「選單」鈕
  if (res.menu) { const m = res.menu; const dx = Math.max(m[0] - fig.r, fig.l - m[2], 0); const dy = Math.max(m[1] - fig.b, fig.t - m[3], 0); res.menuGap = +Math.hypot(dx, dy).toFixed(1); res.menuDy = +(fig.t - m[3]).toFixed(1); }
  // 和其他元件的重疊：可見的文字、按鈕、圖、有底色的框；在交集區抽樣立繪 alpha
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    if (st.contains(el)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const inter = /^(BUTTON|A|INPUT|IMG|SVG|SELECT|TEXTAREA|PROGRESS)$/i.test(el.tagName) || el.getAttribute('role');
    const bg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    if (!ownText && !inter && !bg) continue;
    const rr = el.getBoundingClientRect(); if (!rr.width || !rr.height) continue;
    if (rr.width * rr.height > innerWidth * innerHeight * 0.5) continue;
    const ix0 = Math.max(rr.left, fig.l), ix1 = Math.min(rr.right, fig.r), iy0 = Math.max(rr.top, fig.t, 0), iy1 = Math.min(rr.bottom, fig.b, innerHeight);
    if (ix1 <= ix0 || iy1 <= iy0) continue;
    let n = 0; for (let y = iy0; y < iy1; y += 1) for (let x = ix0; x < ix1; x += 1) { const px_ = Math.floor((x - cr.l) / cr.w * nw), py_ = Math.floor((y - cr.t) / cr.h * nh); if (px_ >= 0 && px_ < nw && py_ >= 0 && py_ < nh && a(px_, py_) > 40) n++; }
    if (n) hits.push({ el: (el.tagName + '.' + (typeof el.className === 'string' ? el.className : '')).slice(0, 40), txt: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24), px: n, rect: [rr.left, rr.top, rr.right, rr.bottom].map((v) => Math.round(v)) });
  }
  res.overlap = hits;
  // 台詞欄內容（文字、按鈕）最右邊
  let maxR = 0, who = null; for (const el of mainEl ? mainEl.querySelectorAll('*') : []) { if (st.contains(el)) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; const rr = el.getBoundingClientRect(); if (!rr.width) continue; if (rr.right > maxR) { maxR = rr.right; who = el.tagName + '.' + String(el.className).slice(0, 30); } }
  res.colContentR = +maxR.toFixed(1); res.colContentWho = who;
  return res;
};

(async () => {
  for (const spec of specs) {
    const [ep, scS, seed] = spec.split(':'); const sc = +scS;
    const board = seed.startsWith('board');
    const tag = `s14-${ep}-${sc}${board ? seed : ''}-${size}-${lang}`;
    const { page, ctx } = await L.open({ size, lang, save: progressOf(ep, sc, seed), settings: { textScale: 1, voScale: 1 } });
    try {
      await L.tap(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
      if (board) {
        await page.waitForTimeout(600);
        if (await page.locator('.place-beat').count()) await L.tap(page, page.locator('.place-beat').first());
        await page.waitForTimeout(3000);
        await L.tap(page, page.getByRole('button', { name: /^(證據板|Evidence board|Board)/ }).filter({ visible: true }).first());
        await page.waitForTimeout(900);
        const q = page.locator('.q-item:not(.done):not(.timeline-entry)').first();
        if (await q.isVisible()) await L.tap(page, q);
        await page.locator('.cork').first().waitFor({ timeout: 15000 });
      }
      for (let k = 0; k < (board ? 1 : 20); k++) {
        await page.waitForTimeout(1300);
        const pb = page.locator('.place-beat:visible');
        if (!board && (await pb.count())) { await L.tap(page, pb.first()); continue; }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(450);
        const m = await page.evaluate(rules8, N); const ax = await axButtons(page);
        const st = await page.evaluate(MEASURE);
        const hit = ['over', 'menu', 'cut', 'btn', 'overlap'].some((x) => m[x].length) || (st.overlap || []).length;
        const shot = k === 0 || hit ? await L.shot(page, `${tag}-k${k}`) : null;
        const stage = st.stage ? { gapCol: st.gapCol, gapRight: st.gapRight, menuGap: st.menuGap, frame: st.frame, colBoxR: st.col && st.col.boxR, fig: st.fig, overlap: st.overlap, nat: st.nat, onf: (st.imgs || []).filter((i) => i.on).map((i) => i.f).join() } : null;
        fs.appendFileSync(OUT, JSON.stringify({ tag, ep, sc, seed, size, lang, scale: 1, k, i: specs.indexOf(spec), shot, ax, stage, errors: page.errors.slice(), over: m.over, menu: m.menu, cut: m.cut, btn: m.btn, overlap: m.overlap, docSW: m.docSW, vw: m.vw }) + '\n');
        console.log(tag, k, 'hit', !!hit, stage ? `stage gap ${stage.gapCol} right ${stage.gapRight} ov ${stage.overlap.length}` : '');
        const c = page.getByRole('button', { name: /^(繼續|Continue)$/ }).filter({ visible: true });
        if (!(await c.count())) break;
        await L.tap(page, c.first());
      }
    } catch (e) { console.log('FAIL', tag, e.message.split('\n')[0]); fs.appendFileSync(OUT, JSON.stringify({ tag, ep, sc, seed, size, lang, fail: e.message.split('\n')[0], errors: page.errors.slice() }) + '\n'); }
    await ctx.close();
  }
  await L.close();
})();
