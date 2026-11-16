// 第十三輪：盧卡斯大立繪（#344 新位置：台詞欄右邊）。讀存檔進場、真點往下走，每一步都量（只讀）。
// 量：立繪 img 框、currentSrc、naturalWidth、DPR、pointer-events、transform；main.scene 和 .lines 的框；選單鈕框；
//     畫面上所有看得到的字（Range 矩形）、按鈕、輸入、其他圖片的框（Python 拿來和立繪不透明像素比有沒有疊）。
// 每個場景第一次出現立繪截全畫面一張、立繪區放大一張；換表情時再截。
// 用法：BASE=... SHOTPFX=... node stage13.js <sizes> <scenes> [lang]
const L = require('../lib.js');
const fs = require('fs');
const [sizesA = 'd1440', scA = '2', lang = 'zh'] = process.argv.slice(2);
const EP = process.env.EP || 'ep1';
const PFX = (process.env.SHOTPFX || 'a14-') + (process.env.SCALE ? 's' + process.env.SCALE + '-' : '');
const MEAS = () => {
  const rr = (r) => [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 100) / 100);
  const vis = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const f = document.querySelector('.lucas-stage');
  const img = f && f.querySelector('img');
  const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, sy: scrollY, menu: (() => { const m = document.querySelector('.menu-toggle'); return m ? rr(m.getBoundingClientRect()) : null; })() };
  const main = document.querySelector('main'); out.main = main ? rr(main.getBoundingClientRect()) : null; out.mainCls = main ? main.className : null;
  const lines = document.querySelector('main .lines'); out.lines = lines ? rr(lines.getBoundingClientRect()) : null;
  if (img && vis(img)) {
    const cs = getComputedStyle(img); const fc = getComputedStyle(f);
    out.stage = { ov: fc.overflow, figW: fc.width, figH: fc.height, k: fc.getPropertyValue('--k').trim(), dprVar: f.style.getPropertyValue('--dpr'), fig: rr(f.getBoundingClientRect()), img: rr(img.getBoundingClientRect()), src: img.currentSrc, nw: img.naturalWidth, nh: img.naturalHeight, complete: img.complete, fit: cs.objectFit, pos: cs.objectPosition, peF: fc.pointerEvents, peI: cs.pointerEvents, tf: cs.transform + '/' + fc.transform, rot: cs.rotate + '/' + fc.rotate, scale: cs.scale + '/' + fc.scale, op: fc.opacity + '/' + cs.opacity, z: fc.zIndex, mask: cs.maskImage + '/' + fc.maskImage, sizes: img.sizes, srcset: img.srcset.replace(/http:\/\/[^/]+\/assets\//g, '') };
  } else out.stage = null;
  // 看得到的東西
  const items = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.data.trim() || !vis(n.parentElement) || n.parentElement.closest('.sr-only, .lucas-stage')) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const q of rg.getClientRects()) if (q.width >= 1 && q.bottom > 0 && q.top < innerHeight) items.push({ k: 'txt', t: n.data.trim().slice(0, 24), r: rr(q), el: (n.parentElement.tagName + '.' + String(n.parentElement.className).split(' ')[0]).slice(0, 30) });
  }
  for (const e of document.querySelectorAll('button, a, input, select, textarea, [role=button], [role=tab], img, svg, canvas, video, .card, .chip, .badge, .toast, .timer, .clock')) {
    if (e.closest('.lucas-stage') || !vis(e)) continue;
    if (e.tagName === 'svg' && e.closest('button')) continue;
    items.push({ k: e.tagName.toLowerCase(), t: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('alt') || '').trim().slice(0, 24), r: rr(e.getBoundingClientRect()), el: (e.tagName + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ')[0]).slice(0, 30) });
  }
  out.items = items;
  out.heading = document.querySelector('main .eyebrow, main h1, main h2')?.innerText.slice(0, 40) || '';
  out.lastWho = [...document.querySelectorAll('main .lines .who, main .lines .name, main .lines b')].map((x) => x.innerText).slice(-1)[0] || '';
  out.sw = document.documentElement.scrollWidth - innerWidth;
  return out;
};
(async () => {
  const all = [];
  const en = lang === 'en';
  for (const size of sizesA.split(',')) for (const sc of scA.split(',')) {
    const progress = { episode: EP, scene: +sc, step: 0, choices: {}, cards: [], flags: [], ethics: [], scenes: {} };
    const page = await L.newPage(size, { seed: { ...L.seedObj({ lang, progress, settings: process.env.SCALE ? { textScale: +process.env.SCALE, voScale: +process.env.SCALE } : {} }), 'rd.dev.intro': '0' } });
    await page.goto(L.BASE, { timeout: 60000 });
    page.setDefaultTimeout(8000);
    await L.tap(page, page.getByRole('button', { name: en ? /^Continue/ : /^繼續（/ }).first());
    await page.waitForTimeout(1500);
    const steps = []; const shotKeys = new Set();
    const tryTap = async (loc) => { if (await loc.count().catch(() => 0)) { const v = await loc.first().isVisible().catch(() => false); if (v) { await L.tap(page, loc.first()).catch(() => {}); return true; } } return false; };
    let leftScene = false;
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(500);
      const m = await page.evaluate(MEAS);
      m.step = i;
      if (m.stage) {
        await page.waitForTimeout(450); // 淡入完
        const m2 = await page.evaluate(MEAS); m2.step = i; Object.assign(m, m2);
        const mood = (m.stage.src.split('__')[2] || '?');
        const key = `${mood}`;
        if (!shotKeys.has(key)) {
          shotKeys.add(key);
          const tag = `st-${EP}-${size}-${lang}-${sc}-${mood}`;
          m.shot = await L.shot(page, tag);
          const s = m.stage.fig; const pad = 40;
          const clip = { x: Math.max(0, s[0] - 120), y: Math.max(0, s[1] - pad), width: Math.min(m.vw, s[2] + pad) - Math.max(0, s[0] - 120), height: Math.min(m.vh, s[3]) - Math.max(0, s[1] - pad) };
          if (clip.width > 4 && clip.height > 4) m.zoom = await L.shot(page, `${tag}-zoom`, { clip });
        }
      }
      steps.push(m);
      if (/^(結語|Epilogue)/.test(m.heading) && +sc < 27) { leftScene = true; }
      if (await tryTap(page.locator('.vo-hit'))) continue;
      if (await tryTap(page.locator('main[data-auto]'))) continue;
      if (await tryTap(page.getByRole('button', { name: en ? 'Continue' : '繼續', exact: true }))) continue;
      if (await tryTap(page.locator('main .primary.next:visible, main button.primary:visible'))) continue;
      if (await tryTap(page.locator('main .choices button:visible, main .options button:visible, main li > button:visible, main button.wide:visible'))) continue;
      break;
    }
    const st = steps.filter((x) => x.stage);
    all.push({ ep: EP, size, sc, lang, base: L.BASE, steps });
    console.log(`${EP} ${size} ${lang} sc${sc}: 步 ${steps.length}，有立繪 ${st.length}，表情 ${[...new Set(st.map((x) => x.stage.src.split('__')[2]))].join('/') || '-'}，main ${steps[0] && steps[0].mainCls}，sw ${Math.max(...steps.map((x) => x.sw))}${st[0] ? ` fig ${st[0].stage.fig.join(',')} img ${st[0].stage.img.join(',')} nw${st[0].stage.nw} dpr${st[0].dpr} pe ${st[0].stage.peF}` : ''}`);
    await page.context().close();
  }
  fs.writeFileSync(`${L.DIR}/data-${PFX}stage-${EP}-${sizesA.replace(/,/g, '_')}-${scA.replace(/,/g, '_')}-${lang}.json`, JSON.stringify(all));
  await L.close();
})().catch((e) => { console.error(e); process.exit(1); });
