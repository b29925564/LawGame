// 第 3、6 項：手機戲和黑底字卡，真點擊一路走完，每一畫面量規則和手機框幾何。
// node walk7.js size lang scale ep scene  （env BASE、PREFIX；OUT 檔名帶 BASE 的埠）
const L = require('../lib.js');
const fs = require('fs');
const rules7 = require('./rules8.js');
const NM = JSON.parse(fs.readFileSync(__dirname + '/names7.json', 'utf8'));
const N = { all: [...NM.en, ...NM.zh, ...NM.ords].sort((a, b) => b.length - a.length), keepInner: NM.keepInner };
const seeds = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8'));
const [size, lang, scale, ep, scArg] = process.argv.slice(2);
const sc = +scArg;
const port = (process.env.BASE || '4189').slice(-4);
const OUT = __dirname + `/walk13-${port}.jsonl`;
const geo = () => {
  const st = document.querySelector('.phone-status')?.getBoundingClientRect();
  const out = { statusB: st ? +st.bottom.toFixed(1) : null, areas: [] };
  for (const sel of ['.phone-body.talk > .subtitles', '.phone-body.chat > .bubbles']) {
    const el = document.querySelector(sel); if (!el) continue;
    const r = el.getBoundingClientRect();
    const cp = getComputedStyle(el).clipPath; const mm = /inset\(([\d.]+)px/.exec(cp);
    const visTop = r.top + (mm ? +mm[1] : 0);
    const lines = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let n = w.nextNode(); n; n = w.nextNode()) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.height > 0.5 && q.width > 0.5) lines.push({ t: +q.top.toFixed(1), b: +q.bottom.toFixed(1), x: n.textContent.trim().slice(0, 14) }); }
    const half = lines.filter((q) => q.t < visTop - 0.5 && q.b > visTop + 0.5);
    const visible = lines.filter((q) => q.t >= visTop - 0.5 && q.b <= r.bottom + 0.5);
    const below = lines.filter((q) => q.b > r.bottom + 0.5 && q.t < r.bottom - 0.5);
    const firstVis = visible.length ? Math.min(...visible.map((q) => q.t)) : null;
    const last = el.lastElementChild?.getBoundingClientRect();
    out.areas.push({ sel, top: +r.top.toFixed(1), visTop: +visTop.toFixed(1), bottom: +r.bottom.toFixed(1), clip: cp, scrollTop: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight,
      half: half.length, halfX: half.map((q) => q.x), below: below.length, firstVisTop: firstVis, overStatus: st && firstVis !== null ? +(st.bottom - firstVis).toFixed(1) : null,
      lastBottomMinus: last ? +(last.bottom - r.bottom).toFixed(1) : null, nLines: lines.length, nHidden: lines.length - visible.length - half.length - below.length });
  }
  return out;
};
const P = () => {
  if (ep === 'ep2' && sc === 30) { const p = structuredClone(seeds.ep2); p.scene = 30; p.step = 0; return p; }
  return { episode: ep, scene: sc, step: 0, choices: {}, cards: [], flags: [], ethics: [], scenes: {} };
};
(async () => {
  const tag = `w-${ep}-s${sc}-${size}-${lang}-${Math.round(scale * 100)}`;
  const { page, ctx } = await L.open({ size, lang, save: P(), settings: { textScale: +scale } });
  try {
    await L.tap(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
    let lastSig = '';
    for (let k = 0; k < 40; k++) {
      await page.waitForTimeout(1400);
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(rules7, N);
      const g = await page.evaluate(geo);
      if (k > 0 && !/place-beat|cine|phone-stage|plated|call-screen/.test(m.main)) { console.log(tag, k, 'left', m.main); break; }
      const sig = m.main + JSON.stringify(m.dump);
      const shot = sig === lastSig ? null : await L.shot(page, `${tag}-k${k}`);
      lastSig = sig;
      fs.appendFileSync(OUT, JSON.stringify({ tag, ep, sc, size, lang, scale: +scale, k, shot, main: m.main, menuBg: m.menuBox && m.menuBox.bg, geo: g, rules: m }) + '\n');
      const bad = ['over', 'menu', 'cut', 'btn', 'overlap', 'room', 'enTail', 'numCl', 'min3'].map((x) => m[x].length ? `${x}${m[x].length}` : '').filter(Boolean).join(' ');
      console.log(`${tag}-k${k}`, m.main.slice(0, 26), bad, g.areas.map((a) => `${a.sel.slice(12, 20)} visTop ${a.visTop} statusB ${g.statusB} half ${a.half} overStatus ${a.overStatus} lastB ${a.lastBottomMinus}`).join(' | '));
      const vis = async (q) => { const l = page.locator(q).filter({ visible: true }); return (await l.count()) ? l.first() : null; };
      let t;
      if ((t = await vis('.place-beat')) || (t = await vis('.cine-next')) || (t = await vis('.notif')) || (t = await vis('.replies button')) || (t = await vis('.phone-next')) || (t = await vis('main button.primary')) || (t = await vis('.scene.plated .primary'))) { await L.tap(page, t); continue; }
      console.log('   no control'); break;
    }
  } catch (e) { console.log('FAIL', tag, e.message.split('\n')[0]); }
  await ctx.close();
  await L.close();
})();
