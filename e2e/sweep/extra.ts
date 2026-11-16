/* EN=1：在截圖點切英文檢查空白／殘留中文／溢出再切回中文。LIGHT=1：開法庭光層並記錄各層 opacity（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。 */
import type { Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { layoutAudit } from './layout';
import { bibleShot } from './bible';

export const EN = !!process.env.EN;
export const LIGHT = !!process.env.LIGHT;
const LOG = '/tmp/qa-extra.txt';
const log = (s: string) => appendFileSync(LOG, s + '\n');

export async function installExtra(page: Page) {
  if (process.env.NEEDLE) {
    // 畫面上任何時候出現 NEEDLE 都記一次（不只截圖點），附當時語言。
    await page.exposeFunction('__needleHit', (s: string) => log(`[即時找到] ${s}`));
    await page.addInitScript((src) => {
      const re = new RegExp(src, 'g');
      const seen = new Set<string>();
      const scan = () => {
        const t = document.body?.innerText ?? '';
        for (const m of t.match(re) ?? []) {
          const k = `${document.documentElement.lang}:${m}`;
          if (!seen.has(k)) {
            seen.add(k);
            (window as unknown as { __needleHit: (s: string) => void }).__needleHit(k);
          }
        }
      };
      new MutationObserver(() => scan()).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }, process.env.NEEDLE);
  }
  if (LIGHT) await page.addInitScript(() => localStorage.setItem('lawgame-court-light', '1'));
}

export async function setLangVia(page: Page, lang: 'en' | 'zh-Hant') {
  const toggle = page.locator('.menu-toggle');
  if (!(await toggle.isVisible().catch(() => false))) return false;
  // #186 起手機選單鈕跟頁首捲走：先捲回頂端開選單，切完再捲回原處。
  const y = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  // 選單鈕被蓋住的情況已由［版面］記錄；這裡用程式點，讓檢查能走完。
  await toggle
    .click({ timeout: 3000 })
    .catch(() => toggle.evaluate((b) => (b as HTMLElement).click()));
  // 先把橫向捲動歸零（整頁橫移已由［版面］記錄），再點；點不到就用程式點。
  await page.evaluate(() => window.scrollTo(0, window.scrollY));
  const tab = page.getByRole('dialog').getByRole('tab').nth(2);
  await tab.click({ timeout: 3000 }).catch(() => tab.evaluate((b) => (b as HTMLElement).click()));
  const lb = page.getByRole('dialog').locator(`.lang-switch button[lang="${lang}"]`);
  await lb.click({ timeout: 3000 }).catch(() => lb.evaluate((b) => (b as HTMLElement).click()));
  // 手機上選單開著時 .menu-toggle 可能被蓋住：先試 Escape，再強制點。
  const dlg = page.getByRole('dialog');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
  if (await dlg.isVisible().catch(() => false))
    await page
      .locator('.menu-toggle')
      .evaluate((b) => (b as HTMLElement).click())
      .catch(() => {});
  await page.waitForTimeout(150);
  if (await dlg.isVisible().catch(() => false)) await page.mouse.click(5, 5);
  await page.waitForTimeout(250);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  return true;
}

/** 畫面上看得到的文字節點，略過指定 lang 的區塊（語言切換鈕本身）。 */
async function visibleText(page: Page, skipLang: string) {
  return page.evaluate((skip) => {
    const out: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim()) continue;
      if (
        el.closest(`[lang="${skip}"], script, style, .sr-only, details:not([open]) > :not(summary)`)
      )
        continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      out.push(n.textContent.trim());
    }
    return out;
  }, skipLang);
}

export async function extraShot(page: Page, name: string, dir: string, tag: string) {
  if (process.env.NEEDLE) {
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const hits = [...new Set(body.match(new RegExp(process.env.NEEDLE!, 'g')) ?? [])];
    if (hits.length)
      log(
        `[找到 ${tag}] ${name}（${await page.locator('html').getAttribute('lang')}）：${hits.join(' | ')}`,
      );
  }
  if (LIGHT) {
    const ops = await page
      .locator('.court-light img')
      .evaluateAll((els) =>
        els.map(
          (e) =>
            `${Number((e as HTMLElement).style.opacity || 0).toFixed(2)}${(e as HTMLElement).style.visibility === 'hidden' ? 'h' : ''}`,
        ),
      );
    if (ops.length) {
      await page.waitForTimeout(800);
      const after = await page
        .locator('.court-light img')
        .evaluateAll((els) =>
          els.map((e) => Number((e as HTMLElement).style.opacity || 0).toFixed(2)),
        );
      const jury = (
        await page
          .locator('.meter, .jury')
          .first()
          .innerText()
          .catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .slice(0, 60);
      log(`[光層 ${tag}] ${name}：${after.join('/')} 陪審：${jury}`);
      mkdirSync(`${dir}/light`, { recursive: true });
      await page.screenshot({ path: `${dir}/light/${name}.png` });
    }
  }
  if (process.env.BIBLE) await bibleShot(page, name, tag);
  {
    // 立繪：壞圖、盧卡斯頭像數量；寬螢幕大立繪不可蓋到對話欄。
    const r = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')].filter(
        (i) => i.getBoundingClientRect().width > 0,
      );
      const broken = imgs
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.currentSrc.split('/').pop());
      const lucas = document.querySelectorAll('.portrait.art').length;
      const stage = document.querySelector('.lucas-stage') as HTMLElement | null;
      let overlap = '';
      if (stage && stage.getBoundingClientRect().width > 0) {
        const s = stage.getBoundingClientRect();
        for (const el of document.querySelectorAll(
          'main .speech, main .narration, main .choices button, main .lines',
        )) {
          const b = el.getBoundingClientRect();
          if (
            b.width &&
            b.left < s.right - 1 &&
            b.right > s.left + 1 &&
            b.top < s.bottom &&
            b.bottom > s.top
          ) {
            overlap = (el as HTMLElement).className;
            break;
          }
        }
      }
      return { broken, lucas, stage: !!stage && stage.getBoundingClientRect().width > 0, overlap };
    });
    if (r.broken.length || r.overlap || r.stage || r.lucas)
      log(
        `[立繪 ${tag}] ${name}：壞圖 ${r.broken.length}${r.broken.length ? ' ' + r.broken.join(',') : ''}；頭像 ${r.lucas}；大立繪 ${r.stage ? '有' : '無'}${r.overlap ? '；蓋到 ' + r.overlap : ''}`,
      );
  }
  {
    // 版面：裁切、刪節號、圖示置中、黏頂穿出（任一筆即不過）
    const hits = await layoutAudit(page).catch((e) => [
      { kind: '檢查失敗', what: String(e).slice(0, 80) },
    ]);
    if (hits.length) {
      const lang = await page
        .locator('html')
        .getAttribute('lang')
        .catch(() => '');
      log(
        `[版面X ${tag}] ${name}（${lang}）：${hits.length} 筆 ${hits
          .slice(0, 8)
          .map((h) => h.kind + ' ' + h.what)
          .join(' | ')}`,
      );
      mkdirSync(`${dir}/layout`, { recursive: true });
      await page.screenshot({ path: `${dir}/layout/${name}-${lang}.png` }).catch(() => {});
    }
  }
  {
    // 選單鈕要點得到（中心點最上層是它自己）；整頁不可橫向捲動。中英文都查。
    const m = await page.evaluate(() => {
      const b = document.querySelector('.menu-toggle') as HTMLElement | null;
      let blocked = '';
      if (b && b.getBoundingClientRect().width) {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (top && !b.contains(top))
          blocked = top.tagName + '.' + String((top as HTMLElement).className).split(' ')[0];
      }
      const W = document.documentElement.clientWidth;
      const over =
        document.documentElement.scrollWidth > W + 1 ? document.documentElement.scrollWidth - W : 0;
      return { blocked, over, lang: document.documentElement.lang };
    });
    if (m.blocked || m.over)
      log(
        `[版面 ${tag}] ${name}（${m.lang}）：${m.blocked ? '選單鈕被 ' + m.blocked + ' 蓋住 ' : ''}${m.over ? '整頁橫向多出 ' + m.over + 'px' : ''}`,
      );
  }
  {
    // 中文模式不該出現英文字（全大寫縮寫如 GPS、IOU 不算；App、Daubert 等白名單不算）。
    const lang = await page
      .locator('html')
      .getAttribute('lang')
      .catch(() => '');
    if (lang !== 'en') {
      const texts = await visibleText(page, 'en');
      const OK = /^(App|Daubert|Uber|Wi-Fi|iPhone|Lyft|Slack|Email|Google)$/;
      const eng = [
        ...new Set(
          texts.flatMap((t) =>
            (
              t.match(
                /[A-Za-z][A-Za-z'’-]*[a-z][A-Za-z'’-]*(?:[ ,.:;!?]+[A-Za-z][A-Za-z'’-]+)*/g,
              ) ?? []
            )
              .filter((w) => w.length >= 3 && !OK.test(w))
              .map((w) => `${w}〔${t.slice(0, 16)}〕`),
          ),
        ),
      ];
      log(
        `[ZH ${tag}] ${name}：英文句子 ${eng.length}${eng.length ? ' ' + eng.slice(0, 6).join(' | ') : ''}`,
      );
    }
  }
  if (!EN) return;
  if (!(await setLangVia(page, 'en'))) {
    log(`[EN ${tag}] ${name}：沒有選單按鈕，略過`);
    return;
  }
  const r = await page.evaluate(() => {
    const CJK = /[㐀-鿿、。]/;
    const vis = (e: Element) => {
      const b = (e as HTMLElement).getBoundingClientRect();
      return (
        b.width > 0 &&
        b.height > 0 &&
        getComputedStyle(e).visibility !== 'hidden' &&
        !e.closest('details:not([open]) > :not(summary)')
      );
    };
    const W = document.documentElement.clientWidth;
    const ui = [
      ...document.querySelectorAll(
        'button, h1, h2, h3, [role=tab], label, .eyebrow, dt, th, legend',
      ),
    ].filter(vis);
    const blank = ui
      .filter(
        (e) =>
          !(e as HTMLElement).innerText.trim() &&
          !e.getAttribute('aria-label') &&
          !e.querySelector('img,svg'),
      )
      .map((e) => e.tagName + '.' + (e as HTMLElement).className);
    const zh = ui
      .filter((e) => CJK.test((e as HTMLElement).innerText) && !e.closest('[lang="zh-Hant"]'))
      .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 28));
    const over = [...document.querySelectorAll('main *, .panel, .menu-panel')]
      .filter(vis)
      .filter((e) => {
        const b = (e as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(e);
        const clip =
          (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2 &&
          s.overflowX === 'hidden' &&
          s.textOverflow !== 'ellipsis' &&
          /BUTTON|H\d|LABEL/.test(e.tagName);
        return b.right > W + 2 || clip;
      })
      .map((e) => {
        const b = (e as HTMLElement).getBoundingClientRect();
        return (
          e.tagName +
          '.' +
          String((e as HTMLElement).className) +
          ':' +
          (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 20) +
          ` [${Math.round(b.left)}-${Math.round(b.right)}/${W}]`
        );
      });
    if (document.documentElement.scrollWidth > W + 1)
      for (const e of Array.from(document.querySelectorAll('body *'))) {
        const b = e.getBoundingClientRect();
        const pb = e.parentElement!.getBoundingClientRect();
        if (b.right > W + 1 && pb.right <= W + 1)
          over.push(
            'PAGE ' +
              e.tagName +
              '.' +
              String((e as HTMLElement).className).slice(0, 50) +
              ` [${Math.round(b.left)}-${Math.round(b.right)}/${W}]`,
          );
      }
    const body = (document.querySelector('main') as HTMLElement | null)?.innerText ?? '';
    const bodyZh = (body.match(/[㐀-鿿、。]+/g) || []).join('').length;
    const spaced = (body.match(/(?:[^\s▸/\d] ){5,}[^\s▸/\d]/g) || [])
      .slice(0, 3)
      .map((x) => x.slice(0, 24));
    return {
      spaced,
      blank,
      zh: [...new Set(zh)],
      over: [...new Set(over)].slice(0, 8),
      pageOver: document.documentElement.scrollWidth > W + 1,
      bodyZh,
      bodyLen: body.length,
    };
  });
  const allZh = [
    ...new Set(
      (await visibleText(page, 'zh-Hant'))
        .filter((t) => /[㐀-鿿、。]/.test(t))
        .map((t) => t.slice(0, 24)),
    ),
  ];
  log(
    `[EN全頁中文 ${tag}] ${name}：${allZh.length}${allZh.length ? ' ' + allZh.slice(0, 6).join(' | ') : ''}`,
  );
  log(
    `[EN ${tag}] ${name}：空白 ${r.blank.length}${r.blank.length ? ' ' + r.blank.join(',') : ''}；介面中文 ${r.zh.length}${r.zh.length ? ' ' + r.zh.join(' | ') : ''}；溢出 ${r.pageOver ? '整頁橫向捲動 ' : ''}${r.over.length}${r.over.length ? ' ' + r.over.join(' | ') : ''}；內文中文字 ${r.bodyZh}/${r.bodyLen}；逐字空格 ${r.spaced.length}${r.spaced.length ? ' ' + r.spaced.join(' | ') : ''}`,
  );
  {
    const hits = await layoutAudit(page).catch((e) => [
      { kind: '檢查失敗', what: String(e).slice(0, 80) },
    ]);
    if (hits.length)
      log(
        `[版面X ${tag}] ${name}（en）：${hits.length} 筆 ${hits
          .slice(0, 8)
          .map((h) => h.kind + ' ' + h.what)
          .join(' | ')}`,
      );
  }
  mkdirSync(`${dir}/en`, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${dir}/en/${name}.png` });
  if (r.over.some((o: string) => o.includes('rec-stamp'))) {
    const info = await page.evaluate(() => {
      const st = document.querySelector('.rec-stamp') as HTMLElement;
      st.scrollIntoView({ block: 'center' });
      const row = st.closest('.rec-row') as HTMLElement;
      return row.outerHTML.slice(0, 600) + ' fs=' + getComputedStyle(row).fontSize;
    });
    log('[STAMP] ' + info);
    await page.screenshot({ path: `${dir}/en/${name}-stamp.png` });
  }
  await setLangVia(page, 'zh-Hant');
}
