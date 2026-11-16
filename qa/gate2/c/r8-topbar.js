// 第三輪 1：頂列期限（fitLine）＋所有有頂列的頁面：不在詞中斷、無孤字、和選單鈕間距 ≥8、無省略號。
const L = require('./lib');
const fs = require('fs');
const NAMES = [...JSON.parse(fs.readFileSync(__dirname + '/names8.json', 'utf8')).map((x) => x.n), 'Assistant District Attorney', 'Conference Room A', 'Courtroom 5', 'Room A', '12th-floor', 'VP of Operations'];
const court = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/court-kowalski.json', 'utf8')).ep1;
const PAGES = {
  desk1: [L.seed({ episode: 'ep1', scene: 9 })],
  desk1b: [L.seed({ episode: 'ep1', scene: 7 })],
  desk2: [L.seed({ episode: 'ep2', scene: 10 })],
  desk2b: [L.seed({ episode: 'ep2', scene: 6 })],
  court: [{ version: 5, savedAt: Date.now(), label: 'x', progress: court }],
  depo: [L.seed({ episode: 'ep1', scene: 10 }), /^(開始錄取|Start the deposition|Begin|Start)/],
  nego: [L.seed({ episode: 'ep1', scene: 11 }), /^(坐下|Sit down|Take a seat|Sit)/],
  voir: [L.seed({ episode: 'ep1', scene: 15 }), /^(開始遴選|Begin|Start)/],
  closing: [L.seed({ episode: 'ep1', scene: 26 })],
  depo2: [L.seed({ episode: 'ep2', scene: 9 }), /^(開始錄取|Start the deposition|Begin|Start)/],
  medi2: [L.seed({ episode: 'ep2', scene: 12 }), /^(坐下|Sit down|Take a seat|Sit)/],
  voir2: [L.seed({ episode: 'ep2', scene: 15 }), /^(開始遴選|Begin|Start)/],
};
const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(PAGES);
const sizes = (process.argv[2] || '360').split(',').map((x) => (x === 'p7' ? 'p7' : +x));
const combos = [['en', 1], ['en', 1.25], ['en', 1.5], ['zh', 1], ['zh', 1.25], ['zh', 1.5]];
const out = [];

async function measure(page) {
  return page.evaluate((NAMES) => {
    const head = [...document.querySelectorAll('header.taskbar, header.bench, header.trialbar')].find((h) => h.getBoundingClientRect().height > 0);
    const tgE = document.querySelector('.menu-toggle');
    if (!head || !tgE) return { head: null };
    const tg = tgE.getBoundingClientRect();
    let minGap = Infinity, worst = '';
    const ell = [], clip = [];
    for (const el of [head, ...head.querySelectorAll('*')]) {
      const cs = getComputedStyle(el);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) ell.push(el.className);
      if ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && /hidden|clip/.test(cs.overflow)) clip.push(el.className + ' ' + el.scrollWidth + '/' + el.clientWidth);
    }
    const rg = document.createRange();
    const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      for (let i = 0; i < n.length; i++) {
        if (!n.textContent[i].trim()) continue;
        rg.setStart(n, i); rg.setEnd(n, i + 1);
        const r = [...rg.getClientRects()].find((x) => x.width > 0);
        if (!r || r.bottom <= tg.top || r.top >= tg.bottom) continue;
        const gap = tg.left - r.right;
        if (gap < minGap) { minGap = gap; worst = n.textContent.trim().slice(0, 24); }
      }
    }
    // 非文字元件（膠囊、燈）：葉節點方框
    let minBox = Infinity, worstBox = '';
    for (const el of head.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.children.length) continue;
      const cs2 = getComputedStyle(el);
      if (!(el.textContent || '').trim() && cs2.backgroundColor === 'rgba(0, 0, 0, 0)' && !parseFloat(cs2.borderTopWidth) && !parseFloat(cs2.borderLeftWidth)) continue;
      if (r.bottom <= tg.top || r.top >= tg.bottom) continue;
      const gap = tg.left - r.right;
      if (gap < minBox) { minBox = gap; worstBox = '[' + el.className + '] ' + (el.textContent || '').trim().slice(0, 16); }
    }
    // 每個文字區塊的行（逐字方框分行）
    const isInline = (e) => /^inline/.test(getComputedStyle(e).display);
    const blocks = [];
    for (const b of [head, ...head.querySelectorAll('*')]) {
      if (isInline(b) && b !== head && getComputedStyle(b).display !== 'inline-block') continue;
      if (![...b.childNodes].some((x) => (x.nodeType === 3 && x.textContent.trim()) || (x.nodeType === 1 && isInline(x) && x.textContent.trim()))) continue;
      const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: (x) => { let p = x.parentElement; while (p && p !== b) { if (!isInline(p) || getComputedStyle(p).display === 'inline-block') return NodeFilter.FILTER_REJECT; p = p.parentElement; } return NodeFilter.FILTER_ACCEPT; } });
      const lines = []; let prev = null, m;
      while ((m = tw.nextNode())) for (let i = 0; i < m.length; i++) {
        rg.setStart(m, i); rg.setEnd(m, i + 1);
        const r = [...rg.getClientRects()].find((x) => x.width > 0);
        if (!r) { if (lines.length) lines[lines.length - 1] += m.textContent[i]; continue; }
        if (prev === null || r.top > prev + r.height * 0.6) lines.push('');
        prev = r.top; lines[lines.length - 1] += m.textContent[i];
      }
      if (lines.length) blocks.push({ cls: (typeof b.className === 'string' ? b.className : '') || b.tagName, lines, w: Math.round(b.getBoundingClientRect().width) });
    }
    // 檢查：中文詞中斷（Segmenter）、英文單字中斷、最後一行太短
    const seg = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
    const HAN = /\p{Script=Han}/u;
    const bad = [];
    for (const bl of blocks) {
      if (bl.lines.length < 2) continue;
      const s = bl.lines.join('');
      const ks = []; let acc = 0;
      for (const l of bl.lines.slice(0, -1)) { acc += l.length; ks.push(acc); }
      for (const k of ks) {
        const a = s[k - 1], z = s[k];
        if (/[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(z)) bad.push(`midWordEn ${bl.cls}: ${s.slice(Math.max(0, k - 8), k)}｜${s.slice(k, k + 8)}`);
      }
      for (const sg of seg.segment(s)) {
        if (!sg.isWordLike || [...sg.segment].length < 2 || !HAN.test(sg.segment)) continue;
        for (const k of ks) if (k > sg.index && k < sg.index + sg.segment.length) bad.push(`midWordZh ${bl.cls}: ${s.slice(Math.max(0, sg.index - 4), k)}｜${s.slice(k, sg.index + sg.segment.length + 3)}`);
      }
      const last = bl.lines[bl.lines.length - 1].trim();
      const letters = [...last].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
      if (HAN.test(last) && letters < 3) bad.push(`shortLastZh ${bl.cls}: …${bl.lines[bl.lines.length - 2].slice(-6)}｜${last}`);
      if (!HAN.test(last) && /^[A-Za-z]+[.,]?$/.test(last) && last.length <= 4) bad.push(`shortLastEn ${bl.cls}: ${last}`);
    }
    const due = head.querySelector('.taskbar > .muted');
    const dueEl = due && (due.querySelector('.due-text') || due);
    let dueB = null;
    if (dueEl) { const L3 = []; let pv = null; const tw3 = document.createTreeWalker(dueEl, NodeFilter.SHOW_TEXT); let q; while ((q = tw3.nextNode())) for (let i = 0; i < q.length; i++) { rg.setStart(q, i); rg.setEnd(q, i + 1); const r = [...rg.getClientRects()].find((x) => x.width > 0); if (!r) { if (L3.length) L3[L3.length - 1] += q.textContent[i]; continue; } if (pv === null || r.top > pv + r.height * 0.6) L3.push(''); pv = r.top; L3[L3.length - 1] += q.textContent[i]; } const dr = dueEl.getBoundingClientRect(); dueB = { lines: L3, sw: dueEl.scrollWidth, cw: dueEl.clientWidth, right: Math.round(dr.right), parentRight: Math.round(due.getBoundingClientRect().right) }; }
    const hr = head.getBoundingClientRect();
    // 第六輪：每個字框和選單鈕的距離（重疊為負）、出頂列／出視窗、.fl-wrap、data-due-row
    const dist = (r) => { const dx = Math.max(tg.left - r.right, r.left - tg.right); const dy = Math.max(tg.top - r.bottom, r.top - tg.bottom); if (dx < 0 && dy < 0) return Math.max(dx, dy); if (dx < 0) return dy; if (dy < 0) return dx; return Math.hypot(dx, dy); };
    let near = Infinity, nearT = '', dueNear = Infinity, dueRect = null; const outs = [];
    const tw6 = document.createTreeWalker(head, NodeFilter.SHOW_TEXT); let q6;
    while ((q6 = tw6.nextNode())) for (let i = 0; i < q6.length; i++) {
      if (!q6.textContent[i].trim()) continue;
      rg.setStart(q6, i); rg.setEnd(q6, i + 1);
      const r = [...rg.getClientRects()].find((x) => x.width > 0); if (!r) continue;
      const d = dist(r); if (d < near) { near = d; nearT = q6.textContent.trim().slice(0, 24); }
      if (dueEl && dueEl.contains(q6)) { dueNear = Math.min(dueNear, d); dueRect = dueRect ? [Math.min(dueRect[0], r.left), Math.min(dueRect[1], r.top), Math.max(dueRect[2], r.right), Math.max(dueRect[3], r.bottom)] : [r.left, r.top, r.right, r.bottom]; }
      if (r.left < Math.max(0, hr.left) - 0.5 || r.right > Math.min(innerWidth, hr.right) + 0.5) outs.push(q6.textContent[i] + '@' + Math.round(r.left) + ',' + Math.round(r.top));
    }
    let nearBox = Infinity, nearBoxT = '';
    for (const el of head.querySelectorAll('*')) {
      if (el.contains(tgE) || tgE.contains(el)) continue;
      const cs7 = getComputedStyle(el); const r = el.getBoundingClientRect(); if (!r.width || !r.height || cs7.visibility === 'hidden') continue;
      const hasBox = (cs7.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs7.backgroundColor !== 'transparent') || parseFloat(cs7.borderTopWidth) > 0 || parseFloat(cs7.borderLeftWidth) > 0 || parseFloat(cs7.borderBottomWidth) > 0;
      if (!hasBox) continue;
      const d = dist(r); if (d < nearBox) { nearBox = d; nearBoxT = (el.className.toString() || el.tagName).slice(0, 30) + ' ' + (el.textContent || '').trim().slice(0, 14); }
    }
    const nameSplit = [];
    for (const bl of blocks) {
      if (bl.lines.length < 2) continue;
      const s0 = bl.lines.join('').replace(/\u00a0/g, ' ');
      const ks = []; let acc = 0; for (const l of bl.lines.slice(0, -1)) { acc += l.length; ks.push(acc); }
      for (const n of NAMES) for (let i = s0.indexOf(n); i >= 0; i = s0.indexOf(n, i + 1)) for (const k of ks) if (k > i && k < i + n.length && !(s0[k - 1] === ' ' && s0.slice(i, k).trim() === n.slice(0, k - i).trim() && false)) nameSplit.push(`${n}: ${s0.slice(i, k)}｜${s0.slice(k, i + n.length)} (${bl.cls})`);
    }
    const v6 = { near: Math.round(near * 10) / 10, nearT, dueNear: dueNear === Infinity ? null : Math.round(dueNear * 10) / 10, dueRect: dueRect && dueRect.map(Math.round), outs: outs.slice(0, 8), nOut: outs.length, flWrap: [...head.querySelectorAll('.fl.fl-wrap')].map((e) => e.textContent.slice(0, 30)), dueRow: head.hasAttribute('data-due-row'), nearBox: Math.round(nearBox * 10) / 10, nearBoxT, nameSplit: [...new Set(nameSplit)], dueDrop: head.style.getPropertyValue('--due-drop') };
    return { v6, head: head.className, minGap: minGap === Infinity ? null : Math.round(minGap * 10) / 10, worst, minBox: minBox === Infinity ? null : Math.round(minBox * 10) / 10, worstBox, ell, clip, bad, due: due ? { lines: dueB.lines, w: Math.round(due.getBoundingClientRect().width), sw: dueB.sw, cw: dueB.cw, right: dueB.right, parentRight: dueB.parentRight } : null, headH: Math.round(hr.height), toggle: [tg.left, tg.top, tg.right, tg.bottom].map(Math.round), docW: document.documentElement.scrollWidth, vw: innerWidth };
  }, NAMES);
}

(async () => {
  for (const size of sizes)
    for (const [lang, sc] of combos)
      for (const name of only) {
        const [seed, intro] = PAGES[name];
        const tag = `tb-${name}-${size}-${lang}-${sc * 100}`;
        try {
          const { ctx, page } = await L.open(size === 390 ? 360 : size, { lang, ls: { 'lawgame-settings': { state: { textScale: sc }, version: 1 }, 'lawgame-ep-auto': seed } });
          if (size === 390) await page.setViewportSize({ width: 390, height: 844 });
          await L.cont(page);
          for (let i = 0; i < 3; i++) {
            await page.waitForTimeout(700);
            const beat = page.locator('.place-beat');
            if (await beat.count()) { await L.press(page, beat, { scroll: false }); await page.waitForTimeout(500); }
            const go = page.getByRole('button', { name: lang === 'en' ? 'Go to court' : '開庭' });
            if (await go.count() && (await go.first().isVisible())) { await L.press(page, go.first()); await page.waitForTimeout(1200); }
            if (intro) {
              const b = page.locator('main button.primary, main button').filter({ hasText: intro });
              if (await b.count() && (await b.first().isVisible())) { await L.press(page, b.first()); await page.waitForTimeout(900); }
            }
          }
          await page.waitForTimeout(400);
          await L.fontsReady(page);
          const m = await measure(page);
          if (!m.head && intro) {
            m.btns = await page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.innerText.trim().slice(0, 30)).slice(0, 6));
          }
          const vp = page.viewportSize();
          const file = await L.shot(page, tag, { clip: { x: 0, y: 0, width: vp.width, height: 180 } });
          const r = { tag, ...m, shot: file };
          out.push(r);
          console.log(JSON.stringify(r));
          await ctx.close();
        } catch (e) {
          console.log(JSON.stringify({ tag, err: String(e).slice(0, 200) }));
        }
      }
  fs.writeFileSync(L.DIR + `/r8-topbar-${sizes.join('')}-${process.argv[4] || 'all'}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
