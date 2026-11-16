// 4. 全站回歸：標題、讀檔、製作群、設定、桌面、卷宗（法院系統登錄表、證物袋）、證據板、證據抽屜（證據／時間軸／法典）、筆錄、便利貼手寫。
const L = require('./lib');
const fs = require('fs');
const CONF = {
  // 第 3 項：窄手機 320／360 × 125／150 × 中英（深淺交錯）
  N1: [320, 'zh', 'light', 1.25], N2: [320, 'zh', 'dark', 1.5], N3: [320, 'en', 'dark', 1.25], N4: [320, 'en', 'light', 1.5],
  N5: [360, 'zh', 'dark', 1.25], N6: [360, 'zh', 'light', 1.5], N7: [360, 'en', 'light', 1.25], N8: [360, 'en', 'dark', 1.5],
  // 第 4 項：1530／1440／Pixel 7／1100 × 中英 × 深淺
  W1: [1530, 'zh', 'dark', 1], W2: [1530, 'en', 'light', 1], W3: [1440, 'zh', 'light', 1], W4: [1440, 'en', 'dark', 1],
  W5: ['p7', 'zh', 'dark', 1], W6: ['p7', 'en', 'light', 1], W7: [1100, 'zh', 'light', 1], W8: [1100, 'en', 'dark', 1],
};
const CARDS = ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo', 'ethan-accused', 'ethan-ride', 'ethan-message', 'indictment', 'autopsy', 'sophie-home', 'ride-receipt', 'blood-report'];
const out = [];

const kwOver = (page, root) => page.evaluate((root) => {
  const R = document.querySelector(root) || document.body; const out = [];
  for (const k of R.querySelectorAll('.kw')) {
    const r = k.getBoundingClientRect(); if (!r.width) continue;
    let b = k.parentElement; while (b && /^inline/.test(getComputedStyle(b).display)) b = b.parentElement;
    if (!b) continue; const br = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    const right = br.left + b.clientLeft + b.clientWidth - parseFloat(cs.paddingRight), left = br.left + b.clientLeft + parseFloat(cs.paddingLeft);
    if (r.right > right + 1 || r.left < left - 1) out.push(`${k.textContent.slice(0, 20)} ${Math.round(r.left)}..${Math.round(r.right)} box ${Math.round(left)}..${Math.round(right)} in ${b.className.toString().slice(0, 24)}`);
  }
  return out;
}, root);
const slimT = async (page, a, root) => ({ ...slim(a), text: await L.textAudit(page, root), kwOver: await kwOver(page, root) });
const slim = (a) => ({ docW: a.docScrollW, vw: a.vw, ell: a.ellipsis, hs: a.hScroll, off: a.offRight, clip: a.clipped });

async function scrollMid(page, sel) {
  const info = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0);
    // 找自己或祖先裡真的能捲的
    for (const e0 of els) {
      let e = e0;
      while (e && e !== document.documentElement) {
        const cs = getComputedStyle(e);
        if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4) {
          const r = e.getBoundingClientRect();
          return { inner: true, x: r.x + r.width / 2, y: Math.max(r.y, 0) + Math.min(r.height, innerHeight - Math.max(r.y, 0)) / 2, dist: (e.scrollHeight - e.clientHeight) / 2, cls: e.className.toString().slice(0, 40) };
        }
        e = e.parentElement;
      }
    }
    const d = document.documentElement;
    return { inner: false, x: innerWidth / 2, y: innerHeight / 2, dist: (d.scrollHeight - innerHeight) / 2, cls: 'page' };
  }, sel);
  if (info.dist < 4) return info;
  if (page.mobile) {
    let left = info.dist;
    while (left > 2) {
      const step = Math.min(left, page.viewportSize().height * 0.35);
      await L.dragAt(page, info.x, info.y + step / 2, -step);
      left -= step;
    }
  } else {
    await page.mouse.move(info.x, info.y);
    await page.mouse.wheel(0, info.dist);
    await page.waitForTimeout(400);
  }
  return info;
}

async function stickyCheck(page, sel) {
  // 捲到中段後：黏性標題後面透不透、第一項是否被蓋
  return page.evaluate((sel) => {
    const res = [];
    for (const e of document.querySelectorAll(sel + ' *')) {
      const cs = getComputedStyle(e);
      if (cs.position !== 'sticky') continue;
      const r = e.getBoundingClientRect();
      if (!r.height) continue;
      let bg = cs.backgroundColor, a = e;
      res.push({ el: e.className.toString().slice(0, 30), top: Math.round(r.top), h: Math.round(r.height), bg, backdrop: cs.backdropFilter });
    }
    return res.slice(0, 8);
  }, sel);
}

async function tabTo(page, re) {
  const nav = page.getByRole('navigation', { name: /應用程式|Apps/ });
  let b = nav.getByRole('button', { name: re });
  if (!(await b.count()) || !(await b.first().isVisible())) {
    await L.press(page, nav.getByRole('button', { name: /^(更多|More)/ }));
    b = page.getByRole('button', { name: re });
  }
  await L.press(page, b.first());
  await page.waitForTimeout(900);
}

async function run(key) {
  const [size, lang, scheme, scale] = CONF[key];
  const zh = lang === 'zh';
  const tag = `r8-${key}-${size}-${lang}-${scheme}-${scale * 100}`;
  const settings = { state: { textScale: scale }, version: 1 };
  const R = { tag, steps: {} };
  const rec = (k, v) => (R.steps[k] = v);
  // ── 標題、讀檔、製作群、設定 ──
  {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 9, cards: CARDS, label: 'ep1:act3' }) } });
    R.fonts = await L.fontReport(page);
    await L.shot(page, `${tag}-title`);
    rec('title', { ...slim(await L.audit(page)), cen: await L.centering(page, '.title-foot button') });
    await L.press(page, page.getByRole('button', { name: zh ? '讀取存檔' : 'Load game', exact: true }));
    await L.shot(page, `${tag}-title-load`, { fullPage: true });
    rec('load', await slimT(page, await L.audit(page), 'body'));
    await L.press(page, page.getByRole('button', { name: zh ? '讀取存檔' : 'Load game', exact: true }));
    await L.press(page, page.getByRole('button', { name: zh ? '製作群' : 'Credits', exact: true }));
    await page.waitForTimeout(400);
    await L.shot(page, `${tag}-credits`, { fullPage: true });
    rec('credits', await slimT(page, await L.audit(page), 'body'));
    await ctx.close();
  }
  // ── 桌面（第一集審前，讀檔進去）──
  {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 9, cards: CARDS }) } });
    await L.cont(page);
    await page.waitForTimeout(800);
    await L.shot(page, `${tag}-desk`);
    rec('desk', await slimT(page, await L.audit(page), 'main'));
    // 設定（選單 → 選項）
    await L.press(page, page.locator('.menu-toggle'), { scroll: false });
    await L.press(page, page.getByRole('tab', { name: zh ? '選項' : 'Options' }));
    await L.shot(page, `${tag}-settings`);
    rec('settings', { ...slim(await L.audit(page, '.menu-panel')), cen: await L.centering(page, '.menu-panel [role=tab]') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // 卷宗
    try {
      await tabTo(page, /^(卷宗|Case file)/);
      await L.shot(page, `${tag}-docs`);
      rec('docs', await slimT(page, await L.audit(page), 'main'));
      const m = await scrollMid(page, '.shell-body');
      await L.shot(page, `${tag}-docs-mid`);
      rec('docsMid', { scrolled: m, sticky: await stickyCheck(page, 'main') });
    } catch (e) { rec('docs', 'ERR ' + String(e).slice(0, 200)); }
    // 法院系統（案卷登錄表 dk-swipe）
    try {
      await tabTo(page, /^(法院系統|Court system|Court)/);
      await page.waitForTimeout(1200);
      const dk = await page.evaluate(() => {
        const cur = document.querySelector('.docket tr.dk-cur, .docket [aria-current="step"]');
        if (!cur) return null;
        const cells = [...cur.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundSize).filter((s) => s.includes('%'));
        const anim = document.getAnimations().filter((a) => a.animationName === 'dk-swipe').map((a) => a.playState);
        return { bgSizes: [...new Set(cells)], anim, rowText: cur.innerText.slice(0, 40) };
      });
      await L.shot(page, `${tag}-court-system`);
      rec('docket', { dk, ...slim(await L.audit(page)), text: await L.textAudit(page, '.docket'), kwOver: await kwOver(page, '.docket') });
    } catch (e) { rec('docket', 'ERR ' + String(e).slice(0, 200)); }
    // 證據板
    try {
      await tabTo(page, /^(證據板|Board)/);
      await L.shot(page, `${tag}-board`);
      rec('board', await slimT(page, await L.audit(page), 'main'));
      const m = await scrollMid(page, '.board, .shell-body');
      await L.shot(page, `${tag}-board-mid`);
      rec('boardMid', { scrolled: m, sticky: await stickyCheck(page, 'main') });
    } catch (e) { rec('board', 'ERR ' + String(e).slice(0, 200)); }
    // 證據抽屜：證據／時間軸／法典
    try {
      const tab = page.locator('.evidence-tab');
      if (await tab.count() && (await tab.isVisible())) { await L.press(page, tab); await page.waitForTimeout(600); }
      const sheet = page.locator('section.sheet').first();
      await L.shot(page, `${tag}-drawer-cards`);
      rec('drawerCards', await slimT(page, await L.audit(page, 'section.sheet'), 'section.sheet'));
      // 展開一張證物袋（證物袋 dossier.css）
      const bag = page.locator('section.sheet .card.mini').filter({ hasText: zh ? '財物清單' : /Property/ }).first();
      if (await bag.count()) {
        await L.press(page, bag.locator('.mini-btn'));
        await page.waitForTimeout(500);
        await L.shot(page, `${tag}-drawer-bag`);
        rec('bag', { ...slim(await L.audit(page, 'section.sheet')), kwOver: await kwOver(page, 'section.sheet') });
      }
      const m = await scrollMid(page, 'section.sheet .sheet-list, section.sheet');
      await L.shot(page, `${tag}-drawer-cards-mid`);
      rec('drawerMid', { scrolled: m, sticky: await stickyCheck(page, 'section.sheet') });
      for (const [k, re] of [['timeline', /^(時間軸|Timeline)/], ['terms', /^(法典|Legal terms)/]]) {
        const tb = sheet.getByRole('button', { name: re });
        if (!(await tb.count())) { rec('drawer-' + k, 'tab not present here'); continue; }
        await L.press(page, tb);
        await page.waitForTimeout(500);
        await L.shot(page, `${tag}-drawer-${k}`);
        const a = slim(await L.audit(page, 'section.sheet'));
        const mm = await scrollMid(page, 'section.sheet .sheet-list, section.sheet');
        await L.shot(page, `${tag}-drawer-${k}-mid`);
        rec('drawer-' + k, { ...a, text: await L.textAudit(page, 'section.sheet'), kwOver: await kwOver(page, 'section.sheet'), scrolled: mm, sticky: await stickyCheck(page, 'section.sheet') });
      }
    } catch (e) { rec('drawer', 'ERR ' + String(e).slice(0, 200)); }
    await ctx.close();
  }
  // ── 法庭（讀檔：e2e/fixtures/court-kowalski.json）：抽屜的時間軸、法典 ──
  try {
    const court = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/court-kowalski.json', 'utf8')).ep1;
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': { version: 5, savedAt: Date.now(), label: 'x', progress: court } } });
    await L.cont(page);
    const open = page.getByRole('button', { name: zh ? '開庭' : 'Go to court' });
    await open.or(page.locator('.court-cam')).first().waitFor({ timeout: 8000 });
    if (await open.isVisible()) await L.press(page, open);
    await page.waitForTimeout(2000);
    await L.shot(page, `${tag}-court`);
    rec('court', slim(await L.audit(page)));
    const tab = page.locator('.evidence-tab');
    if (await tab.count() && (await tab.isVisible())) { await L.press(page, tab); await page.waitForTimeout(600); }
    const sheet = page.locator('section.sheet').first();
    for (const [k, re] of [['timeline', /^(時間軸|Timeline)/], ['terms', /^(法典|Legal terms)/]]) {
      const tb = sheet.getByRole('button', { name: re });
      if (!(await tb.count())) { rec('court-drawer-' + k, 'tab not present'); continue; }
      await L.press(page, tb);
      await page.waitForTimeout(500);
      await L.shot(page, `${tag}-court-drawer-${k}`);
      const a = slim(await L.audit(page, 'section.sheet'));
      const mm = await scrollMid(page, 'section.sheet .sheet-list, section.sheet');
      await L.shot(page, `${tag}-court-drawer-${k}-mid`);
      rec('court-drawer-' + k, { ...a, text: await L.textAudit(page, 'section.sheet'), kwOver: await kwOver(page, 'section.sheet'), scrolled: mm, sticky: await stickyCheck(page, 'section.sheet') });
    }
    await ctx.close();
  } catch (e) { rec('courtDrawer', 'ERR ' + String(e).slice(0, 200)); }
  // ── 便利貼手寫（會見伊森）──
  try {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 4 }) } });
    await L.cont(page);
    await page.waitForTimeout(3500);
    const st = await page.evaluate(() => {
      const h = document.querySelector('.sticky .hand');
      if (!h) return null;
      const c = [...h.querySelectorAll('.hw-c')];
      const r = h.getBoundingClientRect();
      const lines = new Set(c.map((x) => Math.round(x.getBoundingClientRect().top))).size;
      // 英文斷行：有沒有在字中間斷
      const tops = c.map((x) => [x.textContent, Math.round(x.getBoundingClientRect().top)]);
      const breaks = [];
      for (let i = 1; i < tops.length; i++) if (tops[i][1] > tops[i - 1][1] + 2) breaks.push(tops[i - 1][0] + '|' + tops[i][0]);
      return { text: h.innerText, n: c.length, op: [...new Set(c.map((x) => getComputedStyle(x).opacity))], lines, breaks, sw: h.scrollWidth + '/' + h.clientWidth, w: Math.round(r.width) };
    });
    await L.shot(page, `${tag}-sticky`);
    rec('sticky', st);
    await ctx.close();
  } catch (e) { rec('sticky', 'ERR ' + String(e).slice(0, 200)); }
  // ── 筆錄（定案會議，有底圖的對話：收進「筆錄」）──
  try {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 13 }) } });
    await L.cont(page);
    const beat = page.locator('.place-beat');
    if (await beat.count()) { await page.waitForTimeout(800); await L.press(page, beat, { scroll: false }); }
    for (let i = 0; i < 3; i++) await L.press(page, page.getByRole('button', { name: zh ? /^繼續$/ : /^Continue$/ }).first()).catch(() => {});
    await L.press(page, page.locator('.rec-toggle').first(), { scroll: false });
    await page.waitForTimeout(500);
    await L.shot(page, `${tag}-transcript`);
    rec('transcript', await slimT(page, await L.audit(page), 'main'));
    await ctx.close();
  } catch (e) { rec('transcript', 'ERR ' + String(e).slice(0, 200)); }
  // ── 第二集桌面（審前 scene 10）──
  try {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep2', scene: 10 }) } });
    await L.cont(page);
    await page.waitForTimeout(900);
    await L.shot(page, `${tag}-ep2-desk`);
    rec('ep2desk', await slimT(page, await L.audit(page), 'main'));
    for (const [k, re] of [['docs', /^(卷宗|Case file)/], ['board', /^(證據板|Board)/]]) {
      try {
        await tabTo(page, re);
        await L.shot(page, `${tag}-ep2-${k}`);
        rec('ep2' + k, await slimT(page, await L.audit(page), 'main'));
      } catch (e) { rec('ep2' + k, 'ERR ' + String(e).slice(0, 150)); }
    }
    await ctx.close();
  } catch (e) { rec('ep2desk', 'ERR ' + String(e).slice(0, 200)); }
  // ── 集尾卡（第一集 slice-end）──
  try {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 45 }) } });
    await L.cont(page);
    await page.waitForTimeout(5000);
    await L.shot(page, `${tag}-ending`);
    rec('ending', await slimT(page, await L.audit(page), 'main'));
    await ctx.close();
  } catch (e) { rec('ending', 'ERR ' + String(e).slice(0, 200)); }
  // ── 冷開場黑底字卡（fitLine）──
  try {
    const { ctx, page } = await L.open(size, { lang, scheme, ls: { 'lawgame-settings': settings, 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 0, step: 0 }) } });
    await L.cont(page);
    await page.waitForTimeout(900);
    await L.shot(page, `${tag}-cine`);
    rec('cine', await slimT(page, await L.audit(page), 'main'));
    await ctx.close();
  } catch (e) { rec('cine', 'ERR ' + String(e).slice(0, 200)); }
  out.push(R);
  console.log(JSON.stringify(R).slice(0, 6000));
}

(async () => {
  const keys = (process.argv[2] || 'A').split(',');
  for (const k of keys) {
    try { await run(k); } catch (e) { console.log('ERR', k, String(e).slice(0, 400)); }
  }
  fs.writeFileSync(L.DIR + `/r8-tour-${keys.join('')}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
