// 第 13 輪：#341 載入中＋片頭預載（由 r12-pre.js 改）。用法：node r13-pre.js job1 job2 …
// job = 路徑:尺寸:語言:網路[:選項]
//  路徑 e1new（標題→新遊戲→第 1 集→走完冷開場）／e2new（新遊戲→第 2 集→冷開場）／e2from1（第 1 集集尾→繼續第 2 集→冷開場）
//       e1load／e2load（localStorage 存檔＝片頭那張卡，標題按「繼續」，不經冷開場）
//  網路 none／slow（CDP 1.6 Mbps 下行、150 ms）／d3（所有圖晚 3 秒）／d15（片頭圖晚 15 秒）／d35c（只有 0:17 法庭寬圖晚 35 秒）／d40w（只有 0:23 晚 40 秒）
//  選項 menu（等待中開選單）／skip（第二次播，等待中按跳過）／skipplay（第二次播，播到 0:12 按跳過）／rm（減少動態）
// 只用真輸入（滑鼠／鍵盤／觸控）；page.evaluate 只讀。
const L = require('./lib');
const fs = require('fs');
const SAMPLER = () => {
  const now = () => Date.now();
  window.__E = [];
  window.__IMG = {};
  const ev = (k, o = {}) => window.__E.push({ t: now(), k, ...o });
  let st = { ld: 'off', intro: false, ready: false, shot: null, shotEl: null, paused: false, menu: false, card: false, text: null, bg: null };
  const check = () => {
    const ti = document.querySelector('.title-intro');
    if (!!ti !== st.intro) { st.intro = !!ti; ev(ti ? 'intro-mount' : 'intro-unmount'); if (!ti) { st.ready = false; st.shot = null; st.shotEl = null; } }
    if (ti) {
      const r = ti.hasAttribute('data-ready');
      if (r !== st.ready) { st.ready = r; ev(r ? 'ready' : 'unready'); }
      const sh = ti.dataset.shot;
      if (sh !== st.shot) { st.shot = sh; ev('shot', { shot: sh }); }
      const el = ti.querySelector('.ti-shot');
      const ec = el ? el.className : null;
      if (ec !== st.shotEl) {
        st.shotEl = ec;
        if (el) {
          const imgs = [...el.querySelectorAll('img')];
          ev('shot-on', { cls: ec, n: imgs.length + el.querySelectorAll('svg image').length, bad: imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => (i.currentSrc || i.src).split('/').pop()) });
        } else ev('shot-off');
      }
      const p = ti.hasAttribute('data-paused');
      if (p !== st.paused) { st.paused = p; ev(p ? 'paused' : 'resumed'); }
      const ld = ti.querySelector('.ti-loading');
      const lk = ld ? 'on' : 'off';
      if (lk !== st.ld) {
        st.ld = lk;
        const sty = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return { text: e.innerText, role: e.getAttribute('role'), r: [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10), fs: c.fontSize, fw: c.fontWeight, ff: c.fontFamily.slice(0, 40), color: c.color, bg: c.backgroundColor, bd: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, anim: c.animationName, tr: c.transitionProperty + ' ' + c.transitionDuration, op: c.opacity, ls: c.letterSpacing, pad: c.padding, lh: c.lineHeight, ta: c.textAlign }; };
        const sk = ti.querySelector('.ti-skip');
        ev('loading-' + lk, { shotEl: !!ti.querySelector('.ti-shot'), ld: sty(ld), skip: sty(sk), corner: sty(ti.querySelector('.ti-corner')) });
      }
      const tx = (ti.innerText || '').trim().slice(0, 80);
      if (tx !== st.text) { st.text = tx; ev('intro-text', { text: tx }); }
    }
    const m = !!document.querySelector('.menu-panel');
    if (m !== st.menu) { st.menu = m; ev(m ? 'menu-open' : 'menu-close'); }
    const c = !ti && !!document.querySelector('.act-stage:not(.cold-scope):not(.place-beat)');
    if (c !== st.card) { st.card = c; if (c) ev('card', { text: (document.querySelector('.act-stage')?.innerText || '').slice(0, 40) }); }
    const b = document.querySelector('.menu-toggle');
    if (b && ti) { const cs = getComputedStyle(b); const k = cs.backgroundColor + '|' + cs.color + '|' + cs.borderTopColor; if (k !== st.bg) { st.bg = k; ev('toggle', { c: k }); } }
  };
  const imgs = () => {
    for (const i of document.images) {
      const u = (i.currentSrc || i.src || '').split('/').pop();
      if (!u) continue;
      const inIntro = !!i.closest('.title-intro');
      const o = (window.__IMG[u] ||= { first: now(), intro: inIntro });
      const r = i.getBoundingClientRect();
      if (!o.vis && i.complete && i.naturalWidth && r.width > 0 && getComputedStyle(i).visibility !== 'hidden' && +getComputedStyle(i).opacity !== 0) o.vis = now();
    }
  };
  const loop = () => { check(); imgs(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setInterval(() => { check(); imgs(); }, 50);
};
const INTRO_RE = /\/assets\/(paper|blind|court)-[^/]*\.(avif|webp|png)(\?.*)?$/;
const IMG_RE = /\/assets\/.*\.(avif|webp|jpe?g|png)(\?.*)?$/;
const settings = (seen) => ({ state: { introSeen: seen }, version: 1 });
const visible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false));
async function screencast(ctx, page, tag) {
  const vp = page.viewportSize();
  const cdp = await ctx.newCDPSession(page);
  const fdir = `${L.DIR}/frames/${tag}`;
  fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const i = frames.length;
    fs.writeFileSync(`${fdir}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    frames.push({ i, t: f.metadata.timestamp * 1000, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight, sy: f.metadata.scrollOffsetY });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 });
  return { fdir, frames, stop: () => cdp.send('Page.stopScreencast').catch(() => {}) };
}
const intro = (page) => page.evaluate(() => !!document.querySelector('.title-intro'));
// 冷開場：一步一步按（固定節奏：看到可按的東西後停 DWELL 再按），直到片頭出現。
const DWELL = 900;
async function walk(page, R, until = intro, max = 80) {
  let miss = 0;
  for (let k = 0; k < max; k++) {
    if (await until(page)) return true;
    const pb = page.locator('.place-beat');
    let target = null, what = '';
    if (await visible(pb)) { target = pb.first(); what = 'place-beat'; }
    else {
      const btns = page.locator('main button:not(.menu-toggle):not(.ti-skip):visible');
      const n = await btns.count();
      for (let i = 0; i < n; i++) {
        const b = btns.nth(i);
        const tx = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || '').trim();
        if (/回標題|Back to title|讀取|Load|存檔|Save/.test(tx)) continue;
        if (await b.isDisabled().catch(() => true)) continue;
        target = b; what = tx.slice(0, 16); break;
      }
    }
    if (!target) { if (++miss > 40) { R.notes.push('walk stuck'); return false; } await page.waitForTimeout(250); continue; }
    miss = 0;
    await page.waitForTimeout(DWELL);
    if (await until(page)) return true;
    R.presses.push([Date.now(), what]);
    await L.press(page, target, { scroll: false }).catch((e) => R.notes.push('press ' + what + ' ' + String(e).slice(0, 60)));
    await page.waitForTimeout(150);
  }
  return until(page);
}
(async () => {
  const out = [];
  for (const job of process.argv.slice(2)) {
    const [path, sz0, lang, netc, opt] = job.split(':');
    const sz = /^\d+$/.test(sz0) ? +sz0 : sz0;
    const tag = `pre-${path}-${sz0}-${lang}-${netc}${opt ? '-' + opt : ''}${process.env.TAGX || ''}`;
    const R = { tag, path, sz, lang, netc, opt, base: process.env.BASE, notes: [], presses: [] };
    const seen = opt === 'skip' || opt === 'skipplay' || opt === 'seen' ? { ep1: true, ep2: true } : {};
    const ls = { 'lawgame-settings': settings(seen) };
    if (path === 'e1load') ls['lawgame-ep-auto'] = L.seed({ episode: 'ep1', scene: 1, step: 0 });
    if (path === 'e2load') ls['lawgame-ep-auto'] = L.seed({ episode: 'ep2', scene: 1, step: 0 });
    if (path === 'e2from1') ls['lawgame-ep-auto'] = L.seed({ episode: 'ep1', scene: 44, step: 4 });
    const net = [];
    const { ctx, page } = await L.open(sz, { lang, scheme: 'light', rm: opt === 'rm', ls, clock: async (p) => {
      await p.addInitScript(SAMPLER);
      const delay = (re, ms) => p.context().route(re, async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue().catch(() => {}); });
      if (netc === 'd3') await delay(IMG_RE, 3000);
      if (netc === 'd5') await delay(IMG_RE, 5000);
      if (netc === 'i2') await delay(INTRO_RE, 2000);
      if (netc === 'i1') await delay(INTRO_RE, 1000);
      if (netc === 'd15') await delay(INTRO_RE, 15000);
      if (netc === 'd35c') await delay(/\/assets\/court-0017w[DP]-[^/]*\.(avif|webp)$/, 35000);
      if (netc === 'd40w') await delay(/\/assets\/court-0023[DP]-[^/]*\.(avif|webp)$/, 40000);
      p.on('request', (q) => { if (IMG_RE.test(q.url())) net.push({ u: q.url().split('/').pop(), t0: Date.now() }); });
      p.on('requestfinished', async (q) => { const x = net.findLast((e) => e.u === q.url().split('/').pop() && !e.t1); if (x) { x.t1 = Date.now(); try { x.size = (await q.sizes()).responseBodySize; } catch {} } });
      p.on('requestfailed', (q) => { const x = net.findLast((e) => e.u === q.url().split('/').pop() && !e.t1); if (x) { x.t1 = Date.now(); x.fail = q.failure()?.errorText; } });
    } });
    let sc = null;
    try {
      if (netc === 'slow') { const c = await ctx.newCDPSession(page); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 }); }
      R.tStart = Date.now();
      sc = await screencast(ctx, page, tag);
      const T = (zh, en) => (lang === 'zh' ? zh : en);
      if (path === 'e1new' || path === 'e2new') {
        await L.press(page, page.getByRole('button', { name: T('新遊戲', 'New game') }));
        await page.waitForTimeout(400);
        await L.press(page, page.getByRole('button', { name: path === 'e1new' ? T(/^第 1 集/, /^Episode 1/) : T(/^第 2 集/, /^Episode 2/) }).first());
        await page.waitForTimeout(400);
        R.tCold = Date.now();
        await walk(page, R);
      } else if (path === 'e2from1') {
        await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
        const nx = () => page.getByRole('button', { name: /繼續第 2 集|Continue to Episode 2|Episode 2/ });
        await walk(page, R, async () => visible(nx()), 12);
        await page.waitForTimeout(DWELL);
        R.presses.push([Date.now(), 'next-ep']);
        await L.press(page, nx().first());
        R.tCold = Date.now();
        await walk(page, R);
      } else {
        R.presses.push([Date.now(), 'continue']);
        await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
      }
      await page.waitForFunction(() => !!document.querySelector('.title-intro'), null, { timeout: 30000 });
      R.tIntroSeen = Date.now();
      if (!sc) sc = await screencast(ctx, page, tag);
      const shots0 = async (k) => L.shot(page, `${tag}-${k}`);
      // 等待中：0.4 秒、1.5 秒拍
      const t0 = R.tIntroSeen;
      const at = async (ms) => { const w = t0 + ms - Date.now(); if (w > 0) await page.waitForTimeout(w); };
      const ready = () => page.evaluate(() => !!document.querySelector('.title-intro[data-ready]'));
      await at(400);
      if (!(await ready())) { await shots0('wait04'); R.waitAx = await page.evaluate(() => ({ text: document.querySelector('.title-intro')?.innerText ?? null, aria: document.querySelector('.title-intro')?.getAttribute('aria-label'), busy: document.querySelector('.title-intro')?.getAttribute('aria-busy'), live: [...document.querySelectorAll('[aria-live],[role=status]')].map((e) => e.className + ':' + e.innerText.slice(0, 30)) })); }
      await at(1750);
      if (!(await ready()) || !(await page.evaluate(() => !!document.querySelector('.ti-shot')))) await shots0('wait17');
      if (opt === 'menu') {
        await at(1000);
        R.menuAtReady = await ready();
        if (page.mobile) await L.press(page, page.locator('.menu-toggle'), { scroll: false }); else await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        R.menuOpen = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), modal: document.querySelector('.menu-panel')?.closest('[aria-modal]')?.getAttribute('aria-modal') ?? document.querySelector('[aria-modal=true]')?.className ?? null, paused: document.querySelector('.title-intro')?.hasAttribute('data-paused'), ready: document.querySelector('.title-intro')?.hasAttribute('data-ready') }));
        await shots0('menu-open');
        await page.waitForTimeout(4500);
        R.menuLater = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused'), ready: document.querySelector('.title-intro')?.hasAttribute('data-ready'), shot: document.querySelector('.title-intro')?.dataset.shot, shotEl: !!document.querySelector('.ti-shot') }));
        await shots0('menu-later');
        // 關：桌機 Esc，手機按選單鈕
        if (page.mobile) await L.press(page, page.locator('.menu-toggle'), { scroll: false }); else await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        R.menuClosed = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused') }));
      }
      if (opt === 'skip' || opt === 'skipplay') {
        if (opt === 'skip') await at(1000); else { await page.waitForFunction(() => !!document.querySelector('.title-intro[data-ready]'), null, { timeout: 20000 }); await page.waitForTimeout(12000); }
        const sk = page.locator('.ti-skip');
        R.skipVisible = await visible(sk);
        R.skipReady = await ready();
        await shots0('skip-before');
        R.tSkip = Date.now();
        if (R.skipVisible) await L.press(page, sk, { scroll: false }); else R.notes.push('no skip button');
        await page.waitForTimeout(1500);
        R.afterSkip = await page.evaluate(() => ({ intro: !!document.querySelector('.title-intro'), card: (document.querySelector('.act-stage')?.innerText || '').slice(0, 40) }));
        await shots0('skip-after');
      }
      if (opt !== 'skip') {
        // 等 ready 以後，每個鏡頭開始後 0.25 秒拍一張
        const okReady = await page.waitForFunction(() => !!document.querySelector('.title-intro[data-ready]'), null, { timeout: 20000 }).then(() => true, () => false);
        if (!okReady) R.notes.push('never ready');
        if (opt !== 'skipplay') {
          const tR = await page.evaluate(() => window.__E.find((e) => e.k === 'ready')?.t ?? Date.now());
          const starts = [0, 10000, 17000, 23000, 29000, 34000];
          const names = ['paper', 'blind', 'court', 'witness', 'lucas', 'mark'];
          let pausedMs = 0;
          const pz = async () => page.evaluate(() => { let s = 0, a = null; for (const e of window.__E) { if (e.k === 'paused') a = e.t; if (e.k === 'resumed' && a) { s += e.t - a; a = null; } } return s; });
          pausedMs = await pz();
          for (let i = 0; i < 6; i++) {
            const w = tR + pausedMs + starts[i] + 400 - Date.now(); if (w > 0) await page.waitForTimeout(w);
            if (!(await intro(page))) break;
            await shots0(`s-${names[i]}`);
            if (['d15', 'd35c', 'd40w'].includes(netc)) { await page.waitForTimeout(2600); if (await intro(page)) await shots0(`s-${names[i]}-b`); }
          }
          const ok = await page.waitForFunction(() => !document.querySelector('.title-intro'), null, { timeout: 30000 }).then(() => true, () => false);
          if (!ok) R.notes.push('stuck: intro never ended');
          await page.waitForTimeout(2000);
          await shots0('card');
        }
      }
    } catch (e) { R.notes.push('ERR ' + String(e).slice(0, 240)); await L.shot(page, `${tag}-err`).catch(() => {}); }
    if (sc) { await sc.stop(); R.frames = sc.frames.length; }
    R.E = await page.evaluate(() => window.__E).catch(() => []);
    R.IMG = await page.evaluate(() => window.__IMG).catch(() => ({}));
    R.tg = await page.evaluate(() => { const r = document.querySelector('.menu-toggle')?.getBoundingClientRect(); return r && [r.left, r.top, r.width, r.height]; }).catch(() => null);
    R.net = net;
    if (sc) fs.writeFileSync(`${sc.fdir}/meta.json`, JSON.stringify({ tag, size: sz, tg: R.tg, E: R.E, frames: sc.frames }));
    out.push(R);
    const E = R.E; const mount = E.find((e) => e.k === 'intro-mount')?.t; const rd = E.find((e) => e.k === 'ready')?.t;
    console.log(JSON.stringify({ tag, notes: R.notes, wait: rd && mount ? rd - mount : null, presses: R.presses.length, frames: R.frames }));
    await ctx.close();
  }
  fs.mkdirSync(`${L.DIR}/r13p`, { recursive: true });
  fs.writeFileSync(`${L.DIR}/r13p/r13-pre-${(process.env.TAGX || '') + process.argv.slice(2).join('_').replace(/[:/]/g, '-').slice(0, 140)}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
