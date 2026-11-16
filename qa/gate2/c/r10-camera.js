// 第三輪 2：淺色主題，黑底鏡頭層切進來／切出去，選單鈕逐幀（rAF＋MutationObserver 讀 computed style，另錄 CDP screencast 量像素）。
const L = require('./lib');
const fs = require('fs');
const SAMPLER = () => {
  window.__S = [];
  const snap = (src) => {
    const b = document.querySelector('.menu-toggle');
    const layer = document.querySelector('.cold-insert') ? 'insert:' + document.querySelector('.cold-insert').dataset.phase : document.querySelector('.vbench') ? 'vbench' : document.querySelector('.cold-scope') ? 'cold' : document.querySelector('.title-intro') ? 'intro' : document.querySelector('.act-stage.place-beat') ? 'place' : document.querySelector('.act-stage') ? 'card' : document.querySelector('.call-screen') ? 'call' : document.querySelector('.cine') ? 'cine' : '';
    const e = { t: Date.now(), p: performance.now(), src, layer, scheme: document.documentElement ? getComputedStyle(document.documentElement).colorScheme : '' };
    if (b) { const cs = getComputedStyle(b); e.bg = cs.backgroundColor; e.fg = cs.color; e.bd = cs.borderTopColor; e.tr = cs.transitionProperty; }
    const key = JSON.stringify([e.layer, e.bg, e.fg, e.bd, e.scheme]);
    const last = window.__S[window.__S.length - 1];
    if (last && last.key === key) { last.n++; last.t1 = e.t; if (src === 'raf') last.frames++; return; }
    e.key = key; e.n = 1; e.t1 = e.t; e.frames = src === 'raf' ? 1 : 0; window.__S.push(e);
  };
  const loop = () => { snap('raf'); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const start = () => new MutationObserver(() => snap('mo')).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-theme', 'data-stage', 'data-phase'] });
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
};
const T = { ep1: [], ep2: [] };
const hung = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8')).ep2;
const hungAll = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8'));
const VS = (ep, v) => { const p = JSON.parse(JSON.stringify(hungAll[ep])); p.scenes.closing.verdict = v; return { version: 5, savedAt: Date.now(), label: 'x', progress: p }; };
const HS = (scene, step) => ({ version: 5, savedAt: Date.now(), label: 'x', progress: { ...hung, scene, step } });
// [名稱, 存檔, 進場動作, 進場後等多久]
// adv：按「繼續」直到鏡頭層出現；title：從標題畫面「繼續」直接進
const CASES = [
  ['ep1-cold', L.seed({ episode: 'ep1', scene: 0 }), 'title', 2500],
  ['ep1-2233-insert', L.seed({ episode: 'ep1', scene: 0, step: 1 }), 'ins', 4500],
  ['ep1-2314-busstop', L.seed({ episode: 'ep1', scene: 0, step: 11 }), 'adv', 6500],
  ['ep1-cold-to-titlecard', L.seed({ episode: 'ep1', scene: 0, step: 14 }), 'adv', 6500],
  ['ep1-place-s3', L.seed({ episode: 'ep1', scene: 2, step: 12 }), 'adv', 5500],
  ['ep1-act2', L.seed({ episode: 'ep1', scene: 5, step: 13 }), 'adv', 6500],
  ['ep1-act3', L.seed({ episode: 'ep1', scene: 8 }), 'title', 6500],
  ['ep1-place-depo', L.seed({ episode: 'ep1', scene: 10 }), 'title', 4500],
  ['ep1-place-theory', L.seed({ episode: 'ep1', scene: 12, step: 2, choices: { 'ethan-testify': { 2: 0 } } }), 'adv', 5500],
  ['ep1-act4', L.seed({ episode: 'ep1', scene: 14 }), 'title', 6500],
  ['ep1-day2', L.seed({ episode: 'ep1', scene: 18 }), 'title', 6500],
  ['ep1-day3', L.seed({ episode: 'ep1', scene: 21 }), 'title', 6500],
  ['ep1-end-to-ep2', L.seed({ episode: 'ep1', scene: 44, step: 4 }), 'adv', 2500, 'next-ep'],
  ['ep2-cold-to-titlecard', L.seed({ episode: 'ep2', scene: 0, step: 9 }), 'adv', 6500],
  ['ep2-place-corridor', L.seed({ episode: 'ep2', scene: 2, step: 10 }), 'adv', 5500],
  ['ep2-act2', L.seed({ episode: 'ep2', scene: 5 }), 'title', 6500],
  ['ep2-act3', L.seed({ episode: 'ep2', scene: 7 }), 'title', 6500],
  ['ep2-act4', L.seed({ episode: 'ep2', scene: 11 }), 'title', 6500],
  ['ep2-act5', L.seed({ episode: 'ep2', scene: 13 }), 'title', 6500],
  ['ep2-place-depo', L.seed({ episode: 'ep2', scene: 9 }), 'title', 4500],
  ['ep2-end', L.seed({ episode: 'ep2', scene: 30, step: 4 }), 'adv', 2500],
  ['ep2-epi-card-phone', HS(30, 0), 'card1', 4000],
  ['ep2-epi-phone-end', HS(30, 4), 'card1', 4000],
  ['ep1-verdict', VS('ep1', '無罪'), 'title', 9000],
  ['ep2-verdict', VS('ep2', '有責'), 'title', 9000],
];
const sizes = (process.argv[2] || 'p7').split(',').map((x) => (x === 'p7' ? 'p7' : +x));
const scheme = process.argv[3] || 'light';
const only = process.argv[4] ? process.argv[4].split(',') : null;
const out = [];
const lang0 = process.env.LANGX || 'auto';
(async () => {
  for (const size of sizes)
    for (const [name, seed, how, wait, extra] of CASES) {
      if (only && !only.includes(name)) continue;
      const lang = process.env.LANGX || (size === 'p7' ? 'zh' : 'en');
      const tag = `${name}-${size}-${lang}-${scheme}`;
      const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-ep-auto': seed }, clock: (p) => p.addInitScript(SAMPLER) });
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
      const t0 = Date.now();
      let note = '';
      try {
        if (how === 'card1') {
          await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
          await page.waitForTimeout(3500);
          for (let k = 0; k < 6; k++) {
            const nx = page.getByRole('button', { name: /^(繼續|Continue)$/ }).last();
            if (!(await nx.isVisible().catch(() => false))) break;
            await L.press(page, nx); await page.waitForTimeout(1500);
          }
        } else if (how === 'ins') {
          await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
          await page.waitForTimeout(1200);
          const b = page.locator('button.next, button.cine-next, button.phone-next').filter({ hasText: /^(繼續|Continue)$/ });
          if (await b.count() && (await b.first().isVisible())) await L.press(page, b.first()); else note += 'no-next;';
        } else if (how === 'title') {
          await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
        } else {
          await L.press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
          await page.waitForTimeout(900);
          let miss = 0; for (let k = 0; k < 20; k++) {
            if (await page.evaluate(() => !!document.querySelector('.act-stage:not(.cold-scope)')).catch(() => false)) break;
            const b = page.locator('button.next, button.cine-next, button.phone-next, button.primary').filter({ hasText: /^(繼續|Continue)$/ });
            const c = page.locator('.choices button');
            if (await c.count()) { await L.press(page, c.first()); }
            else if (await b.count() && (await b.first().isVisible())) { await L.press(page, b.first()); }
            else { const any = page.locator('button.next, button.cine-next, button.phone-next, .notif'); if (await any.count()) await L.press(page, any.first(), { scroll: false }); else { if ((miss = (miss || 0) + 1) > 4) { note += 'no-adv;'; break; } await page.waitForTimeout(800); continue; } }
            await page.waitForTimeout(350);
          }
        }
        const tIn = await page.evaluate(() => (window.__S.find((e) => e.layer && e.layer !== 'cold') || {}).t || null);
        await page.waitForTimeout(wait);
        await L.shot(page, `cam3-${tag}`);
        if (extra === 'next-ep') {
          const nx = page.getByRole('button', { name: /繼續第 2 集|Continue to Episode 2|Episode 2/ });
          if (await nx.first().waitFor({ timeout: 9000 }).then(() => true, () => false)) { await L.press(page, nx.first()); await page.waitForTimeout(2500); await L.shot(page, `cam3-${tag}-ep2cold`); } else note += 'no-next-ep;';
        }
        await page.waitForTimeout(1200);
      } catch (e) { note += 'ERR ' + String(e).slice(0, 120); }
      await cdp.send('Page.stopScreencast').catch(() => {});
      const S = await page.evaluate(() => window.__S.map(({ key, ...e }) => e));
      const tg = await page.evaluate(() => { const r = document.querySelector('.menu-toggle')?.getBoundingClientRect(); return r && [r.left, r.top, r.width, r.height]; });
      const r = { tag, size, scheme, t0, S, tg, frames, note };
      fs.writeFileSync(`${fdir}/meta.json`, JSON.stringify(r));
      out.push({ tag, note, segs: S.map((e) => `${e.layer || '-'}|${e.scheme}|${e.bg}|${e.fg}|${e.bd}|n${e.n}f${e.frames}|${e.t - t0}..${e.t1 - t0}`), nframes: frames.length });
      console.log(JSON.stringify(out[out.length - 1]));
      await ctx.close();
    }
  fs.writeFileSync(`${L.DIR}/r7-camera-${sizes.join('')}-${lang0}-${scheme}-${process.argv[5] || 'x'}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
