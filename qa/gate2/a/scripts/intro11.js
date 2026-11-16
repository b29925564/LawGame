// 第十輪 1：第 1 集片頭。從標題頁「新遊戲」→「第 1 集」真點，一路點完冷開場（約 23 格），片頭自己播。
// 用法：node intro10.js <size> <lang> <scheme> <mode> [reduced]
//   mode first：全新設定（只有語言），第一次播；全程 CDP screencast＋rAF 記錄（鏡頭、黑格、行號亮了幾行、全文透明度、黑條條數、圖載好沒、放大倍率、選單鈕顏色）。
//   mode replay：設定裡 introSeen.ep1＝true（看過一次，寫在設定、不是存檔），第二次播：量「跳過」鈕、Esc 暫停／繼續、跳過後的去向。
// page.evaluate 只讀。
const L = require('../lib.js');
const fs = require('fs');
const [size = 'i412', lang = 'zh', scheme = 'dark', mode = 'first', reducedA = ''] = process.argv.slice(2);
const reduced = reducedA === 'rm' ? 'reduce' : 'no-preference';
const PFX = process.env.SHOTPFX || 'a10-';
const tag = `in${process.env.THROTTLE ? 'T' + process.env.THROTTLE : ''}-${size}-${lang}-${scheme}-${mode}${reducedA === 'rm' ? '-rm' : ''}`;
const FR = `${L.DIR}/frames/${PFX}${tag}`;
const LOGGER = () => {
  const S = (window.__ti = { log: [], up: {}, start: null, startEpoch: null, end: null, shotStart: {}, loadMiss: {}, styles: null });
  let last = '';
  const tick = () => {
    const now = performance.now();
    const ti = document.querySelector('.title-intro');
    const mb = document.querySelector('.menu-toggle');
    const mcs = mb && getComputedStyle(mb);
    const menu = mcs ? `${mcs.backgroundColor}/${mcs.color}` : '-';
    if (ti) {
      if (S.start === null) { S.start = now; S.startEpoch = Date.now(); }
      const shot = ti.dataset.shot;
      const sh = ti.querySelector('.ti-shot');
      if (sh && S.shotStart[shot] === undefined) S.shotStart[shot] = now - S.start;
      const svg = ti.querySelector('.ti-paper svg');
      const rows = [...ti.querySelectorAll('.ti-prow')].filter((p) => +getComputedStyle(p).opacity > 0.5).length;
      const full = ti.querySelector('.ti-full');
      const fo = full ? Math.round(+getComputedStyle(full).opacity * 100) / 100 : '';
      const bars = [...ti.querySelectorAll('.ti-bar')];
      const bFull = bars.filter((b) => getComputedStyle(b).scale === '1 1' || getComputedStyle(b).scale === '1').length;
      const bPart = bars.filter((b) => { const s = getComputedStyle(b).scale; return s !== '1 1' && s !== '1' && s !== '0 1' && s !== 'none'; }).length;
      const imgs = [...ti.querySelectorAll('.ti-shot img')];
      const notLoaded = imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).length;
      if (sh && (notLoaded || (shot === 'paper' && !svg))) S.loadMiss[shot] = (S.loadMiss[shot] || 0) + 1;
      // 放大倍率：畫出來的裝置像素 ÷ 來源像素（cover：取長寬兩個比例較大的那個）。
      const dpr = devicePixelRatio;
      for (const i of imgs) {
        if (!i.naturalWidth || i.closest('.ti-vignette')) continue;
        const r = i.getBoundingClientRect();
        const fit = getComputedStyle(i).objectFit;
        const k = (fit === 'fill' ? Math.max(r.width / i.naturalWidth, r.height / i.naturalHeight) : Math.max(r.width / i.naturalWidth, r.height / i.naturalHeight)) * dpr;
        const key = shot + ':' + (i.currentSrc.split('/').pop().split('?')[0].replace(/-[A-Za-z0-9_]{8}\./, '.'));
        if (!S.up[key] || k > S.up[key].k) S.up[key] = { k: Math.round(k * 1000) / 1000, at: Math.round(now - S.start - (S.shotStart[shot] || 0)), nw: i.naturalWidth, nh: i.naturalHeight, rw: Math.round(r.width), rh: Math.round(r.height) };
      }
      if (svg) {
        const W = svg.viewBox.baseVal.width;
        for (const im of svg.querySelectorAll('image')) {
          const r = im.getBoundingClientRect(); if (!r.width) continue;
          const k = (r.width * dpr) / W;
          const key = 'paper:svg-image(' + W + ')';
          if (!S.up[key] || k > S.up[key].k) S.up[key] = { k: Math.round(k * 1000) / 1000, at: Math.round(now - S.start), rw: Math.round(r.width) };
        }
      }
      if (!S.styles && svg) S.styles = { on: [...ti.querySelectorAll('.ti-prow')].map((p) => p.style.getPropertyValue('--on')), fullOn: full && full.style.getPropertyValue('--full-on'), bars: bars.length, barRows: bars.map((b) => b.dataset.row), bd: bars.map((b) => b.style.getPropertyValue('--bd')) };
      const key = [shot, sh ? 'shot' : 'BLACK', ti.hasAttribute('data-paused') ? 'paused' : '', svg ? 'svg' : '', rows, fo, bFull + '+' + bPart, notLoaded ? 'NL' + notLoaded : '', menu, ti.querySelector('.ti-skip') ? 'skip' : ''].join('|');
      if (key !== last) { S.log.push({ t: Math.round((now - S.start) * 10) / 10, k: key }); last = key; }
    } else if (S.start !== null && S.end === null) {
      S.end = now - S.start;
      S.log.push({ t: Math.round(S.end), k: 'END ' + (document.querySelector('.act-card') ? 'act-card' : '') + '|' + menu });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const DONE = /沒有上車|doesn.t get on/;
(async () => {
  fs.mkdirSync(FR, { recursive: true });
  for (const f of fs.readdirSync(FR)) fs.unlinkSync(`${FR}/${f}`);
  const seed = {};
  if (lang === 'en') seed['lawgame-lang'] = 'en';
  if (mode === 'replay') seed['lawgame-settings'] = JSON.stringify({ state: { introSeen: { ep1: true } }, version: 1 });
  const page = await L.newPage(size, { scheme, reduced, seed });
  await page.addInitScript(LOGGER);
  await page.goto(L.BASE);
  await page.waitForTimeout(1200);
  await L.tap(page, page.getByRole('button', { name: lang === 'en' ? 'New game' : '新遊戲' }));
  await page.waitForTimeout(500);
  await L.tap(page, page.getByRole('button', { name: lang === 'en' ? /^Episode 1/ : /^第 1 集/ }));
  await page.waitForTimeout(1500);
  // 冷開場：一路真點到片頭。
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let casting = false;
  cdp.on('Page.screencastFrame', async (f) => {
    const n = frames.length;
    fs.writeFileSync(`${FR}/${String(n).padStart(4, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp * 1000);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const startCast = async () => { if (casting) return; casting = true; await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: size.startsWith('d') ? 720 : 412, maxHeight: 915, everyNthFrame: 1 }); };
  let steps = 0; let throttled = false; const net = [];
  page.on('requestfinished', (rq) => { if (throttled && rq.resourceType() === 'image') net.push({ url: rq.url().split('/').pop().slice(0, 40), at: Date.now() }); });
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(650);
    if (await page.locator('.title-intro').count()) break;
    const sc = page.locator('.cold-plated .sub-card'); const sub = (await sc.count()) ? await sc.first().textContent({ timeout: 1000 }).catch(() => '') : '';
    if (sub && DONE.test(sub) && mode === 'cast') await startCast();
    if (sub && DONE.test(sub) && process.env.THROTTLE && !throttled) { throttled = true; await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: +(process.env.LAT || 150), downloadThroughput: (+process.env.THROTTLE * 1024) / 8, uploadThroughput: 64 * 1024 }); console.log('throttled', process.env.THROTTLE, 'kbps at cold step', steps); }
    const beat = page.locator('.place-beat');
    if (await beat.count()) { await L.tap(page, beat).catch(() => {}); steps++; continue; }
    const primary = page.locator('.cold-plated .sub-actions .primary');
    if (await primary.count()) { await L.tap(page, primary).catch(() => {}); steps++; continue; }
    const cn = page.locator('.cine-next');
    if (await cn.count()) { await L.tap(page, cn).catch(() => {}); steps++; continue; }
    const pb = page.locator('.phone button:visible');
    if (await pb.count()) { await L.tap(page, pb.first()).catch(() => {}); steps++; continue; }
  }
  if (mode === 'cast') await startCast();
  await page.locator('.title-intro').waitFor({ timeout: 20000 });
  const t0 = Date.now();
  const at = (ms) => page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  const polls = [];
  const out = { tag, size, lang, scheme, mode, reduced, coldSteps: steps };
  const poll = async (label) => {
    const r = await page.evaluate((YEL) => {
      const yellow = eval(YEL);
      const ti = document.querySelector('.title-intro');
      const mb = document.querySelector('.menu-toggle'); const c = mb && getComputedStyle(mb);
      return { shot: ti && ti.dataset.shot, paused: ti && ti.hasAttribute('data-paused'), menuOpen: !!document.querySelector('.menu-panel'), yellow: yellow().slice(0, 5), menu: c && `${c.backgroundColor}/${c.color}`, skip: !!document.querySelector('.ti-skip'), card: !!document.querySelector('.act-card') };
    }, L.YELLOW_FN);
    polls.push({ t: Date.now() - t0, label, ...r });
    return r;
  };
  if (mode !== 'replay') {
    const KEY = [200, 1400, 1800, 2300, 3200, 5600, 7500, 9800, 10600, 13000, 16500, 17600, 20000, 23600, 25500, 29600, 31500, 34600, 36000, 37600];
    for (const k of KEY) {
      await at(k);
      if (mode === 'shots') { await L.shot(page, `${tag}-${String(k).padStart(5, '0')}`); if (!(await page.locator('.title-intro').count())) break; }
      else if (mode === 'first' && k % 2000 < 700) { const r = await poll('k' + k); if (!r.shot) break; }
    }
    // 等片頭結束、集名卡出來
    for (let i = 0; i < 40; i++) { if (!(await page.locator('.title-intro').count())) break; await page.waitForTimeout(250); }
    out.endAt = Date.now() - t0;
    await page.waitForTimeout(3500);
  } else {
    // 第二次播：有沒有「跳過」；2.5 秒按 Esc → 選單開、片頭暫停；過 2 秒再按 Esc → 關、繼續；12 秒點「跳過」。
    await at(1000);
    out.skipBtn = await page.locator('.ti-skip').count();
    out.skipBox = out.skipBtn ? await page.locator('.ti-skip').boundingBox() : null;
    await at(2500);
    const before = await poll('beforeEsc');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const p1 = await poll('esc1');
    const lg1 = await page.evaluate(() => window.__ti.log.length);
    await L.shot(page, `${tag}-esc-menu`);
    await page.waitForTimeout(2000);
    const p2 = await poll('esc1+2s');
    const lg2 = await page.evaluate(() => window.__ti.log.slice(-3));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const p3 = await poll('esc2');
    out.esc = { before, p1, p2, p3, logDuringPause: lg2 };
    await at(12000);
    await poll('beforeSkip');
    await L.shot(page, `${tag}-skipbtn`);
    const tSkip = Date.now();
    if (out.skipBtn) await L.tap(page, page.locator('.ti-skip'));
    await page.locator('.act-card').waitFor({ timeout: 5000 }).catch(() => {});
    out.skipToCard = Date.now() - tSkip;
    await poll('afterSkip');
    await page.waitForTimeout(3500);
  }
  // 集名卡：字出不出框、離選單鈕多遠、選單鈕顏色、黃。
  out.card = await page.evaluate((YEL) => {
    const yellow = eval(YEL);
    const mb = document.querySelector('.menu-toggle').getBoundingClientRect();
    const card = document.querySelector('.act-card');
    if (!card) return null;
    const rg = document.createRange(); let minD = 1e9, who = '', over = [];
    const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.data.trim()) continue; const e = n.parentElement; const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        if (!q.width) continue;
        const dx = Math.max(0, mb.left - q.right, q.left - mb.right), dy = Math.max(0, mb.top - q.bottom, q.top - mb.bottom); const d = Math.max(dx, dy);
        if (d < minD) { minD = d; who = n.data.trim().slice(0, 12); }
        if (q.right > innerWidth + 0.5 || q.left < -0.5 || q.bottom > innerHeight + 0.5) over.push(n.data.trim().slice(0, 12));
        const cb = card.getBoundingClientRect(); if (q.right > cb.right + 0.5 || q.left < cb.left - 0.5) over.push('卡外:' + n.data.trim().slice(0, 12));
      }
    }
    const c = getComputedStyle(document.querySelector('.menu-toggle'));
    return { minD: Math.round(minD * 10) / 10, who, over: [...new Set(over)], menu: `${c.backgroundColor}/${c.color}`, yellow: yellow().slice(0, 5), docW: document.documentElement.scrollWidth, vw: innerWidth, heading: (document.querySelector('.act-card h1, .act-card .act-big') || {}).textContent };
  }, L.YELLOW_FN);
  out.cardShot = await L.shot(page, `${tag}-card`);
  if (casting) await cdp.send('Page.stopScreencast').catch(() => {});
  const S = await page.evaluate(() => window.__ti);
  out.log = S.log; out.up = S.up; out.shotStart = S.shotStart; out.loadMiss = S.loadMiss; out.styles = S.styles; out.end = S.end; out.startEpoch = S.startEpoch;
  out.frames = frames.map((t) => Math.round(t - S.startEpoch));
  out.polls = polls;
  out.net = net.map((n) => ({ url: n.url, t: n.at - S.startEpoch }));
  fs.writeFileSync(`${L.DIR}/data-${PFX}${tag}.json`, JSON.stringify(out, null, 1));
  const ups = Object.entries(S.up).map(([k, v]) => `${k}=${v.k}`).join(' ');
  console.log(tag, 'cold', steps, 'end', Math.round(S.end), 'shots', JSON.stringify(Object.fromEntries(Object.entries(S.shotStart).map(([k, v]) => [k, Math.round(v)]))), 'loadMiss', JSON.stringify(S.loadMiss), '| up', ups, '| card', JSON.stringify(out.card), mode === 'replay' ? '| skip ' + out.skipBtn + ' ' + JSON.stringify(out.skipBox) + ' toCard ' + out.skipToCard + ' esc ' + JSON.stringify(out.esc) : '', 'frames', frames.length, process.env.THROTTLE ? '| net ' + JSON.stringify(out.net) : '');
  await L.close();
})().catch((e) => { console.error(e); process.exit(1); });
