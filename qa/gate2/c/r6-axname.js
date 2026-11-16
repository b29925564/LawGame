// 第六輪 2：.fl 包起來的按鈕，Chrome 算出的無障礙名稱（CDP Accessibility.getFullAXTree）和 getByRole 讀名。只讀。
const L = require('./lib');
const fs = require('fs');
const hung = JSON.parse(fs.readFileSync((process.env.REPO_ROOT || '.') + '/e2e/fixtures/hung-jury.json', 'utf8')).ep2;
const CTX = {
  iv1: L.seed({ episode: 'ep1', scene: 4 }),
  iv2: L.seed({ episode: 'ep2', scene: 4 }),
  cold1c: L.seed({ episode: 'ep1', scene: 0, step: 3, choices: {} }),
  cold1t: L.seed({ episode: 'ep1', scene: 0, step: 6, choices: { 'cold-open': { 3: 0 } } }),
  cold2: L.seed({ episode: 'ep2', scene: 0, step: 4, choices: {} }),
  epi: { version: 5, savedAt: Date.now(), label: 'x', progress: { ...hung, scene: 30, step: 0 } },
};
const CORE = /安撫|Calm|Reassure|Soothe/;
const only = (process.argv[2] || Object.keys(CTX).join(',')).split(',');
const combos = [[320, 'zh', 1.5], [320, 'en', 1.5], [360, 'zh', 1.25], [360, 'en', 1.25], [1530, 'zh', 1], [1530, 'en', 1]];
const out = [];
(async () => {
  for (const name of only)
    for (const [size, lang, sc] of combos) {
      const tag = `ax-${name}-${size}-${lang}-${sc * 100}`;
      try {
        const { ctx, page } = await L.open(size, { lang, ls: { 'lawgame-settings': { state: { textScale: sc }, version: 1 }, 'lawgame-ep-auto': CTX[name] } });
        await L.cont(page);
        await page.waitForTimeout(name === 'epi' ? 4500 : 1500);
        const beat = page.locator('.place-beat');
        if (await beat.count()) { await L.press(page, beat, { scroll: false }); await page.waitForTimeout(800); }
        // 手機戲：一直按「繼續」直到出現回覆選項（真點擊）
        for (let k = 0; k < 8 && name !== 'iv1' && name !== 'iv2'; k++) {
          if (await page.locator('.replies button').first().isVisible().catch(() => false)) break;
          let nx = page.getByRole('button', { name: /^(繼續|Continue|Next)/ }).last();
          if (!(await nx.isVisible().catch(() => false))) nx = page.locator('.notif').first();
          if (!(await nx.isVisible().catch(() => false))) break;
          await L.press(page, nx); await page.waitForTimeout(900);
        }
        await L.fontsReady(page);
        await page.waitForTimeout(400);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('DOM.getDocument', { depth: -1 });
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        const rows = [];
        for (const n of nodes) {
          if (n.ignored || !n.role || n.role.value !== 'button' || !n.backendDOMNodeId) continue;
          const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
          const { result } = await cdp.send('Runtime.callFunctionOn', {
            objectId: object.objectId,
            returnByValue: true,
            functionDeclaration: 'function(){return {rep: !!this.closest(".replies,.phone-body"), fl: !!this.querySelector(".fl"), wrap: !!this.querySelector(".fl-wrap"), text: this.textContent, inner: this.innerText, lines: (()=>{const rg=document.createRange();let tops=new Set();const tw=document.createTreeWalker(this,NodeFilter.SHOW_TEXT);let q;while((q=tw.nextNode()))for(let i=0;i<q.length;i++){if(!q.textContent[i].trim())continue;rg.setStart(q,i);rg.setEnd(q,i+1);const r=[...rg.getClientRects()].find(x=>x.width>0);if(r)tops.add(Math.round(r.top/4));}return tops.size;})()}}',
          });
          const d = result.value;
          if (!d.fl && !d.rep && !CORE.test(d.text)) continue;
          const ax = n.name ? n.name.value : '';
          const norm = d.text.replace(/[\s ]+/g, ' ').trim();
          const issues = [];
          if (ax !== norm) issues.push('ax≠text');
          if (/\s{2,}/.test(ax)) issues.push('doubleSpace');
          if (ax !== ax.trim()) issues.push('edgeSpace');
          if (/[\p{Script=Han}（）「」，。、：；！？]\s+[\p{Script=Han}（）「」，。、：；！？]/u.test(ax)) issues.push('spaceInZh');
          if (/[­​⁠]/.test(ax)) issues.push('invisibleChar');
          const byRole = await page.getByRole('button', { name: norm, exact: true }).count();
          if (!byRole) issues.push('getByRoleMiss');
          rows.push({ ax, text: norm, fl: d.fl, wrap: d.wrap, lines: d.lines, byRole, issues });
        }
        await cdp.detach();
        const file = await L.shot(page, tag);
        const r = { tag, n: rows.length, rows, shot: file };
        out.push(r);
        console.log(JSON.stringify(r));
        await ctx.close();
      } catch (e) {
        console.log(JSON.stringify({ tag, err: String(e).slice(0, 300) }));
      }
    }
  fs.writeFileSync(L.DIR + `/r6-axname-${only.join('')}.json`, JSON.stringify(out, null, 1));
  await L.close();
})();
