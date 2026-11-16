// #320 分格動畫終值：在真畫面上每一幀（rAF，只讀）記下指定元素的計算值，動畫自然播完後看終值和中間有沒有半格。
// 用法：node anim.js <case> <size> <lang> [scale]
const L = require('../lib.js');
const fs = require('fs');
const [kase, size = 'd1530', lang = 'zh', scaleS = '1'] = process.argv.slice(2);
const scale = +scaleS;
const P = (scene, step = 0, extra = {}) => ({ episode: 'ep1', scene, step, choices: {}, cards: [], flags: [], ethics: [], scenes: {}, ...extra });
const kow = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/court-kowalski.json', 'utf8')).ep1;
const CASES = {
  act: { progress: P(6), probes: [['.act-tube', null, 'opacity'], ['.act-cone', null, 'opacity'], ['.act-big', null, 'filter'], ['.act-card .rd', '::after', 'transform']], wait: 5000, shot: '.act-card' },
  hand: { progress: P(4), probes: [['.sticky .hand .hw-c', null, 'opacity'], ['.sticky .hand', null, 'clipPath']], wait: 4000, shot: '.sticky' },
  desk: { progress: P(7), probes: [['.redact', null, 'scale'], ['mark.hl.enter', '::before', 'transform']], wait: 4000 },
  retract: { progress: { episode: 'ep1', scene: 0, step: 13, choices: { 'cold-open': { 3: 0, 6: 1 } }, cards: [], flags: [], ethics: [], scenes: {} }, probes: [['.redact', null, 'scale'], ['.redact', null, 'transform']], wait: 3000, shot: '.phone' },
  strike: { progress: kow, probes: [['.rec-row .rec-bar', null, 'scale'], ['.rec-row .rec-bar', null, 'transform']], wait: 4000, court: 'strike' },
  zero: { progress: kow, probes: [['.patience .pip', null, 'backgroundColor']], wait: 3000, court: 'zero' },
  court: { progress: kow, probes: [['.patience .pip', null, 'backgroundColor'], ['.rec-row .rec-bar', null, 'scale']], wait: 3000, court: true },
};
const C = CASES[kase];
(async () => {
  const page = await L.newPage(size, { seed: L.seedObj({ lang, progress: C.progress, settings: { textScale: scale, voScale: scale } }) });
  await page.addInitScript((probes) => {
    const log = [];
    window.__alog = log;
    const t0 = performance.now();
    const tick = () => {
      for (const [sel, pseudo, prop] of probes) {
        const els = [...document.querySelectorAll(sel)];
        if (!els.length) continue;
        const vals = els.map((e) => getComputedStyle(e, pseudo)[prop]);
        const key = sel + (pseudo || '') + ' ' + prop;
        const last = [...log].reverse().find((r) => r.key === key);
        const v = JSON.stringify(vals);
        if (!last || last.v !== v) log.push({ t: Math.round(performance.now() - t0), key, v });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, C.probes);
  await page.goto(L.BASE);
  await L.tap(page, page.getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ }).first());
  if (C.court) {
    await page.waitForTimeout(1500);
    await L.tap(page, page.getByRole('button', { name: lang === 'en' ? /Open court|Begin/ : '開庭' }).first());
    await page.waitForTimeout(1500);
    const next = async () => { await L.tap(page, page.getByRole('button', { name: '聽下一個問題' }).first()); await page.waitForTimeout(900); };
    const obj = async (n) => { await L.tap(page, page.getByRole('button', { name: n, exact: true }).first()); await page.waitForTimeout(3500); };
    if (C.court === 'strike') { await next(); await obj('不異議'); await next(); await obj('誘導'); }
    else if (C.court === 'zero') { for (let i = 0; i < 5; i++) { await next(); if (await page.getByRole('button', { name: '無關', exact: true }).count()) await obj('無關'); else break; } }
    else { await next(); await obj('無關'); }
  }
  await page.waitForTimeout(C.wait);
  const log = await page.evaluate(() => window.__alog);
  const final = {};
  for (const r of log) final[r.key] = r;
  const tag = `an-${kase}-${size}-${lang}-${Math.round(scale * 100)}`;
  const shot = await L.shot(page, tag);
  let el = null;
  if (C.shot && (await page.locator(C.shot).count())) el = await page.locator(C.shot).first().screenshot({ path: `${L.SHOTS}/a-${tag}-el.png` }).then(() => `a-${tag}-el.png`);
  fs.writeFileSync(`${L.DIR}/data-${tag}.json`, JSON.stringify({ log }, null, 1));
  console.log(tag, shot, el || '');
  for (const k of Object.keys(final)) {
    const series = log.filter((r) => r.key === k);
    console.log('  ', k, 'changes', series.length, 'final@', final[k].t, final[k].v.slice(0, 300));
    if (series.length < 40) console.log('     series', series.map((r) => r.t + ':' + r.v.slice(0, 120)).join(' | ').slice(0, 1600));
  }
  await L.close();
})();
