// 共用：真字型、開瀏覽器、讀檔進場、真實輸入。
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.OUTDIR || '/tmp/gate2-ux-1106a';
const SHOTS = DIR + '/shots';
const CACHE = DIR + '/fontcache';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4189';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function fetchCached(url) {
  const key = crypto.createHash('md5').update(url).digest('hex');
  const f = path.join(CACHE, key);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const buf = execFileSync('curl', ['-sS', '-L', '-A', UA, url], { maxBuffer: 64 << 20 });
  fs.writeFileSync(f, buf);
  return buf;
}

async function routeFonts(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => {
    const url = r.request().url();
    try {
      const body = fetchCached(url);
      const css = url.includes('googleapis');
      await r.fulfill({
        status: 200,
        body,
        headers: {
          'content-type': css ? 'text/css; charset=utf-8' : 'font/woff2',
          'access-control-allow-origin': '*',
        },
      });
    } catch (e) {
      console.error('font fail', url, e.message);
      await r.abort();
    }
  });
}

const SIZES = {
  d1530: { viewport: { width: 1530, height: 860 } },
  d1440: { viewport: { width: 1440, height: 900 } },
  d1100: { viewport: { width: 1100, height: 860 } },
  d1920: { viewport: { width: 1920, height: 1080 } },
  d1280: { viewport: { width: 1280, height: 800 } },
  d1366: { viewport: { width: 1366, height: 768 } },
  p7: { ...devices['Pixel 7'] },
  m360: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m320: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  p7l: { ...devices['Pixel 7 landscape'] },
  m740l: { viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m844l: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  m412: { viewport: { width: 412, height: 870 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  i412: { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.625 },
  i360: { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  d1440r: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  d1100x: { viewport: { width: 1100, height: 760 } },
  d1280s: { viewport: { width: 1280, height: 720 } },
  d1100s: { viewport: { width: 1100, height: 700 } },
  d1360: { viewport: { width: 1360, height: 768 } },
  d1359: { viewport: { width: 1359, height: 768 } },
  d1360r: { viewport: { width: 1360, height: 768 }, deviceScaleFactor: 2 },
  d1366r: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 },
  d1920r: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
  d1280r: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  d1600: { viewport: { width: 1600, height: 900 } },
  d2560: { viewport: { width: 2560, height: 1440 } },
  d1600r: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 },
  d2560r: { viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2 },
};

let browser;
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  return browser;
}

/** opts: size, scheme, reduced, init(localStorage seed fn args) */
async function newPage(size, { scheme = 'dark', reduced = 'no-preference', seed, dsf } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ ...SIZES[size], ...(dsf ? { deviceScaleFactor: dsf } : {}), colorScheme: scheme, reducedMotion: reduced });
  await routeFonts(ctx);
  if (seed)
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }, seed);
  const page = await ctx.newPage();
  page.__size = size;
  page.__touch = !!SIZES[size].hasTouch;
  return page;
}

function save(progress) {
  return JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress });
}

function seedObj({ lang = 'zh', progress, settings = {} }) {
  const s = { 'lawgame-ep-auto': save(progress) };
  if (lang === 'en') s['lawgame-lang'] = 'en';
  else s['lawgame-lang'] = 'zh';
  s['lawgame-settings'] = JSON.stringify({ state: settings, version: 1 });
  // 第十輪：片頭預設會播；回歸掃描用 rd.dev.intro=0 關掉（e2e 也是這樣），報告寫明。
  if (process.env.NOINTRO) s['rd.dev.intro'] = '0';
  return s;
}

async function fontsOk(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const fams = {};
    for (const f of document.fonts) {
      const k = f.family.replace(/"/g, '');
      fams[k] = fams[k] || {};
      fams[k][f.status] = (fams[k][f.status] || 0) + 1;
    }
    return fams;
  });
}

/** 真點：滑鼠或觸控，點元素中心。 */
async function tap(page, locator) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const bb = await el.boundingBox();
  if (!bb) throw new Error('no box for ' + locator);
  const x = bb.x + bb.width / 2,
    y = bb.y + bb.height / 2;
  if (page.__touch) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  }
}
async function tapXY(page, x, y) {
  if (page.__touch) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  }
}

async function touchDrag(page, x, y0, y1, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function shot(page, name, opts = {}) {
  const p = `${SHOTS}/${process.env.SHOTPFX || "a-"}${process.env.PFX || ""}${name}.png`;
  await page.screenshot({ path: p, ...opts });
  return path.basename(p);
}

/** 通用檢查：橫向溢出、省略號、子容器多出橫捲軸。 */
async function generic(page) {
  return page.evaluate(() => {
    const out = { docOverflow: document.documentElement.scrollWidth - innerWidth, ellipsis: [], hscroll: [] };
    for (const e of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)
        out.ellipsis.push((e.className + '').slice(0, 40) + ':' + e.textContent.slice(0, 30));
      if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1)
        out.hscroll.push((e.className + '').slice(0, 40) + ` ${e.scrollWidth}>${e.clientWidth}`);
      if (/…/.test(e.childNodes.length === 1 && e.firstChild.nodeType === 3 ? e.textContent : ''))
        out.ellipsis.push('char…:' + (e.className + '').slice(0, 30) + ':' + e.textContent.slice(0, 40));
    }
    return out;
  });
}

/** 從截圖量某區域的平均亮度（相對亮度）。 */
async function lum(page, clip) {
  const buf = await page.screenshot({ clip });
  return buf;
}

module.exports = {
  DIR, SHOTS, BASE, SIZES, getBrowser, newPage, save, seedObj, fontsOk, tap, tapXY, touchDrag, shot, generic,
  close: async () => browser && (await browser.close()),
};

/** 在頁面裡用：取元素的每一行文字（依字元的 top 分組）。 */
const LINES_FN = `(el) => {
  const out = []; let cur = null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    for (let i = 0; i < n.length; i++) {
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      const rc = r.getClientRects()[0]; if (!rc) continue;
      const top = Math.round(rc.top);
      if (!cur || Math.abs(top - cur.top) > rc.height * 0.5) { cur = { top, text: '' , right: rc.right, left: rc.left}; out.push(cur); }
      cur.text += n.data[i]; cur.right = Math.max(cur.right, rc.right);
    }
  }
  return out.map(l => ({ text: l.text, left: Math.round(l.left), right: Math.round(l.right) }));
}`;

/** 頁面裡所有看得到、用到黃（--hl 系）的元素。 */
const YELLOW_FN = `() => {
  const Y = [/rgba?\\(244, 197, 61/, /rgba?\\(255, 208, 46/, /rgba?\\(127, 90, 0/];
  const isY = (v) => v && Y.some((y) => y.test(v));
  const hits = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(e, pseudo);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
      const props = ['color','backgroundColor','borderTopColor','borderLeftColor','borderBottomColor','outlineColor','boxShadow','textShadow','fill','stroke','backgroundImage','textDecorationColor'];
      for (const p of props) {
        const v = cs[p];
        if (!isY(v)) continue;
        if (p === 'color' && !e.textContent.trim() && !pseudo) continue;
        if (p.startsWith('border') && parseFloat(cs[p.replace('Color','Width')]) === 0) continue;
        if (p === 'outlineColor' && (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0)) continue;
        if (p === 'textDecorationColor' && cs.textDecorationLine === 'none') continue;
        hits.push((e.tagName + '.' + (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)).slice(0, 60) + (pseudo || '') + ' ' + p + '=' + v.slice(0, 40));
      }
    }
  }
  return [...new Set(hits)];
}`;
module.exports.LINES_FN = LINES_FN;
module.exports.YELLOW_FN = YELLOW_FN;
