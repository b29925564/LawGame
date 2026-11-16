// 共用工具：真字型、真輸入（滑鼠／觸控）、量測。只讀 DOM，不改狀態。
const { chromium, devices } = require('playwright');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.OUTDIR || '/tmp/gate2-ux-1106c';
const SHOTS = path.join(DIR, 'shots');
const CACHE = path.join(DIR, 'fontcache');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4189';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function curl(url, out) {
  return new Promise((res, rej) =>
    execFile('curl', ['-sS', '-m', '60', '-A', UA, '-o', out, url], (err) =>
      err ? rej(err) : res(),
    ),
  );
}
const inflight = new Map();
async function fetchCached(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE, key);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file);
  if (!inflight.has(url))
    inflight.set(
      url,
      (async () => {
        for (let i = 0; i < 3; i++) {
          try {
            await curl(url, file + '.tmp');
            fs.renameSync(file + '.tmp', file);
            return;
          } catch (e) {
            if (i === 2) throw e;
          }
        }
      })(),
    );
  await inflight.get(url);
  return fs.readFileSync(file);
}

async function fonts(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    const url = route.request().url();
    try {
      const body = await fetchCached(url);
      const css = url.includes('googleapis');
      await route.fulfill({
        status: 200,
        body,
        headers: {
          'content-type': css ? 'text/css; charset=utf-8' : 'font/woff2',
          'access-control-allow-origin': '*',
        },
      });
    } catch (e) {
      await route.abort();
    }
  });
}

const SIZES = {
  1530: { viewport: { width: 1530, height: 860 } },
  1440: { viewport: { width: 1440, height: 900 } },
  1100: { viewport: { width: 1100, height: 860 } },
  1920: { viewport: { width: 1920, height: 1080 } },
  p7: { ...devices['Pixel 7'] },
  360: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  '360l': { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  '1440h': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2.625 },
  '1440d2': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  '412h': { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3.5 },
  412: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 },
  320: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

let browser;
async function open(size, { lang = 'zh', scheme = 'dark', rm = false, ls = {}, url = '/', clock } = {}) {
  if (!browser) browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const opts = { ...SIZES[size] };
  delete opts.defaultBrowserType;
  const ctx = await browser.newContext({ ...opts, colorScheme: scheme, reducedMotion: rm ? 'reduce' : 'no-preference' });
  await fonts(ctx);
  const store = { 'lawgame-lang': lang, ...(process.env.NOINTRO === '1' ? { 'rd.dev.intro': '0' } : {}), ...ls };
  await ctx.addInitScript((store) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(store))
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, store);
  const page = await ctx.newPage();
  page.mobile = !!opts.isMobile;
  page.size = size;
  if (process.env.CONSOLELOG) {
    const log = (k, t) => { try { fs.appendFileSync(process.env.CONSOLELOG, JSON.stringify({ k, size, url: page.url().replace(/^https?:\/\/[^/]+/, ''), t: String(t).slice(0, 400) }) + '\n'); } catch {} };
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log(m.type(), m.text()); });
    page.on('pageerror', (e) => log('pageerror', e.message));
    page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (!/ERR_ABORTED/.test(f)) log('reqfail', r.url().replace(/^https?:\/\/[^/]+/, '') + ' ' + f); });
    page.on('response', (r) => { if (r.status() >= 400) log('http' + r.status(), r.url().replace(/^https?:\/\/[^/]+/, '')); });
  }
  if (clock) await clock(page);
  await page.goto(BASE + url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await fontsReady(page);
  return { ctx, page };
}

async function fontsReady(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}
async function fontReport(page) {
  return page.evaluate(() => {
    const out = {};
    for (const f of document.fonts) {
      const k = f.family.replace(/"/g, '');
      out[k] = out[k] || { loaded: 0, other: 0 };
      if (f.status === 'loaded') out[k].loaded++;
      else out[k].other++;
    }
    return out;
  });
}

let cdp = new WeakMap();
async function session(page) {
  if (!cdp.has(page)) cdp.set(page, await page.context().newCDPSession(page));
  return cdp.get(page);
}

/** 把元素帶進視窗：桌機滾輪、手機拖曳。 */
async function bring(page, loc) {
  for (let i = 0; i < 25; i++) {
    const b = await loc.boundingBox();
    if (!b) return null;
    const vp = page.viewportSize();
    const cy = b.y + b.height / 2;
    if (cy > 8 && cy < vp.height - 8 && b.y >= -1 && b.y + Math.min(b.height, vp.height * 0.8) <= vp.height + 1)
      return b;
    const want = vp.height * 0.45;
    let dy = cy - want;
    dy = Math.max(-vp.height * 0.6, Math.min(vp.height * 0.6, dy));
    if (page.mobile) await swipe(page, vp.width / 2, vp.height / 2, -dy, b);
    else {
      const x = Math.max(4, Math.min(vp.width - 4, b.x + b.width / 2));
      await page.mouse.move(x, Math.max(4, Math.min(vp.height - 4, vp.height / 2)));
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(250);
    }
  }
  return loc.boundingBox();
}

/** 手機拖曳：手指往 dy 方向移（dy<0 往上推＝內容往下捲）。 */
async function swipe(page, x, y, dy, target) {
  const s = await session(page);
  const vp = page.viewportSize();
  let x0 = x;
  if (target) x0 = Math.max(10, Math.min(vp.width - 10, target.x + 8));
  let y0 = dy < 0 ? vp.height * 0.75 : vp.height * 0.25;
  const steps = 8;
  const pt = (yy) => [{ x: x0, y: yy, id: 1 }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y0) });
  for (let i = 1; i <= steps; i++)
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y0 + (dy * i) / steps) });
  await page.waitForTimeout(30);
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(450);
}

/** 拖曳某一點（手機內層捲動用）。 */
async function dragAt(page, x, y, dy) {
  const s = await session(page);
  const steps = 8;
  const pt = (yy) => [{ x, y: yy, id: 1 }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y) });
  for (let i = 1; i <= steps; i++)
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y + (dy * i) / steps) });
  await page.waitForTimeout(30);
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(450);
}

/** 真點擊：桌機 move/down/up，手機 tap。 */
async function press(page, loc, { scroll = true, timeout = 8000 } = {}) {
  await loc.waitFor({ state: 'visible', timeout });
  const b = scroll ? await bring(page, loc) : await loc.boundingBox();
  if (!b) throw new Error('no box');
  const x = b.x + b.width / 2;
  const y = b.y + Math.min(b.height / 2, 20);
  if (page.mobile) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.down();
    await page.mouse.up();
  }
  await page.waitForTimeout(120);
}
async function pressXY(page, x, y) {
  if (page.mobile) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.down();
    await page.mouse.up();
  }
  await page.waitForTimeout(120);
}

async function shot(page, name, opts = {}) {
  const pre = process.env.PREFIX || 'c-';
  const file = path.join(SHOTS, pre + name + '.png');
  await page.screenshot({ path: file, ...opts });
  return pre + name + '.png';
}

/** 頁面通用檢查：水平溢出、省略號、子容器多出水平捲軸、被切的字。 */
async function audit(page, root = 'body') {
  return page.evaluate((root) => {
    const R = document.querySelector(root) || document.body;
    const vw = document.documentElement.clientWidth;
    const out = {
      vw,
      docScrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      ellipsis: [],
      hScroll: [],
      offRight: [],
      clipped: [],
    };
    const vis = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const name = (el) =>
      el.tagName.toLowerCase() +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '') +
      ' "' + (el.innerText || '').trim().slice(0, 30).replace(/\n/g, '/') + '"';
    for (const el of R.querySelectorAll('*')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (el.closest('.sr-only, [aria-hidden="true"] .sr-only, .measure')) continue;
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.ellipsis.push(name(el));
      if ((el.innerText || '').includes('…') && el.children.length === 0) out.ellipsis.push('char… ' + name(el));
      if (['auto', 'scroll'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.tagName !== 'HTML' && el.tagName !== 'BODY')
        out.hScroll.push(name(el) + ` ${el.scrollWidth}>${el.clientWidth}`);
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && cs.position !== 'fixed' && !el.closest('[aria-hidden="true"]')) {
        // 只報有字的葉節點
        if (el.children.length === 0 && (el.innerText || '').trim()) out.offRight.push(name(el) + ` right=${Math.round(r.right)}`);
      }
      if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
        if (el.children.length === 0 && (el.innerText || '').trim() && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && !el.closest('.sr-only'))
          out.clipped.push(name(el) + ` sw${el.scrollWidth}/${el.clientWidth} sh${el.scrollHeight}/${el.clientHeight}`);
      }
    }
    out.ellipsis = [...new Set(out.ellipsis)].slice(0, 15);
    out.hScroll = out.hScroll.slice(0, 15);
    out.offRight = out.offRight.slice(0, 15);
    out.clipped = out.clipped.slice(0, 15);
    return out;
  }, root);
}

/** 按鈕內圖示／字置中偏差。 */
async function centering(page, sel) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(b);
        const c = range.getBoundingClientRect();
        const icon = b.querySelector('svg, img, i');
        const ir = icon ? icon.getBoundingClientRect() : c;
        return {
          t: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 20),
          dx: +((ir.left + ir.width / 2) - (r.left + r.width / 2)).toFixed(1),
          dy: +((ir.top + ir.height / 2) - (r.top + r.height / 2)).toFixed(1),
        };
      });
  }, sel);
}

function seed({ episode = 'ep1', scene = 0, step = 0, choices = {}, cards = [], flags = [], ethics = [], scenes = {}, label = 'x' } = {}) {
  return {
    version: 5,
    savedAt: Date.now(),
    label,
    progress: { episode, scene, step, choices, cards, flags, ethics, scenes },
  };
}

async function cont(page) {
  await press(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
  await page.waitForTimeout(600);
  await fontsReady(page);
}

/** 文字排版：.kw 被拆行、最後一行孤字、中文在詞中間斷（Intl.Segmenter）。只讀。 */
async function textAudit(page, root = 'body') {
  return page.evaluate((root) => {
    const R = document.querySelector(root) || document.body;
    const HAN = /\p{Script=Han}/u;
    const seg = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
    const isInline = (e) => /^inline/.test(getComputedStyle(e).display) || getComputedStyle(e).display === 'contents';
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'; };
    const out = { blocks: 0, orphans: [], kwSplit: [], midWord: [], midWordCount: 0 };
    const leafBlocks = [...R.querySelectorAll('*')].filter((e) => !isInline(e) && vis(e) && !e.closest('.sr-only,[aria-hidden="true"],.measure,svg') && [...e.childNodes].some((n) => n.nodeType === 3 && HAN.test(n.textContent)));
    for (const b of leafBlocks) {
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { let p = n.parentElement; while (p && p !== b) { if (!isInline(p) || getComputedStyle(p).display === 'inline-block' || p.matches('.sr-only,[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT; p = p.parentElement; } return NodeFilter.FILTER_ACCEPT; } });
      const chars = []; let n;
      const rg = document.createRange();
      while ((n = walker.nextNode())) {
        const t = n.textContent;
        for (let i = 0; i < t.length; i++) {
          rg.setStart(n, i); rg.setEnd(n, i + 1);
          const r = [...rg.getClientRects()].find((x) => x.width > 0);
          if (!r) { chars.push({ c: t[i], top: null }); continue; }
          chars.push({ c: t[i], top: r.top, h: r.height });
        }
      }
      if (!chars.length) continue;
      out.blocks++;
      let s = '', breaks = [], prevTop = null, lines = [''];
      chars.forEach((x, i) => {
        if (x.top !== null && prevTop !== null && x.top > prevTop + x.h * 0.6) { breaks.push(s.length); lines.push(''); }
        if (x.top !== null) prevTop = x.top;
        s += x.c; lines[lines.length - 1] += x.c;
      });
      const name = (b.className && typeof b.className === 'string' ? b.className.split(' ')[0] : b.tagName.toLowerCase());
      if (lines.length > 1) {
        const last = lines[lines.length - 1].trim();
        const letters = [...last].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
        if (letters === 1 && HAN.test(last)) out.orphans.push(`${name}: …${lines[lines.length - 2].slice(-6)}｜${last}`);
      }
      for (const sg of seg.segment(s)) {
        if (!sg.isWordLike || [...sg.segment].length < 2 || !HAN.test(sg.segment)) continue;
        const a = sg.index, z = sg.index + sg.segment.length;
        for (const k of breaks) if (k > a && k < z) { out.midWordCount++; if (out.midWord.length < 12) out.midWord.push(`${name}: ${s.slice(Math.max(0, a - 4), k)}｜${s.slice(k, z + 3)}`); }
      }
    }
    for (const k of R.querySelectorAll('.kw')) {
      if (!vis(k)) continue;
      const rects = [...k.getClientRects()].filter((r) => r.width > 0);
      if (rects.length > 1) { const pw = k.parentElement.getBoundingClientRect().width; const w = k.scrollWidth; out.kwSplit.push(`${k.textContent.slice(0, 16)} rects${rects.length} parentW${Math.round(pw)}`); }
    }
    out.orphans = out.orphans.slice(0, 12); out.kwSplit = out.kwSplit.slice(0, 12);
    return out;
  }, root);
}

module.exports = { textAudit, open, press, pressXY, shot, audit, centering, seed, cont, bring, swipe, dragAt, fontsReady, fontReport, session, SHOTS, DIR: process.env.OUTDIR || DIR, close: async () => browser && browser.close() };
