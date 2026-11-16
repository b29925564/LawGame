// 第 2 集從頭點過去：node opening.js size lang theme maxSteps [reduced]
const L = require('../lib.js');
const fs = require('fs');
const [size = 'd1530', lang = 'zh', theme = 'light', maxSteps = '60', reduced = ''] = process.argv.slice(2);
const TAG = `op-${size}-${lang}-${theme}${reduced ? '-rm' : ''}`;
const OUT = `/tmp/claude-0/ux-1106b/work3/${TAG}.json`;

// 每個畫格記下畫面簽名：主要畫面、底圖、場記、字幕卡、整頁背景、主元素的不透明度。
const REC = () => {
  const log = [];
  window.__log = log;
  const t0 = performance.now();
  let sig = '';
  const tick = () => {
    const main = [...document.querySelectorAll('main')].filter((m) => m.getBoundingClientRect().width > 0);
    const m = main[main.length - 1];
    const imgs = [...document.querySelectorAll('.plate-bg, .cam-plate img, .cine img, .phone img')]
      .filter((i) => i.getBoundingClientRect().width > 0)
      .map((i) => (i.getAttribute('src') || '').split('/').pop().replace(/-[\w-]{8}\.(webp|jpg|png|avif)$/, '') + (i.complete && i.naturalWidth ? '' : '(loading)') + '@' + (+getComputedStyle(i).opacity).toFixed(2));
    const host = document.querySelector('.plate-host');
    const s = [
      main.map((x) => String(x.className).split(' ')[0]).join('+') || 'NO-MAIN',
      m ? (+getComputedStyle(m).opacity).toFixed(2) : '',
      m ? (m.innerText || '').trim().length : 0,
      imgs.join(','),
      host ? 'host:' + host.getAttribute('data-over') : '',
      document.querySelector('.place-slate') ? 'slate' : '',
      document.querySelector('.act-card, .actcard, [class*="act-card"]') ? 'act' : '',
      (() => {
        let e = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        while (e) {
          const bg = getComputedStyle(e).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return 'c:' + bg.replace(/ /g, '');
          e = e.parentElement;
        }
        return 'c:' + getComputedStyle(document.documentElement).backgroundColor.replace(/ /g, '');
      })(),
      'o' + (m ? [...m.querySelectorAll('*')].concat([m]).reduce((a, x) => Math.min(a, +getComputedStyle(x).opacity), 1).toFixed(1) : ''), 'cs:' + getComputedStyle(document.documentElement).colorScheme, (() => { const t = document.querySelector('.menu-toggle'); if (!t) return 'm:-'; const c = getComputedStyle(t); const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return 'm:' + c.backgroundColor.replace(/ /g, '') + '/' + c.color.replace(/ /g, '') + (top && (top === t || t.contains(top)) ? '' : '(hidden)'); })(),
    ].join('|');
    if (s !== sig) {
      log.push([Math.round(performance.now() - t0), s]);
      sig = s;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** 播完（finished、fill forwards/both）且用 steps() 的動畫：目標元素的計算值和最後一個關鍵影格比。 */
async function stepsEnd(page) {
  return page.evaluate(() => {
    const bad = [];
    let n = 0;
    for (const a of document.getAnimations()) {
      const eff = a.effect;
      if (!eff || !eff.target) continue;
      const tm = eff.getTiming();
      const kfs = eff.getKeyframes();
      const stepped = /steps|step-/.test(tm.easing) || kfs.some((k) => /steps|step-/.test(k.easing || ''));
      if (!stepped) continue;
      if (a.playState !== 'finished' || !/forwards|both/.test(tm.fill)) continue;
      n++;
      const last = kfs[kfs.length - 1];
      const cs = getComputedStyle(eff.target, eff.pseudoElement || null);
      for (const [k, v] of Object.entries(last)) {
        if (['offset', 'easing', 'composite', 'computedOffset'].includes(k)) continue;
        const cur = cs[k];
        // 比較數字部分（transform 矩陣、clip-path inset 百分比、opacity）
        const nums = (s) => (String(s).match(/-?\d*\.?\d+/g) || []).map(Number);
        const a1 = nums(cur), b1 = nums(v);
        if (k === 'opacity' && Math.abs(+cur - +v) > 0.01) bad.push(`${a.animationName}:${k} ${cur}≠${v}`);
        if (k === 'clipPath' && a1.length === b1.length && a1.some((x, i) => Math.abs(x - b1[i]) > 0.5)) bad.push(`${a.animationName}:${k} ${cur}≠${v}`);
        if (k === 'transform' && /scale\(/.test(v)) {
          const sc = nums(v)[0];
          const mm = nums(cur);
          if (mm.length >= 4 && Math.abs(mm[0] - sc) > 0.01 && Math.abs(mm[3] - sc) > 0.01) bad.push(`${a.animationName}:${k} ${cur}≠${v}`);
        }
      }
    }
    return { checked: n, bad };
  });
}

(async () => {
  const { page } = await L.open({ size, lang, theme, init: REC, reduced: !!reduced });
  const steps = [];
  await L.tap(page, page.getByRole('button', { name: lang === 'en' ? /^New game/i : /^新遊戲/ }));
  await page.waitForTimeout(300);
  await L.tap(page, page.locator('button.slot').nth(1));
  let lastSig = '';
  let same = 0;
  for (let i = 0; i < +maxSteps; i++) {
    await page.waitForTimeout(+process.env.WAIT || 2000);
    const info = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const main = [...document.querySelectorAll('main')].filter(vis).map((e) => String(e.className)).join('+');
      const sub = document.querySelector('.subcard, .sub-card, [class*="subcard"]');
      return {
        main,
        scrollW: document.documentElement.scrollWidth, vw: innerWidth,
        btns: [...document.querySelectorAll('button')].filter(vis).map((b) => b.textContent.trim().slice(0, 24)).slice(0, 10),
        text: (document.querySelector('main:last-of-type') || document.body).innerText.slice(0, 160).replace(/\n+/g, ' | '),
        tail: document.body.innerText.length + ':' + document.body.innerText.slice(-60).replace(/\n+/g, ' | '),
      };
    });
    const sig = info.main + info.tail;
    same = sig === lastSig ? same + 1 : 0;
    lastSig = sig;
    const name = `${TAG}-${String(i).padStart(2, '0')}`;
    const se = await stepsEnd(page);
    const au = await L.audit(page);
    const shot = await L.shot(page, name);
    steps.push({ i, shot, ...info, stepsEnd: se, audit: { docSW: au.docSW, ellipsis: au.ellipsis, overflowX: au.overflowX } });
    console.log(i, info.main.slice(0, 50), '|', info.text.slice(0, 60), '…', info.tail.slice(-50), '| btn:', info.btns.join('/').slice(0, 80), se.bad.length ? 'STEPBAD ' + se.bad : '', au.docSW > au.vw ? 'OVERFLOW' : '');
    if (same >= 3) { console.log('stuck'); break; }
    if (/desk|investigate|interview|board/i.test(info.main) && i > 5 && process.env.STOP_AT_DESK) break;
    // 前進
    const cont = page.getByRole('button', { name: /^(繼續|Continue|下一步|Next|開始|Begin|Start|點一下查看)/ }).filter({ visible: true });
    const notif = page.locator('button.notif:visible').first();
    const beat = page.locator('.place-beat:visible').first();
    const choice = page.locator('.choices button:visible, .options button:visible, .choice:visible, .opt:visible').first();
    const prim = page.locator('button.primary:visible').first();
    try {
      if (await notif.count()) await L.tap(page, notif);
      else if (await cont.count()) await L.tap(page, cont.last());
      else if (await choice.count()) await L.tap(page, choice);
      else if (await beat.count()) await L.tap(page, beat);
      else if (await prim.count()) await L.tap(page, prim);
      else if (await page.locator('main button:visible:not(.menu-toggle)').count())
        await L.tap(page, page.locator('main button:visible:not(.menu-toggle)').last());
      else {
        const vp = page.viewportSize();
        if (page.mobile) await page.touchscreen.tap(vp.width / 2, vp.height * 0.6);
        else await page.keyboard.press('Space');
      }
    } catch (e) { console.log('advance fail', e.message.split('\n')[0]); }
  }
  const log = await page.evaluate(() => window.__log);
  fs.writeFileSync(OUT, JSON.stringify({ steps, log, errors: page.errors }, null, 1));
  console.log('errors', page.errors.slice(0, 5));
  await L.close();
})();
