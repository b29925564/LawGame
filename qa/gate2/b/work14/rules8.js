// v93 最終排字規則（第 7 輪），自己的量法，只讀 DOM。
// R1 不出框（區塊＋外兩層 content box）；選單鈕四周 8px 內沒有字或有框／底色的東西。
// R2 專有名詞不拆（退路 B 只在內部詞界）；房名黏住；12th-floor 不拆；英文短標籤最後一行至少兩個字。
// R3 中文：數詞＋量詞不留行尾、不單獨一行；字卡／手機框／候選人卡每行 ≥3 字；「的了著過地得」不在行首；
//    行尾不放「把在被跟和與對從向沒又」；標點行首行尾禁則。
// R4 譯名只在「・」後面斷。
module.exports = function rules8(N) {
  const LONG = '.transcript, .speech, .narration, .vo-log, .list .row-item, .terms, .credits, .sub-card .tx, .doc-lines';
  const vw = innerWidth;
  const INL = /^(inline|inline-block|inline-flex|inline-grid|contents)$/;
  const isInl = (e) => INL.test(getComputedStyle(e).display);
  const blockOf = (e) => { let x = e; while (x && x !== document.body && isInl(x)) x = x.parentElement; return x; };
  const hidden = (e, allowH) => {
    for (let x = e; x && x !== document.body; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return 'hidden';
      if (x.getAttribute('aria-hidden') === 'true' || x.hasAttribute('inert')) return 'aria';
      const r = x.getBoundingClientRect();
      if (cs.overflow === 'hidden' && (r.width <= 1 || r.height <= 1)) return 'sr';
      if (/inset\(50%\)/.test(cs.clipPath)) return 'sr';
      if (!allowH && /auto|scroll/.test(cs.overflowX) && x.scrollWidth > x.clientWidth + 1) return 'hscroll';
    }
    return null;
  };
  const inner = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const n = (v) => parseFloat(v) || 0;
    return { l: r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft), r: r.right - n(cs.borderRightWidth) - n(cs.paddingRight) }; };
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const path = (e) => { const a = []; for (let x = e; x && x !== document.body && a.length < 4; x = x.parentElement) a.unshift(nm(x)); return a.join('>'); };
  // 祖先裁切框（overflow 非 visible、clip-path inset）交集；回傳 {l,t,r,b,by,scroll}
  const clipOf = (e) => {
    let c = { l: 0, t: 0, r: vw, b: innerHeight, by: 'viewport', scroll: false };
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
      const cs = getComputedStyle(x); const r = x.getBoundingClientRect();
      let k = null;
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') k = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      const mm = /inset\(([\d.]+)px(?: ([\d.]+)px)?(?: ([\d.]+)px)?(?: ([\d.]+)px)?/.exec(cs.clipPath);
      if (mm) { const a = +mm[1], b2 = mm[2] != null ? +mm[2] : a, c2 = mm[3] != null ? +mm[3] : a, d = mm[4] != null ? +mm[4] : b2; const kk = { l: r.left + d, t: r.top + a, r: r.right - b2, b: r.bottom - c2 }; k = k ? { l: Math.max(k.l, kk.l), t: Math.max(k.t, kk.t), r: Math.min(k.r, kk.r), b: Math.min(k.b, kk.b) } : kk; }
      if (k && x !== document.body) { const sc = (/auto|scroll/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 1) || (/auto|scroll/.test(cs.overflowX) && x.scrollWidth > x.clientWidth + 1);
        if (k.t > c.t) { c.t = k.t; c.byT = nm(x); c.scrollT = sc; } if (k.b < c.b) { c.b = k.b; c.byB = nm(x); c.scrollB = sc; } if (k.l > c.l) { c.l = k.l; c.byL = nm(x); c.scrollL = sc; } if (k.r < c.r) { c.r = k.r; c.byR = nm(x); c.scrollR = sc; } }
    }
    return c;
  };
  const REC = [];
  const mt = document.querySelector('.menu-toggle');
  const m = mt && mt.getBoundingClientRect();
  const dist = (r) => Math.hypot(Math.max(m.left - r.right, r.left - m.right, 0), Math.max(m.top - r.bottom, r.top - m.bottom, 0));
  const groups = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.length || !n.parentElement) continue;
    const pe = n.parentElement;
    if (pe.closest('script,style,svg,title,.game-menu')) continue;
    if (hidden(pe, true)) continue;
    const b = blockOf(pe); if (!b) continue;
    if (!groups.has(b)) groups.set(b, []); groups.get(b).push(n);
  }
  const seg = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
  const out = { over: [], menu: [], split: [], room: [], hyph: [], enTail: [], numCl: [], min3: [], startP: [], endP: [], punct: [], tname: [], dump: [], blocks: 0, names: 0 };
  const rg = document.createRange();
  const NUMCL = /(^|[^第])([〇零一二兩三四五六七八九十百千萬\d]+ ?[個台位張份次家間條輛名件本支隻句通天年月週歲樓層頁號])$/;
  const DUMP = '.cand, .cine, .phone, .eyebrow, .place-slate, .act-slate, .court-now, .call, .notif, .shell-head, .actions, .ride-route';
  for (const [b, nodes] of groups) {
    const ch = [];
    for (const n of nodes) for (let i = 0; i < n.length; i++) {
      const c = n.data[i];
      if (/[\s 　]/.test(c)) { ch.push({ c, sp: 1 }); continue; }
      rg.setStart(n, i); rg.setEnd(n, i + 1);
      const q = [...rg.getClientRects()].find((q) => q.width > 0);
      if (!q) { ch.push({ c, sp: 1 }); continue; }
      ch.push({ c, m: (q.top + q.bottom) / 2, t: q.top, b: q.bottom, l: q.left, r: q.right, el: n.parentElement });
    }
    const lines = []; let cur = null;
    ch.forEach((x, i) => {
      if (x.sp) { if (cur) cur.e = i + 1; return; }
      if (!cur || Math.abs(x.m - cur.m) > 6) { cur = { s: i, e: i + 1, m: x.m, l: x.l, r: x.r, t: x.t, b: x.b }; lines.push(cur); }
      else { cur.e = i + 1; cur.l = Math.min(cur.l, x.l); cur.r = Math.max(cur.r, x.r); cur.t = Math.min(cur.t, x.t); cur.b = Math.max(cur.b, x.b); }
    });
    if (!lines.length) continue;
    const text = ch.map((x) => x.c).join('');
    { const cl = clipOf(b); for (const L of lines) { let s0 = L.s; while (ch[s0].sp) s0++; const el = ch[s0].el;
      const v = { l: Math.max(L.l, cl.l), t: Math.max(L.t, cl.t), r: Math.min(L.r, cl.r), b: Math.min(L.b, cl.b) };
      const vis = v.r - v.l > 0.5 && v.b - v.t > 0.5; const whole = vis && v.l <= L.l + 0.5 && v.r >= L.r - 0.5 && v.t <= L.t + 0.5 && v.b >= L.b - 0.5;
      REC.push({ b, el, L, v, vis, whole, cl, text: text.slice(L.s, L.e).replace(/ /g, '·').trim(), sel: path(b) }); } }
    const isLong = !!b.closest(LONG) || nodes.every((n) => n.parentElement.closest(LONG));
    const hscroll = hidden(b, false) === 'hscroll';
    out.blocks++;
    const ltext = (L) => text.slice(L.s, L.e).replace(/ /g, '·').trim();
    const allLines = lines.map(ltext);
    const sel = path(b);
    const zh = /\p{Script=Han}/u.test(text);
    if (b.closest(DUMP)) out.dump.push({ sel, lines: allLines });
    // 選單鈕 8px（字）——長內文也算
    if (m) for (const R of REC.filter((R) => R.b === b && R.vis)) { const L = R.L; const d = dist({ left: R.v.l, right: R.v.r, top: R.v.t, bottom: R.v.b }); if (d < 8 - 0.05) out.menu.push({ what: 'text', sel, line: ltext(L), px: +d.toFixed(1), rect: [L.l, L.t, L.r, L.b].map((v) => +v.toFixed(1)), menu: [m.left, m.top, m.right, m.bottom].map((v) => +v.toFixed(1)) }); }
    if (isLong) continue;
    // R1 不出框
    if (!b.closest('.act-head') && !hscroll) {
      for (const L of lines) {
        let box = b;
        for (let k = 0; box && box !== document.body && k < 3; k++) {
          const c = inner(box);
          const d = Math.max(L.r - c.r, c.l - L.l);
          if (d > 1) { out.over.push({ sel, box: nm(box), level: k, px: +d.toFixed(1), line: ltext(L), lines: allLines }); break; }
          if (/absolute|fixed/.test(getComputedStyle(box).position)) break;
          box = blockOf(box.parentElement);
        }
      }
    }
    const norm = text.replace(/ /g, ' ');
    const lineOf = (i) => lines.findIndex((L) => i >= L.s && i < L.e);
    const crosses = (s, e) => { let prev = null; for (let i = s; i < e; i++) { if (ch[i].sp) continue; const li = lineOf(i); if (prev !== null && li !== prev) return i - s; prev = li; } return -1; };
    // R2 專有名詞
    const used = new Array(norm.length).fill(false);
    const c0 = inner(b);
    for (const name of N.all) {
      for (let s = norm.indexOf(name); s >= 0; s = norm.indexOf(name, s + 1)) {
        if (used.slice(s, s + name.length).some(Boolean)) continue;
        used.fill(true, s, s + name.length);
        out.names++;
        const cut = crosses(s, s + name.length);
        if (cut < 0) continue;
        const el = ch[s].el || b; const cs = getComputedStyle(el);
        const cx = document.createElement('canvas').getContext('2d');
        cx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ('letterSpacing' in cx) cx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
        const nw = cx.measureText(name).width;
        const wide = nw > c0.r - c0.l - 1;
        let ok;
        if (/[A-Za-z]/.test(name)) ok = name[cut - 1] === ' ' || name[cut] === ' ';
        else {
          const bounds = new Set(); let at = 0; for (const sg of seg.segment(name)) { at += sg.segment.length; bounds.add(at); }
          for (const k of N.keepInner) for (let p = name.indexOf(k); p >= 0; p = name.indexOf(k, p + 1)) for (let q = p + 1; q < p + k.length; q++) bounds.delete(q);
          ok = bounds.has(cut);
        }
        if (!(wide && ok)) out.split.push({ sel, name, at: name.slice(0, cut) + '｜' + name.slice(cut), wide, lines: allLines });
      }
    }
    // 房名、數字連字號
    for (const mm of norm.matchAll(/(?:(?:Conference|Mediation) )?Room [A-Z0-9]+\b|Courtroom \d+|會議室 ?[A-Z]|調解室 ?\d+|\d+ ?號法庭/g)) {
      const cut = crosses(mm.index, mm.index + mm[0].length); if (cut >= 0) out.room.push({ sel, at: mm[0].slice(0, cut) + '｜' + mm[0].slice(cut), lines: allLines });
    }
    for (const mm of norm.matchAll(/\d+(?:st|nd|rd|th)?-[A-Za-z]+/g)) {
      const cut = crosses(mm.index, mm.index + mm[0].length); if (cut >= 0) out.hyph.push({ sel, at: mm[0].slice(0, cut) + '｜' + mm[0].slice(cut), lines: allLines });
    }
    if (lines.length > 1 && !zh && /[A-Za-z]/.test(text)) {
      const last = ltext(lines[lines.length - 1]);
      if (last.split(/[\s·]+/).filter((x) => /[A-Za-z0-9]/.test(x)).length < 2) {
        const words = norm.trim().split(/\s+/); const two = words.slice(-2).join(' ');
        const el = ch.filter((x) => !x.sp).slice(-1)[0].el || b; const cs = getComputedStyle(el);
        const cx = document.createElement('canvas').getContext('2d');
        cx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ('letterSpacing' in cx) cx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
        const c1 = inner(b);
        out.enTail.push({ sel, last, two, twoW: +cx.measureText(two).width.toFixed(1), boxW: +(c1.r - c1.l).toFixed(1), lines: allLines });
      }
    }
    // 標點禁則（中英）
    for (let li = 0; li < lines.length; li++) {
      const t = ltext(lines[li]);
      if (li > 0 && /^[，。、；：！？）」』〕》〉…‥・％,.;:!?)\]”’]/.test(t)) out.punct.push({ sel, kind: '行首標點', line: t, lines: allLines });
      if (li < lines.length - 1 && /[（「『〔《〈(\[“‘]$/.test(t)) out.punct.push({ sel, kind: '行尾開括號', line: t, lines: allLines });
    }
    if (zh) {
      const segs = [...seg.segment(norm)];
      const segAt = (i) => segs.find((s) => s.index <= i && i < s.index + s.segment.length);
      for (let li = 0; li < lines.length; li++) {
        const L = lines[li]; const t = ltext(L);
        // 數詞量詞
        if (li < lines.length - 1 && NUMCL.test(t)) out.numCl.push({ sel, line: t, lines: allLines });
        if (/^[〇零一二兩三四五六七八九十百千萬\d]+ ?[個台位張份次家間條輛名件本支隻句通天年月週歲樓層頁號]$/.test(t)) out.numCl.push({ sel, line: t, alone: true, lines: allLines });
        // 每行 ≥3 字（字卡、手機框、候選人卡）
        if (lines.length > 1 && b.closest('.cine, .phone, .cand')) { const n3 = (t.match(/[\p{L}\p{N}]/gu) || []).length; if (n3 < 3) out.min3.push({ sel, line: t, lines: allLines }); }
        // 行首「的了著過地得」
        if (li > 0) { let si = L.s; while (si < L.e && ch[si].sp) si++; const sg = segAt(si); if (sg && sg.index === si && /^[的了著過地得]$/.test(sg.segment)) out.startP.push({ sel, line: t, lines: allLines }); }
        // 行尾介詞連詞否定詞
        if (li < lines.length - 1) { let ei = L.e - 1; while (ei > L.s && ch[ei].sp) ei--; const sg = segAt(ei); if (sg && sg.index + sg.segment.length - 1 === ei && /^[把在被跟和與對從向沒又]$/.test(sg.segment)) out.endP.push({ sel, line: t, lines: allLines }); }
      }
      // R4 譯名只在「・」後斷
      for (let i = 0; i < norm.length; i++) {
        if (norm[i] !== '・') continue;
        if (!/\p{Script=Han}/u.test(norm[i - 1] || '') || !/\p{Script=Han}/u.test(norm[i + 1] || '')) continue;
        if (/第.{1,3}[幕天日集]$/.test(norm.slice(Math.max(0, i - 5), i))) continue;
        let ls = i - 1; while (ls > 0 && /\p{Script=Han}/u.test(norm[ls - 1]) && i - ls < 4) ls--;
        for (const k of N.keepInner) if (norm.slice(i - k.length, i) === k) ls = Math.min(ls, i - k.length);
        let re = i + 2; while (re < norm.length && /\p{Script=Han}/u.test(norm[re]) && re - i - 1 < 3) re++;
        for (const k of N.keepInner) if (norm.slice(i + 1, i + 1 + k.length) === k) re = Math.max(re, i + 1 + k.length);
        // 名字的範圍 [ls, re)；斷點 p（新行第一個字的位置）只能是 i+1
        for (let p = ls + 1; p < re; p++) {
          if (p === i + 1 || ch[p].sp || ch[p - 1].sp) continue;
          if (lineOf(p) !== lineOf(p - 1) && lineOf(p) >= 0 && lineOf(p - 1) >= 0) out.tname.push({ sel, at: norm.slice(ls, p) + '｜' + norm.slice(p, re), lines: allLines });
        }
      }
    }
  }
  // 選單鈕 8px（框、底色）
  if (m) for (const e of document.querySelectorAll('body *')) {
    if (e.closest('.game-menu') || e.contains(mt)) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const border = parseFloat(cs.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor);
    const fill = !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor);
    if (!border && !fill) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.width > vw - 1) continue;
    if (hidden(e, true)) continue;
    const d = dist(r); if (d < 8 - 0.05) out.menu.push({ what: 'box', sel: path(e), px: +d.toFixed(1) });
  }
  // ===== 第 8 輪：被切、重疊、離按鈕 <8px =====
  out.cut = []; out.btn = []; out.overlap = [];
  for (const R of REC) if (R.vis && !R.whole) {
    const side = R.v.t > R.L.t + 0.5 ? 'T' : R.v.b < R.L.b - 0.5 ? 'B' : R.v.l > R.L.l + 0.5 ? 'L' : 'R';
    const cl = R.cl; if (!cl['by' + side] && (side === 'T' || side === 'B')) continue; out.cut.push({ sel: R.sel, line: R.text, side, by: cl['by' + side] || 'viewport', scroll: !!cl['scroll' + side], shown: +((side === 'T' || side === 'B') ? (R.v.b - R.v.t) / (R.L.b - R.L.t) : (R.v.r - R.v.l) / (R.L.r - R.L.l)).toFixed(2) });
  }
  const isVis = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || x.hasAttribute('inert')) return false; } return true; };
  const visRect = (e) => { const r = e.getBoundingClientRect(); const c = clipOf(e.parentElement || e); const v = { l: Math.max(r.left, c.l), t: Math.max(r.top, c.t), r: Math.min(r.right, c.r), b: Math.min(r.bottom, c.b) }; return v.r - v.l > 0.5 && v.b - v.t > 0.5 ? v : null; };
  const d2 = (a, c) => Math.hypot(Math.max(a.l - c.r, c.l - a.r, 0), Math.max(a.t - c.b, c.t - a.b, 0));
  const inter = (a, c) => Math.max(0, Math.min(a.r, c.r) - Math.max(a.l, c.l)) * Math.max(0, Math.min(a.b, c.b) - Math.max(a.t, c.t));
  const framed = (e) => { const cs = getComputedStyle(e); return (parseFloat(cs.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor)) || (parseFloat(cs.borderBottomWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderBottomColor)) || !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor) || cs.boxShadow !== 'none'; };
  const BTN = [...document.querySelectorAll('button, [role=button], a[href]')].filter((e) => !e.closest('.game-menu') && !e.classList.contains('menu-toggle') && isVis(e)).map((e) => {
    if (framed(e)) return { e, v: visRect(e), f: true };
    const rs = REC.filter((R) => R.vis && R.el && e.contains(R.el)); if (!rs.length) return { e, v: null };
    return { e, f: false, v: { l: Math.min(...rs.map((R) => R.v.l)), t: Math.min(...rs.map((R) => R.v.t)), r: Math.max(...rs.map((R) => R.v.r)), b: Math.max(...rs.map((R) => R.v.b)) } };
  }).filter((x) => x.v && x.v.r - x.v.l > 1);
  const BOX = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('.game-menu') || e.matches('button, [role=button], a[href]')) continue;
    const cs = getComputedStyle(e);
    const border = parseFloat(cs.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor) || parseFloat(cs.borderLeftWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderLeftColor);
    const fill = !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor);
    if (!border && !fill) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.width > vw - 1) continue;
    if (!isVis(e)) continue; const v = visRect(e); if (!v) continue; BOX.push({ e, v });
  }
  const lbl = (e) => (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30) || nm(e);
  const seenB = new Set();
  const addB = (k, o) => { const key = k + o.btn + '|' + o.other; if (seenB.has(key)) return; seenB.add(key); out.btn.push(o); };
  for (const B of BTN) {
    for (const R of REC) { if (!R.vis || !R.el || B.e.contains(R.el)) continue; if (R.el.closest('button, [role=button], a[href]')) continue;
      const d = d2(B.v, R.v); if (d < 8 - 0.05) addB('t', { btn: lbl(B.e), bsel: path(B.e), other: 'text:' + R.text.slice(0, 30), osel: R.sel, px: +d.toFixed(1) }); }
    for (const X of BTN) { if (X === B || X.e.contains(B.e) || B.e.contains(X.e)) continue; const d = d2(B.v, X.v); if (d < 8 - 0.05) { const a = lbl(B.e), c = lbl(X.e); if (a < c || a === c) addB('b', { btn: a, bsel: path(B.e), other: 'btn:' + c, osel: path(X.e), px: +d.toFixed(1) }); } }
    for (const X of BOX) { if (X.e.contains(B.e) || B.e.contains(X.e)) continue; const d = d2(B.v, X.v); if (d < 8 - 0.05) addB('x', { btn: lbl(B.e), bsel: path(B.e), other: 'box:' + nm(X.e), osel: path(X.e), px: +d.toFixed(1) }); }
  }
  // 重疊：字和字（不同區塊）、字和按鈕／有框盒子（不是自己的祖先）
  const vr = REC.filter((R) => R.vis);
  const ih = (a, c) => Math.max(0, Math.min(a.b, c.b) - Math.max(a.t, c.t)); const iw = (a, c) => Math.max(0, Math.min(a.r, c.r) - Math.max(a.l, c.l));
  for (let i = 0; i < vr.length; i++) for (let j = i + 1; j < vr.length; j++) { const A = vr[i], C = vr[j]; if (A.b === C.b) continue; const a = inter(A.v, C.v); if (a > 4 && iw(A.v, C.v) > 2 && ih(A.v, C.v) >= 0.35 * Math.min(A.v.b - A.v.t, C.v.b - C.v.t)) out.overlap.push({ a: A.text.slice(0, 30), asel: A.sel, c: C.text.slice(0, 30), csel: C.sel, area: Math.round(a) }); }
  for (const R of vr) { if (!R.el) continue; for (const X of [...BTN.filter((x) => x.f), ...BOX]) { if (X.e.contains(R.el) || R.b.contains(X.e)) continue; const a = inter(R.v, X.v); if (a > 4 && iw(R.v, X.v) > 2 && ih(R.v, X.v) >= 0.35 * (R.v.b - R.v.t)) out.overlap.push({ a: R.text.slice(0, 30), asel: R.sel, c: 'box:' + lbl(X.e), csel: path(X.e), area: Math.round(a) }); } }
  for (let i = 0; i < BTN.length; i++) for (let j = i + 1; j < BTN.length; j++) { const A = BTN[i], C = BTN[j]; if (A.e.contains(C.e) || C.e.contains(A.e)) continue; const a = inter(A.v, C.v); if (a > 4) out.overlap.push({ a: 'btn:' + lbl(A.e), asel: path(A.e), c: 'btn:' + lbl(C.e), csel: path(C.e), area: Math.round(a) }); }
  const mcs = mt && getComputedStyle(mt);
  return { main: [...document.querySelectorAll('main')].map((x) => x.className).join('+'), vw, docSW: document.documentElement.scrollWidth,
    menuBox: m ? { l: +m.left.toFixed(1), t: +m.top.toFixed(1), r: +m.right.toFixed(1), b: +m.bottom.toFixed(1), bg: mcs.backgroundColor } : null, ...out };
};
