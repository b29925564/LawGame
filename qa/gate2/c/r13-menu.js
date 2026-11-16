// 第 13 輪：選單＋設定（存檔／讀檔／選項）。用法：node r13-menu.js <size,size> <zh,en>
// 進場：localStorage 存檔＝第 1 集事務所（scene 2），按「繼續」。開選單、切分頁、點每個核取方塊、鍵盤調字級與下拉，全用真輸入。
// 量：選單面板溢出／省略號／切字、面板內字離「選單」鈕的距離、無障礙樹名稱、核取方塊點下去有沒有變、Esc 關閉後焦點。
const L = require('./lib');
const fs = require('fs');
const AX = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  return nodes.filter((n) => !n.ignored && n.role && ['button', 'tab', 'checkbox', 'slider', 'combobox', 'dialog', 'status', 'MenuListPopup', 'radio', 'textbox', 'link'].includes(n.role.value)).map((n) => `${n.role.value}:${JSON.stringify(n.name?.value ?? '')}`);
};
const GEOM = () => {
  const p = document.querySelector('.menu-panel'); const tg = document.querySelector('.menu-toggle');
  if (!p) return null;
  const pr = p.getBoundingClientRect(); const tr = tg?.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const leaves = [...p.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.innerText || '').trim() && e.getBoundingClientRect().width > 0);
  const off = []; const clip = []; const ell = [];
  let near = 999, nearT = '';
  for (const e of leaves) {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    if (r.right > vw + 0.5 || r.left < -0.5 || r.bottom > vh + 0.5) off.push(e.innerText.slice(0, 20) + ` ${Math.round(r.left)}..${Math.round(r.right)} y${Math.round(r.bottom)}`);
    if (e.scrollWidth > e.clientWidth + 1 && (cs.overflow === 'hidden' || cs.overflowX === 'hidden')) clip.push(e.innerText.slice(0, 20));
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) ell.push(e.innerText.slice(0, 20));
    if (tr) {
      const rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect();
      const dx = Math.max(tr.left - t.right, t.left - tr.right, 0), dy = Math.max(tr.top - t.bottom, t.top - tr.bottom, 0);
      const d = Math.hypot(dx, dy); if (d < near) { near = d; nearT = e.innerText.slice(0, 16); }
    }
  }
  return { panel: [pr.left, pr.top, pr.width, pr.height].map(Math.round), scrollH: p.scrollHeight, clientH: p.clientHeight, docW: document.documentElement.scrollWidth, vw, off, clip, ell, near: Math.round(near * 10) / 10, nearT };
};
(async () => {
  const out = [];
  for (const s0 of process.argv[2].split(',')) for (const lang of (process.argv[3] || 'zh,en').split(',')) {
    const size = /^\d+$/.test(s0) ? +s0 : s0;
    const { ctx, page } = await L.open(size, { lang, scheme: 'light', ls: { 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 2 }) } });
    const tag = `menu-${s0}-${lang}`;
    const R = { tag, steps: {}, log: [] };
    try {
      await L.cont(page); await page.waitForTimeout(800);
      const tg = page.locator('.menu-toggle');
      await L.press(page, tg, { scroll: false }); await page.waitForTimeout(400);
      for (const [k, re] of [['save', /^(存檔|Save)$/], ['load', /^(讀檔|Load)$/], ['options', /^(選項|Options)$/]]) {
        const tab = page.locator('.menu-panel').getByRole('tab', { name: re });
        await L.press(page, tab, { scroll: false }); await page.waitForTimeout(350);
        R.steps[k] = { geom: await page.evaluate(GEOM), ax: await AX(page), sel: await tab.getAttribute('aria-selected') };
        await L.shot(page, `${tag}-${k}`);
      }
      // 選項：每個核取方塊點一下，看狀態有沒有變，再點回來
      const boxes = page.locator('.menu-panel input[type=checkbox]');
      const n = await boxes.count(); R.boxes = [];
      for (let i = 0; i < n; i++) {
        const b = boxes.nth(i);
        const before = await b.isChecked();
        const lab = (await b.evaluate((e) => e.closest('label')?.innerText ?? e.getAttribute('aria-label') ?? '')).replace(/\n/g, '/').slice(0, 30);
        await L.press(page, b); await page.waitForTimeout(250);
        const after = await b.isChecked();
        const g = await page.evaluate(GEOM);
        await L.press(page, b); await page.waitForTimeout(250);
        R.boxes.push({ lab, before, after, back: await b.isChecked(), off: g?.off.length, docW: g?.docW });
      }
      // 字級：鍵盤右鍵兩下（最大），截圖、量，再左鍵回去
      const range = page.locator('.menu-panel input[type=range]').first();
      if (await range.count()) {
        await L.press(page, range); await page.waitForTimeout(150);
        const v0 = await range.inputValue();
        for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);
        R.textMax = { v0, v: await range.inputValue(), geom: await page.evaluate(GEOM) };
        await L.shot(page, `${tag}-options-textmax`);
        for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
        for (let i = 0; i < 12 && (await range.inputValue()) !== v0; i++) await page.keyboard.press('ArrowRight');
        R.textBack = await range.inputValue();
      }
      // Esc 關閉
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      R.afterEsc = await page.evaluate(() => ({ menu: !!document.querySelector('.menu-panel'), focus: document.activeElement?.className?.toString().slice(0, 30) || document.activeElement?.tagName }));
    } catch (e) { R.log.push('err ' + String(e).slice(0, 200)); await L.shot(page, `${tag}-err`).catch(() => {}); }
    out.push(R); console.log(tag, JSON.stringify(R.log), R.boxes?.length);
    await ctx.close();
  }
  fs.writeFileSync(`${L.DIR}/r13-menu-${process.env.PREFIX || 'c13-'}${process.argv[2]}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
