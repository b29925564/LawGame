// 第 3 項：short-labels.spec.ts 清單裡第 2 集每個場景，用 rules.js 量三條規則。node scan6.js size lang scale [idx,...]
const L = require('../lib.js');
const fs = require('fs');
const rules7 = require('./rules8.js');
const NM = JSON.parse(fs.readFileSync(__dirname + '/names7.json', 'utf8'));
const N = { all: [...NM.en, ...NM.zh, ...NM.ords].sort((a, b) => b.length - a.length), keepInner: NM.keepInner };
const seeds = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8'));
const SCENES = [
  [0, '冷開場', 0, 'blank'], [0, '冷開場（赫克托）', 1, 'blank'], [0, '冷開場派單', 4, 'blank'], [4, '訪談', 0, 'blank'],
  [6, '桌面', 0, 'blank'], [8, '取證', 0, 'blank'], [9, '取證（對方）', 0, 'blank'], [11, '幕卡', 0, 'blank'], [12, '調解', 0, 'blank'],
  [14, '案件理論', 0, 'blank'], [15, '選陪審團', 0, 'clear'], [16, '開場陳述', 0, 'vd'], [17, '交互詰問', 0, 'vd'], [21, '結辯', 0, 'closing'],
  [22, '尾聲對話', 0, 'hung'], [30, '尾聲來電', 0, 'hung'], [30, '尾聲來電（通知）', 2, 'hung'], [30, '尾聲來電（回覆）', 3, 'hung'], [30, '尾聲來電（選項）', 4, 'hung'], [30, '尾聲來電 step1', 1, 'hung'],
  [1, '集名卡', 0, 'blank'], [2, '指派', 0, 'blank'], [3, '走廊', 0, 'blank'], [5, '幕卡', 0, 'blank'], [7, '幕卡', 0, 'blank'], [10, '桌面2', 0, 'blank'], [13, '幕卡', 0, 'blank'],
  [17, '交互詰問（IOU）', 0, 'hung'], [18, '詰問2', 0, 'vd'], [19, '詰問3', 0, 'vd'], [20, '辯方', 0, 'hung'],
  [23, '尾聲', 0, 'hung'], [24, '尾聲', 0, 'hung'], [25, '尾聲', 0, 'hung'], [26, '尾聲', 0, 'hung'], [27, '尾聲', 0, 'hung'], [28, '尾聲', 0, 'hung'], [29, '尾聲', 0, 'hung'],
];
function progressOf(scene, step, seed) {
  if (seed === 'blank') return { episode: 'ep2', scene, step, choices: { 'cold-open': { 4: 1 } }, cards: [], flags: [], ethics: [], scenes: {} };
  const p = structuredClone(seeds.ep2); const sc = p.scenes;
  p.scene = scene; p.step = step;
  p.scenes = seed === 'clear' ? {} : seed === 'vd' ? { 'voir-dire': sc['voir-dire'] } : seed === 'closing' ? Object.fromEntries(Object.entries(sc).filter(([k]) => k !== 'closing')) : sc;
  return p;
}

const FIND = () => {
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!/急診|診科|emergency/i.test(n.data)) continue;
    let b = n.parentElement; while (b && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
    if (!b || seen.has(b)) continue; seen.add(b);
    const cs = getComputedStyle(b); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const ch = []; const ww = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); const rg = document.createRange();
    for (let m = ww.nextNode(); m; m = ww.nextNode()) for (let i = 0; i < m.length; i++) { const c = m.data[i]; if (/\s/.test(c)) { ch.push({ c, sp: 1 }); continue; } rg.setStart(m, i); rg.setEnd(m, i + 1); const q = [...rg.getClientRects()].find((q) => q.width > 0); if (!q) { ch.push({ c, sp: 1 }); continue; } ch.push({ c, m: (q.top + q.bottom) / 2, l: q.left, r: q.right, t: q.top, b: q.bottom }); }
    const lines = []; let cur = null;
    for (const x of ch) { if (x.sp) { if (cur) cur.t += x.c; continue; } if (!cur || Math.abs(x.m - cur.m) > 6) { cur = { t: x.c, l: x.l, r: x.r, top: x.t, bot: x.b, m: x.m }; lines.push(cur); } else { cur.t += x.c; cur.l = Math.min(cur.l, x.l); cur.r = Math.max(cur.r, x.r); cur.bot = Math.max(cur.bot, x.b); } }
    const r = b.getBoundingClientRect(); const n2 = (v) => parseFloat(v) || 0; const il = r.left + n2(cs.borderLeftWidth) + n2(cs.paddingLeft), ir = r.right - n2(cs.borderRightWidth) - n2(cs.paddingRight);
    const p = []; for (let x = b; x && x !== document.body && p.length < 4; x = x.parentElement) p.unshift(x.tagName.toLowerCase() + (typeof x.className === 'string' && x.className ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    out.push({ sel: p.join('>'), lines: lines.map((L) => L.t.trim()), over: +Math.max(...lines.map((L) => Math.max(L.r - ir, il - L.l))).toFixed(1), vis: lines.map((L) => L.bot > 0 && L.top < innerHeight) });
  }
  return out;
};
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
const BTN = /^(Sit down|坐下|Go to court|開庭|開始錄取|Begin.*|Start.*|開始.*)$/;
const [size, lang, scale, only] = process.argv.slice(2);
const OUT = __dirname + `/scan13-${(process.env.BASE || '4189').slice(-4)}.jsonl`;
(async () => {
  const idx = only ? only.split(',').map(Number) : SCENES.map((_, i) => i);
  for (const i of idx) {
    const [sc, label, step, seed] = SCENES[i];
    const tag = `s-${sc}-${step}${seed === 'hung' && sc < 22 ? 'h' : ''}-${size}-${lang}-${Math.round(scale * 100)}`;
    const { page, ctx } = await L.open({ size, lang, save: progressOf(sc, step, seed), settings: { textScale: +scale, voScale: +scale }, extraLS: { 'rd.dev.intro': '0' } });
    try {
      await L.tap(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(200);
        const m = await page.evaluate(rules7, N); const ax = await axButtons(page); const found = await page.evaluate(FIND);
        const shot = await L.shot(page, `${tag}-k${k}`);
        fs.appendFileSync(OUT, JSON.stringify({ tag, i, sc, label, step, size, lang, scale: +scale, k, shot, ax, found, ...m }) + '\n');
        console.log(`${tag}-k${k}`, m.main.slice(0, 30), 'sw', m.docSW, '/', m.vw, 'blocks', m.blocks);
        for (const k of ['over','menu','cut','btn','overlap']) for (const o of m[k]) console.log('   ', k, JSON.stringify({ ...o, lines: undefined }).slice(0, 160));
        const pb = page.locator('.place-beat:visible');
        if (await pb.count()) { await L.tap(page, pb.first()); continue; }
        const b = page.getByRole('button', { name: BTN }).filter({ visible: true });
        if (await b.count()) { await L.tap(page, b.first()); continue; }
        break;
      }
    } catch (e) { console.log('FAIL', tag, e.message.split('\n')[0]); }
    await ctx.close();
  }
  await L.close();
})();
