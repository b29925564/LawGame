// 第 2 集冷開場黑底字卡：node cine.js '<jobs>'  job {size, lang, step, theme, scale}
const L = require('../lib.js');
const fs = require('fs');
const OUT = '/tmp/claude-0/ux-1106b/work3/cine.jsonl';
async function job(j) {
  const save = { episode: j.ep || 'ep2', scene: 0, step: j.step, choices: { 'cold-open': (j.ep === 'ep1' ? { 3: 0, 6: 1 } : { 4: 1 }) }, cards: [], flags: [], ethics: [], scenes: {} };
  const { ctx, page } = await L.open({ size: j.size, lang: j.lang, save, theme: j.theme || 'light', settings: j.scale ? { textScale: j.scale } : undefined });
  await L.tap(page, page.getByRole('button', { name: /^(繼續|Continue)/ }).first());
  await page.locator('.cine .cine-text').waitFor({ timeout: 10000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1) }; };
    const el = document.querySelector('.cine .cine-text');
    const text = el.textContent;
    const lines = []; let cur = ''; let lastTop = null;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const s = n.textContent;
      for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i])) { cur += s[i]; continue; }
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
        const top = Math.round(rg.getBoundingClientRect().top);
        if (lastTop !== null && Math.abs(top - lastTop) > 6) { lines.push(cur); cur = ''; }
        lastTop = top; cur += s[i];
      }
    }
    lines.push(cur);
    const seg = [...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(text)].map((x) => x.index);
    const mt = document.querySelector('.menu-toggle'); const mcs = mt && getComputedStyle(mt);
    return { vw: document.documentElement.clientWidth, text: r('.cine .cine-text'), time: r('.cine .cine-time'), next: r('.cine .cine-next'),
      timeText: document.querySelector('.cine .cine-time')?.textContent, lines, segIdx: seg, full: text,
      fs: getComputedStyle(el).fontSize, clipped: el.scrollWidth > el.clientWidth + 1, docSW: document.documentElement.scrollWidth,
      menu: mcs ? { bg: mcs.backgroundColor, ink: mcs.color, b: +mt.getBoundingClientRect().bottom.toFixed(1) } : null, scrollH: document.scrollingElement.scrollHeight, clientH: document.scrollingElement.clientHeight, cineScroll: (() => { const c = document.querySelector('.cine'); return c ? [c.scrollHeight, c.clientHeight, getComputedStyle(c).overflowY] : null; })(), cs: getComputedStyle(document.documentElement).colorScheme };
  });
  const res = { ...j, ...m };
  res.textMidOff = +(((m.text.l + m.text.r) / 2) - m.vw / 2).toFixed(2);
  res.timeMidOff = m.time ? +(((m.time.l + m.time.r) / 2) - m.vw / 2).toFixed(2) : null;
  res.nextROff = m.next ? +(m.next.r - m.text.r).toFixed(2) : null;
  res.shot = await L.shot(page, j.tag);
  res.contentTopMinusMenu = m.time && m.menu ? +(m.time.t - m.menu.b).toFixed(1) : null;
  if (j.scrolltest) {
    const vp = page.viewportSize();
    const over = Math.max(m.scrollH - m.clientH, m.cineScroll ? m.cineScroll[0] - m.cineScroll[1] : 0);
    res.over = over;
    if (over > 4) {
      await L.scroll(page, over / 2, { x: vp.width / 2, y: vp.height * 0.6 });
      await page.waitForTimeout(700);
      res.mid = await page.evaluate(() => ({ y: scrollY, cineTop: document.querySelector('.cine')?.scrollTop, time: document.querySelector('.cine .cine-time')?.getBoundingClientRect().top, menuB: document.querySelector('.menu-toggle')?.getBoundingClientRect().bottom, menuPos: getComputedStyle(document.querySelector('.game-menu')).position }));
      res.midShot = await L.shot(page, j.tag + '-mid');
      await page.waitForTimeout(500);
      res.midShot2 = await L.shot(page, j.tag + '-mid2');
    }
    const before = await page.evaluate(() => document.querySelector('.cine .cine-text')?.textContent.slice(0, 20));
    await L.tap(page, page.locator('.cine .cine-next'));
    await page.waitForTimeout(1500);
    res.afterNext = await page.evaluate(() => ({ main: [...document.querySelectorAll('main')].map((m) => m.className).join('+'), text: (document.querySelector('.cine .cine-text') || document.querySelector('main'))?.textContent.slice(0, 30) }));
    res.advanced = res.afterNext.text !== before;
  }
  res.errors = page.errors.slice(0, 3);
  fs.appendFileSync(OUT, JSON.stringify(res) + '\n');
  console.log(j.tag, 'over', res.over, 'gapMenu', res.contentTopMinusMenu, 'scroll', m.scrollH, m.clientH, JSON.stringify(m.cineScroll), res.mid ? JSON.stringify(res.mid) : '', res.afterNext ? 'adv=' + res.advanced + ' ' + JSON.stringify(res.afterNext) : '', 'mid', res.textMidOff, 'time', res.timeMidOff, 'nextR', res.nextROff, 'fs', m.fs, JSON.stringify(m.lines), m.clipped ? 'CLIP' : '', m.docSW > m.vw ? 'OVF' : '', 'menu', m.menu && m.menu.bg, m.cs);
  await ctx.close();
}
(async () => { for (const j of JSON.parse(process.argv[2])) { try { await job(j); } catch (e) { console.log('FAIL', j.tag, e.message.split('\n')[0]); } } await L.close(); })();
