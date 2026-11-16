// 共用：真字型、建 context、讀檔、真實輸入。
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.OUTDIR || '/tmp/gate2-ux-1106b';
const SHOTS = DIR + '/shots';
const CACHE = DIR + '/fontcache';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4189';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function fetchCached(url) {
  const h = crypto.createHash('sha1').update(url).digest('hex');
  const f = path.join(CACHE, h);
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return fs.readFileSync(f);
  execFileSync('curl', ['-sS', '-L', '--max-time', '60', '-A', UA, '-o', f, url]);
  return fs.readFileSync(f);
}

async function routeFonts(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => {
    const url = r.request().url();
    try {
      const body = fetchCached(url);
      const ct = url.includes('googleapis')
        ? 'text/css; charset=utf-8'
        : url.endsWith('.woff2')
          ? 'font/woff2'
          : 'application/octet-stream';
      await r.fulfill({ status: 200, body, headers: { 'content-type': ct, 'access-control-allow-origin': '*' } });
    } catch (e) {
      console.error('font fail', url, e.message);
      await r.abort();
    }
  });
}

const SIZES = {
  d1530: { viewport: { width: 1530, height: 860 } },
  d1440: { viewport: { width: 1440, height: 900 } },
  d1366: { viewport: { width: 1366, height: 768 } },
  d1100: { viewport: { width: 1100, height: 860 } },
  d1920: { viewport: { width: 1920, height: 1080 } },
  // 第 13 輪：大立繪的窄桌機邊界和 2x
  d1360: { viewport: { width: 1360, height: 768 } },
  d1280: { viewport: { width: 1280, height: 800 } },
  d1360x2: { viewport: { width: 1360, height: 768 }, deviceScaleFactor: 2 },
  d1366x2: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 },
  d1440x2: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  d1920x2: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
  d1280x2: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  // 第 14 輪：#346 大立繪放大
  d1600: { viewport: { width: 1600, height: 900 } },
  d2560: { viewport: { width: 2560, height: 1440 } },
  d1600x2: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 },
  d2560x2: { viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2 },
  p7: { ...devices['Pixel 7'] },
  m360: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m320: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m412: { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m360t: { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

let browser;
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  return browser;
}

/**
 * opts: size, lang ('zh'|'en'), save (progress obj or null), settings (partial), theme ('light'|'dark'),
 * reduced (bool), initScript (extra fn src)
 */
async function open(opts) {
  const b = await getBrowser();
  const sz = SIZES[opts.size];
  const ctx = await b.newContext({
    ...sz,
    colorScheme: opts.theme === 'dark' ? 'dark' : 'light',
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
  });
  await routeFonts(ctx);
  const seed = {
    save: opts.save
      ? JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: opts.save })
      : null,
    lang: opts.lang === 'en' ? 'en' : null,
    settings: opts.settings ? JSON.stringify({ state: opts.settings, version: 1 }) : null,
    // 第 10 輪：片頭預設會播。除了專門測片頭的腳本（opts.intro），一律關掉片頭（和 e2e 一樣用 rd.dev.intro=0），讀檔進場的畫面才和以前相同。
    extra: { ...(opts.intro ? {} : { 'rd.dev.intro': '0' }), ...(opts.extraLS || {}) },
  };
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (s.save) localStorage.setItem('lawgame-ep-auto', s.save);
    if (s.lang) localStorage.setItem('lawgame-lang', s.lang);
    if (s.settings) localStorage.setItem('lawgame-settings', s.settings);
    for (const [k, v] of Object.entries(s.extra)) localStorage.setItem(k, v);
  }, seed);
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.errors = errors;
  page.mobile = !!sz.isMobile;
  await page.goto(BASE + '/');
  return { ctx, page };
}

async function fontsOk(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const out = {};
    for (const f of document.fonts) {
      if (f.status !== 'loaded') continue;
      out[f.family.replace(/"/g, '')] = (out[f.family.replace(/"/g, '')] || 0) + 1;
    }
    return out;
  });
}

/** 真實點擊：桌機 mouse move/down/up；手機 touchscreen.tap。元素要已在畫面內。 */
async function tap(page, loc, { pos } = {}) {
  const l = typeof loc === 'string' ? page.locator(loc).first() : loc;
  await l.waitFor({ state: 'visible', timeout: 15000 });
  let box = await l.boundingBox();
  const vp = page.viewportSize();
  // 不在畫面內：用滾輪／觸控拖曳捲過去
  for (let k = 0; k < 20 && box && (box.y + box.height / 2 > vp.height - 4 || box.y + box.height / 2 < 4); k++) {
    const dy = box.y + box.height / 2 - vp.height / 2;
    await scroll(page, dy);
    await page.waitForTimeout(250);
    box = await l.boundingBox();
  }
  // 被黏性標題等蓋住：捲到畫面中間
  for (let k = 0; k < 6 && box; k++) {
    const hit = await l.evaluate((el, p) => { const e = document.elementFromPoint(p.x, p.y); return !!e && (el === e || el.contains(e)); }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    if (hit) break;
    await scroll(page, box.y + box.height / 2 - vp.height / 2);
    await page.waitForTimeout(400);
    box = await l.boundingBox();
  }
  if (!box) throw new Error('no box');
  const x = box.x + (pos ? pos.x : box.width / 2);
  const y = box.y + (pos ? pos.y : box.height / 2);
  if (page.mobile) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
  }
  return { x, y };
}

async function scroll(page, dy, at) {
  const vp = page.viewportSize();
  const cx = at ? at.x : vp.width / 2;
  const cy = at ? at.y : vp.height / 2;
  if (!page.mobile) {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, dy);
    return;
  }
  const cdp = page._cdp || (page._cdp = await page.context().newCDPSession(page));
  // 拖曳：手指往上 = 內容往下捲
  let remain = dy;
  while (Math.abs(remain) > 1) {
    const step = Math.max(-vp.height * 0.6, Math.min(vp.height * 0.6, remain));
    const y0 = cy + step / 2;
    const y1 = cy - step / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: y0 }] });
    const n = 8;
    for (let i = 1; i <= n; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: cx, y: y0 + ((y1 - y0) * i) / n }],
      });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    remain -= step;
    await page.waitForTimeout(120);
  }
}

async function shot(page, name, opts = {}) {
  const p = `${SHOTS}/${process.env.PREFIX || 'b-'}${name}.png`;
  await page.screenshot({ path: p, ...opts });
  return path.basename(p);
}

/** 共用檢查：橫向溢出、省略號、子容器多的捲軸。 */
async function audit(page, root = 'body') {
  return page.evaluate((root) => {
    const R = document.querySelector(root) || document.body;
    const out = { docSW: document.documentElement.scrollWidth, vw: innerWidth, ellipsis: [], overflowX: [], clippedText: [] };
    for (const el of R.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
        out.ellipsis.push((el.className || el.tagName) + ':' + el.textContent.slice(0, 40));
      if (/…/.test([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')))
        out.ellipsis.push('char…:' + (el.className || el.tagName) + ':' + el.textContent.slice(0, 50));
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1)
        out.overflowX.push((el.className || el.tagName) + ` ${el.scrollWidth}>${el.clientWidth}`);
      if (cs.overflow === 'hidden' && el.children.length === 0 && el.textContent.trim() &&
        (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2))
        out.clippedText.push((el.className || el.tagName) + ` ${el.scrollWidth}/${el.clientWidth} ${el.scrollHeight}/${el.clientHeight}:` + el.textContent.slice(0, 30));
    }
    out.ellipsis = out.ellipsis.slice(0, 10);
    out.overflowX = out.overflowX.slice(0, 10);
    out.clippedText = out.clippedText.slice(0, 10);
    return out;
  }, root);
}

module.exports = { open, tap, scroll, shot, audit, fontsOk, getBrowser, SIZES, DIR, SHOTS, BASE,
  close: async () => browser && (await browser.close()) };
