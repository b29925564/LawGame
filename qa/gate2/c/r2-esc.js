// 複驗 2：Esc 一次只關一層；選單 dialog 有 aria-modal。
const L = require('./lib');
const fs = require('fs');
const court = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/court-kowalski.json', 'utf8')).ep1;
const st = (page) => page.evaluate(() => ({
  menu: !!document.querySelector('.menu-panel'),
  modal: document.querySelector('.menu-panel')?.getAttribute('aria-modal') ?? null,
  jury: !!document.querySelector('.jurybox.popped'),
  drawer: !!document.querySelector('.sheet[role=dialog]'),
  rec: document.querySelector('.rec-toggle')?.getAttribute('aria-expanded') ?? null,
  zoom: !!document.querySelector('dialog[open]'),
  cardSheet: !!document.querySelector('.card-sheet'),
}));
const out = [];
(async () => {
  for (const [size, lang] of [['p7', 'zh'], [1100, 'en'], [360, 'en']]) {
    const R = { size, lang };
    // 陪審團浮層＋選單
    {
      const { ctx, page } = await L.open(size, { lang, ls: { 'lawgame-ep-auto': { version: 5, savedAt: Date.now(), label: 'x', progress: court } } });
      await L.cont(page);
      const go = page.getByRole('button', { name: lang === 'en' ? 'Go to court' : '開庭' });
      await page.waitForTimeout(1500);
      if (await go.count() && (await go.first().isVisible())) { await L.press(page, go.first()); await page.waitForTimeout(1500); }
      const strip = page.locator('.jb-strip');
      if (await strip.count()) {
        await L.press(page, strip);
        await page.waitForTimeout(300);
        await L.press(page, page.locator('.menu-toggle'), { scroll: false });
        const s0 = await st(page);
        await L.shot(page, `esc-jury-menu-${size}-${lang}-0both`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        const s1 = await st(page);
        await L.shot(page, `esc-jury-menu-${size}-${lang}-1`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        const s2 = await st(page);
        await L.shot(page, `esc-jury-menu-${size}-${lang}-2`);
        const focus = await page.evaluate(() => document.activeElement?.className?.toString().slice(0, 30));
        R.jury = { s0, s1, s2, focusAfter: focus };
      } else R.jury = 'no strip';
      // 只開選單
      await L.press(page, page.locator('.menu-toggle'), { scroll: false });
      const a = await st(page);
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      R.menuOnly = { before: a, after: await st(page) };
      await ctx.close();
    }
    // 證據抽屜＋選單（桌面）：抽屜開著時點選單
    {
      const { ctx, page } = await L.open(size, { lang, ls: { 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 7 }) } });
      await L.cont(page);
      await page.waitForTimeout(600);
      const tab = page.locator('.evidence-tab');
      if (await tab.count() && (await tab.isVisible())) {
        await L.press(page, tab); await page.waitForTimeout(400);
        const tb = await page.locator('.menu-toggle').boundingBox();
        await L.pressXY(page, tb.x + tb.width / 2, tb.y + 15);
        const s0 = await st(page);
        // 反過來：先開選單，再用鍵盤（Tab 到證據鈕按 Enter）不實際，改按 Esc 看
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        const s1 = await st(page);
        // 抽屜開著時按 Esc
        await L.press(page, tab); await page.waitForTimeout(400);
        const s2 = await st(page);
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        const s3 = await st(page);
        R.drawer = { tapMenuWhileDrawer: s0, thenEsc: s1, drawerOpen: s2, drawerEsc: s3 };
      } else R.drawer = 'side drawer';
      await ctx.close();
    }
    // 筆錄＋選單（定案會議）
    {
      const { ctx, page } = await L.open(size, { lang, ls: { 'lawgame-ep-auto': L.seed({ episode: 'ep1', scene: 13 }) } });
      await L.cont(page);
      const beat = page.locator('.place-beat');
      await page.waitForTimeout(800);
      if (await beat.count()) await L.press(page, beat, { scroll: false });
      await page.waitForTimeout(600);
      await L.press(page, page.locator('.rec-toggle').first(), { scroll: false });
      await L.press(page, page.locator('.menu-toggle'), { scroll: false });
      const s0 = await st(page);
      await L.shot(page, `esc-rec-menu-${size}-${lang}-0both`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      const s1 = await st(page);
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      const s2 = await st(page);
      R.rec = { s0, s1, s2 };
      await ctx.close();
    }
    out.push(R);
    console.log(JSON.stringify(R));
  }
  fs.writeFileSync(L.DIR + '/r2-esc.json', JSON.stringify(out, null, 1));
  await L.close();
})();
