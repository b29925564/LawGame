// 第 10 輪 1：片頭的全站行為。用法：node r10-intro.js job1 job2 …
// job = 模式:尺寸:語言:集[:選項]；模式 rec（整段錄＋逐幀）／menu（選單、Esc、焦點）／skip（跳過）／ax（無障礙樹）／rm（減少動態）／delay（圖延遲 3 秒）
// 進場：localStorage 存檔 lawgame-ep-auto＝該集 scene 1 step 0（片頭那張卡），從標題按「繼續」。skip／第二次播：lawgame-settings 先寫 introSeen。
// 只用真輸入（滑鼠／鍵盤／觸控），page.evaluate 只讀。
const L = require('./lib');
const fs = require('fs');
const SAMPLER = () => {
  window.__S = [];
  window.__U = {};
  window.__F = [];
  const snap = (src) => {
    const b = document.querySelector('.menu-toggle');
    const ti = document.querySelector('.title-intro');
    const layer = ti ? 'intro' : document.querySelector('.act-stage') ? 'card' : document.querySelector('.cold-scope') ? 'cold' : document.querySelector('main') ? 'other' : '';
    const e = { t: Date.now(), p: performance.now(), src, layer, shot: ti?.dataset.shot || '', paused: ti ? ti.hasAttribute('data-paused') : null, menu: !!document.querySelector('.menu-panel'), scheme: document.documentElement ? getComputedStyle(document.documentElement).colorScheme : '' };
    e.bodyBg = document.body ? getComputedStyle(document.body).backgroundColor : '';
    e.shotEl = ti ? !!ti.querySelector('.ti-shot') : null;
    if (b) { const cs = getComputedStyle(b); e.bg = cs.backgroundColor; e.fg = cs.color; e.bd = cs.borderTopColor; }
    const key = JSON.stringify([e.layer, e.shot, e.shotEl, e.paused, e.menu, e.bg, e.fg, e.bd, e.scheme, e.bodyBg]);
    const last = window.__S[window.__S.length - 1];
    if (last && last.key === key) { last.n++; last.t1 = e.t; if (src === 'raf') last.frames++; return; }
    e.key = key; e.n = 1; e.t1 = e.t; e.frames = src === 'raf' ? 1 : 0; window.__S.push(e);
  };
  const loop = () => { snap('raf'); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // 片頭裡實際畫上去的圖（img.currentSrc、SVG image href）。
  setInterval(() => {
    const ti = document.querySelector('.title-intro');
    if (!ti) return;
    const shot = ti.dataset.shot;
    for (const i of ti.querySelectorAll('img')) {
      const r = i.getBoundingClientRect();
      const vis = r.width > 0 && getComputedStyle(i).visibility !== 'hidden';
      if (i.currentSrc) (window.__U[i.currentSrc] ||= { shots: [], complete: false, vis: false }).shots.includes(shot) || window.__U[i.currentSrc].shots.push(shot);
      if (i.currentSrc) { window.__U[i.currentSrc].complete ||= i.complete && i.naturalWidth > 0; window.__U[i.currentSrc].vis ||= vis; window.__U[i.currentSrc].nat = [i.naturalWidth, i.naturalHeight]; window.__U[i.currentSrc].box = [Math.round(r.width), Math.round(r.height)]; }
    }
    for (const i of ti.querySelectorAll('image')) {
      const u = new URL(i.href.baseVal, location.href).href;
      (window.__U[u] ||= { shots: [], svg: true }).shots.includes(shot) || window.__U[u].shots.push(shot);
    }
  }, 200);
  const start = () => new MutationObserver(() => snap('mo')).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-theme', 'data-shot', 'data-paused'] });
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
};
const settings = (seen) => ({ state: { introSeen: seen }, version: 1 });
const SEED = (ep) => L.seed({ episode: ep, scene: 1, step: 0 });
const out = [];
const focusInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return { el: a === document.body ? 'body' : null };
  const cs = getComputedStyle(a);
  const r = a.getBoundingClientRect();
  return { el: a.tagName.toLowerCase() + '.' + (a.className || '').toString().split(' ')[0], name: a.getAttribute('aria-label') || a.innerText.trim().slice(0, 20), fv: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} off${cs.outlineOffset}`, shadow: cs.boxShadow, box: [r.left, r.top, r.width, r.height].map(Math.round), inIntro: !!a.closest('.title-intro') };
});
const tabOrder = async (page, n = 6) => {
  const seq = [];
  for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(120); const f = await focusInfo(page); seq.push(f.el + ' ' + (f.name || '')); }
  return seq;
};
async function startIntro(page) {
  await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
  await page.waitForFunction(() => !!document.querySelector('.title-intro'), null, { timeout: 8000 });
  return page.evaluate(() => Date.now());
}
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 });
  return { fdir, frames, stop: () => cdp.send('Page.stopScreencast').catch(() => {}) };
}
async function net(page) {
  const list = [];
  page.on('response', async (r) => {
    const rt = r.request().resourceType();
    const u = r.url();
    if (rt !== 'image' && !/\.(avif|webp|jpe?g|png)(\?|$)/.test(u)) return;
    let size = null;
    try { size = (await r.body()).length; } catch {}
    list.push({ url: u, status: r.status(), type: r.headers()['content-type'], size, t: Date.now() });
  });
  return list;
}
async function finish(page, R, sc) {
  if (sc) { await sc.stop(); }
  R.S = await page.evaluate(() => window.__S.map(({ key, ...e }) => e));
  R.used = await page.evaluate(() => window.__U);
  R.tg = await page.evaluate(() => { const r = document.querySelector('.menu-toggle')?.getBoundingClientRect(); return r && [r.left, r.top, r.width, r.height]; });
  if (sc) { R.frames = sc.frames; R.size = R.sz; fs.writeFileSync(`${sc.fdir}/meta.json`, JSON.stringify({ tag: R.tag, size: R.sz, scheme: 'light', t0: R.t0, S: R.S, tg: R.tg, frames: sc.frames })); delete R.frames; }
  R.segs = R.S.map((e) => `${e.layer || '-'}|${e.shot}|el${e.shotEl}|p${e.paused}|m${e.menu}|${e.scheme}|${e.bg}|${e.bd}|body ${e.bodyBg}|n${e.n}f${e.frames}|${e.t - R.t0}..${e.t1 - R.t0}`);
  delete R.S;
}
const AX = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  return nodes.filter((n) => !n.ignored && n.role && !['none', 'generic', 'InlineTextBox', 'LineBreak'].includes(n.role.value))
    .map((n) => `${n.role.value}:${JSON.stringify(n.name?.value ?? '')}${n.properties?.find((p) => p.name === 'focused')?.value?.value ? ' [focused]' : ''}`)
    .filter((s) => !/^RootWebArea/.test(s));
};
(async () => {
  for (const job of process.argv.slice(2)) {
    const [mode, sz0, lang, ep, opt] = job.split(':');
    const sz = sz0 === 'p7' ? 'p7' : +sz0;
    const tag = `intro-${mode}-${sz0}-${lang}-${ep}${opt ? '-' + opt : ''}`;
    const R = { tag, mode, sz, lang, ep, opt, notes: [] };
    const seen = mode === 'skip' || opt === 'seen' ? { [ep]: true } : {};
    const { ctx, page } = await L.open(sz, { lang, scheme: 'light', rm: mode === 'rm', ls: { 'lawgame-ep-auto': SEED(ep), 'lawgame-settings': settings(seen) }, clock: async (p) => {
      await p.addInitScript(SAMPLER);
      if (mode === 'delay' || opt === 'delay') await p.context().route(/\/assets\/.*\.(avif|webp|jpe?g|png)(\?.*)?$/, async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue().catch(() => {}); });
    } });
    const nl = await net(page);
    let sc = null;
    try {
      if (['rec', 'rm', 'delay', 'slow', 'skip'].includes(mode)) sc = await screencast(ctx, page, tag);
      if (mode === 'slow') { const c = await ctx.newCDPSession(page); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 }); R.throttle = '1.6 Mbps down, 750 kbps up, 150 ms'; }
      const tPre = Date.now();
      R.t0 = await startIntro(page);
      R.t0 = Math.min(R.t0, tPre + 400);
      if (opt === 'rmmenu') {
        await page.waitForTimeout(800);
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        await L.press(page, page.locator('.menu-panel').getByRole('tab', { name: /選項|Options/ }), { scroll: false });
        const cb = page.locator('.menu-panel').getByRole('checkbox', { name: /減少動態|Reduce motion/ });
        await L.press(page, cb, { scroll: true }); await page.waitForTimeout(200);
        R.rmChecked = await cb.isChecked();
        R.htmlRm = await page.evaluate(() => document.documentElement.dataset.reducedMotion ?? null);
        await L.shot(page, `${tag}-rmchecked`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        R.pausedMs = Date.now() - R.t0 - 800;
        R.t0 += R.pausedMs; // 暫停那段不算
      }
      if (mode === 'rec' || mode === 'rm' || mode === 'delay' || mode === 'slow') {
        // 每個鏡頭拍一張（鏡頭內 1.5 秒）
        const shots = ['paper', 'blind', 'court', 'witness', 'lucas', 'mark'];
        const startAt = [0, 10000, 17000, 23000, 29000, 34000];
        for (let i = 0; i < shots.length; i++) {
          const want = R.t0 + startAt[i] + (mode === 'delay' || mode === 'slow' ? 1500 : 2500);
          const w = want - Date.now(); if (w > 0) await page.waitForTimeout(w);
          const TR = () => page.evaluate(() => { const ti = document.querySelector('.title-intro'); if (!ti) return null; const o = {}; for (const sel of ['.ti-sheet', '.ti-blinds', '.ti-pan', '.ti-push29', '.ti-plate img', '.ti-shot']) { const e = ti.querySelector(sel); if (e) { const cs = getComputedStyle(e); o[sel] = cs.transform + ' op' + cs.opacity + ' ' + cs.animationName; } } const imgs = [...ti.querySelectorAll('img')].map((i) => (i.currentSrc || i.src).split('/').pop().slice(0, 28) + (i.complete && i.naturalWidth ? ':ok' : ':wait')); return { shot: ti.dataset.shot, o, imgs }; });
          (R.moves ||= []).push(await TR()); await page.waitForTimeout(700); (R.moves ||= []).push(await TR());
          await L.shot(page, `${tag}-${shots[i]}`);
          if ((mode === 'delay' || mode === 'slow') && i < 6) { await page.waitForTimeout(2200); await L.shot(page, `${tag}-${shots[i]}-b`); }
        }
        if (mode === 'rm') R.anim = await page.evaluate(() => [...document.querySelectorAll('.title-intro *')].filter((e) => getComputedStyle(e).animationName !== 'none').map((e) => `${e.className?.baseVal ?? e.className}:${getComputedStyle(e).animationName}:${getComputedStyle(e).animationDuration}`).slice(0, 20));
        const ok = await page.waitForFunction(() => !document.querySelector('.title-intro') && !!document.querySelector('.act-stage'), null, { timeout: 15000 }).then(() => true, () => false);
        R.cardAt = Date.now() - R.t0;
        if (!ok) R.notes.push('卡住：沒到集名卡');
        await page.waitForTimeout(2500);
        await L.shot(page, `${tag}-card`);
      } else if (mode === 'skip') {
        const at = +(opt || 2000);
        await page.waitForTimeout(at);
        R.focusOrder = await tabOrder(page, 3);
        // 用滑鼠／觸控按「跳過」
        const sk = page.locator('.ti-skip');
        R.skipVisible = await sk.isVisible().catch(() => false);
        R.skipAx = await AX(page);
        await L.shot(page, `${tag}-before`);
        R.tSkip = Date.now() - R.t0;
        if (R.skipVisible) await L.press(page, sk, { scroll: false }); else R.notes.push('沒有跳過鈕');
        await page.waitForTimeout(80);
        await L.shot(page, `${tag}-after80ms`);
        await page.waitForTimeout(2500);
        await L.shot(page, `${tag}-after`);
        R.afterFocus = await focusInfo(page);
        R.afterLayer = await page.evaluate(() => ({ intro: !!document.querySelector('.title-intro'), card: !!document.querySelector('.act-stage'), text: document.querySelector('.act-stage')?.innerText.slice(0, 60) }));
        await page.waitForTimeout(1500);
      } else if (mode === 'menu') {
        await page.waitForTimeout(2500);
        R.tabNoMenu = await tabOrder(page, 3);
        await L.shot(page, `${tag}-tabfocus`);
        const f0 = await focusInfo(page);
        R.focusIntro = f0;
        // Esc 打開選單
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        R.escOpen = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), modal: document.querySelector('.menu-panel')?.getAttribute('aria-modal'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused'), shot: document.querySelector('.title-intro')?.dataset.shot }));
        R.focusInMenu = await focusInfo(page);
        await L.shot(page, `${tag}-escopen`);
        R.axMenu = await AX(page);
        // 暫停是不是真的停：隔 1.5 秒兩張圖比
        const a = await page.screenshot(); await page.waitForTimeout(1500); const b = await page.screenshot();
        R.pausedSame = a.equals(b);
        R.tabInMenu = await tabOrder(page, 5);
        await L.shot(page, `${tag}-menutab`);
        // 第二層：在選單裡打開「選項」分頁，或「重設設定」的確認（如果有）
        const opts = page.locator('.menu-panel').getByRole('tab', { name: /選項|Options|設定|Settings/ });
        if (await opts.count()) { await L.press(page, opts.first(), { scroll: false }); await page.waitForTimeout(300); }
        const reset = page.locator('.menu-panel').getByRole('button', { name: /重設設定|Reset settings/ });
        R.hasReset = await reset.count();
        if (R.hasReset) { await L.press(page, reset.first()); await page.waitForTimeout(400); }
        R.layer2 = await page.evaluate(() => ({ dialogs: [...document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]')].map((d) => (d.className || d.tagName) + ':' + (d.getAttribute('aria-modal') || '')), menu: !!document.querySelector('.menu-panel') }));
        await L.shot(page, `${tag}-layer2`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        R.esc1 = await page.evaluate(() => ({ dialogs: [...document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]')].map((d) => (d.className || d.tagName) + ''), menu: !!document.querySelector('.menu-panel'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused'), intro: !!document.querySelector('.title-intro') }));
        await L.shot(page, `${tag}-esc1`);
        if (R.esc1.menu) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
        R.esc2 = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused'), intro: !!document.querySelector('.title-intro'), shot: document.querySelector('.title-intro')?.dataset.shot }));
        R.focusAfterClose = await focusInfo(page);
        await L.shot(page, `${tag}-closed`);
        // 滑鼠／觸控按選單鈕，再按一次關
        const tg = page.locator('.menu-toggle');
        await L.press(page, tg, { scroll: false }); await page.waitForTimeout(400);
        R.tapOpen = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused') }));
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        R.tapEsc = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), paused: document.querySelector('.title-intro')?.hasAttribute('data-paused') }));
        R.focusAfterTapClose = await focusInfo(page);
        await L.shot(page, `${tag}-tapclosed`);
        // 暫停時間有沒有補回：等片頭播完，量總長
        const ok = await page.waitForFunction(() => !document.querySelector('.title-intro'), null, { timeout: 60000 }).then(() => true, () => false);
        R.totalMs = Date.now() - R.t0;
        if (!ok) R.notes.push('卡住');
      } else if (mode === 'ax') {
        const startAt = [0, 10000, 17000, 23000, 29000, 34000];
        R.ax = [];
        for (let i = 0; i < 6; i++) {
          const w = R.t0 + startAt[i] + 2500 - Date.now(); if (w > 0) await page.waitForTimeout(w);
          R.ax.push({ shot: await page.evaluate(() => document.querySelector('.title-intro')?.dataset.shot), nodes: await AX(page) });
        }
        // 片頭裡所有看得到的字（含 aria-hidden 底下）
        R.text = await page.evaluate(() => document.querySelector('.title-intro')?.innerText.slice(0, 200));
      }
    } catch (e) { R.notes.push('ERR ' + String(e).slice(0, 200)); }
    await finish(page, R, sc);
    R.net = nl.map((x) => ({ ...x, url: x.url.replace(/^https?:\/\/[^/]+/, ''), t: x.t - R.t0 }));
    out.push(R);
    console.log(JSON.stringify({ tag, notes: R.notes, cardAt: R.cardAt }));
    await ctx.close();
  }
  fs.writeFileSync(`${L.DIR}/r11-intro-${process.argv.slice(2).join('_').replace(/[:/]/g, '-').slice(0, 120)}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
