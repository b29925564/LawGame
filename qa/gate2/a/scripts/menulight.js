// 淺色主題、黑底鏡頭層上的選單鈕（#323）：讀檔進每一格，真點「繼續（」；rAF 每幀記鏡頭層在不在、選單鈕底色／字色亮度，停 6 秒。
const L = require('../lib.js');
const fs = require('fs');
const [sizesA = 'd1530,p7', langsA = 'zh'] = process.argv.slice(2);
const TARGETS = [...[0, 1, 2, 4, 5, 8, 9, 10, 11, 12, 13, 14].map((s) => [0, s]), [1, 0], [6, 0], [8, 0], [14, 0], [18, 0], [21, 0], [45, 0]];
const LOGGER = () => {
  window.__ml = [];
  const y = (c) => { const m = (c || '').match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number); return Math.round(0.299 * r + 0.587 * g + 0.114 * b); };
  const tick = () => {
    const mb = document.querySelector('.menu-toggle');
    const layer = ['.cold-scope', '.title-intro', '.act-stage', '.vbench', '.lock'].filter((s) => document.querySelector(s)).join(',');
    const main = document.querySelector('main');
    let m = '-'; if (mb) { const cs = getComputedStyle(mb); m = `${y(cs.backgroundColor)}/${y(cs.color)}/${cs.opacity}`; }
    const k = `${layer}|${main ? main.className.slice(0, 50) : '-'}|${getComputedStyle(document.documentElement).colorScheme}|${m}`;
    const last = window.__ml[window.__ml.length - 1];
    if (!last || last.k !== k) window.__ml.push({ t: Math.round(performance.now()), k, layer, bg: mb ? y(getComputedStyle(mb).backgroundColor) : null, ink: mb ? y(getComputedStyle(mb).color) : null });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
(async () => {
  const out = [];
  for (const size of sizesA.split(',')) for (const lang of langsA.split(',')) for (const [scene, step] of TARGETS) {
    const tag = `ml-${size}-${lang}-sc${scene}-s${step}`;
    const progress = { episode: 'ep1', scene, step, choices: { 'cold-open': { 3: 0, 6: 1 } }, cards: [], flags: [], ethics: [], scenes: {} };
    const page = await L.newPage(size, { scheme: 'light', seed: L.seedObj({ lang, progress }) });
    await page.addInitScript(LOGGER);
    await page.goto(L.BASE);
    await L.tap(page, page.getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ }).first());
    const t0 = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1200);
    const shot = await L.shot(page, tag);
    await page.waitForTimeout(4800);
    const log = (await page.evaluate(() => window.__ml));
    // 鏡頭層在畫面上、但選單鈕是淺色款（底 >60 或字 <160）的幀
    const bad = log.filter((r) => r.layer && r.bg != null && (r.bg > 60 || r.ink < 160));
    const layers = [...new Set(log.map((r) => r.k.split('|').slice(0, 2).join('|') + ' menu ' + r.bg + '/' + r.ink))];
    out.push({ tag, shot, log, bad });
    console.log(tag, shot, bad.length ? 'BAD ' + bad.map((r) => `${r.t - Math.round(t0)}ms ${r.k}`).slice(0, 4).join(' ; ') : 'ok', '|', layers.slice(0, 6).join(' → '));
    await page.context().close();
  }
  fs.writeFileSync(`${L.DIR}/data-${process.env.SHOTPFX || "a2-"}menulight-${sizesA.replace(/,/g, '_')}-${langsA}.json`, JSON.stringify(out, null, 1));
  await L.close();
})().catch((e) => { console.error(e); process.exit(1); });
