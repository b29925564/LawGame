/* BIBLE=1：設定集第 9、10 章可自動檢查的規則。每個截圖點跑一次，結果寫進 /tmp/qa-bible.txt（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。 */
import type { Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';

const LOG = '/tmp/qa-bible.txt';
const log = (s: string) => appendFileSync(LOG, s + '\n');

/**
 * 設定集稽核的違規（process-v2 第 5 節第 11、12 項）：全路線通關結束時斷言是空的。
 * 只收規則明確的項目：一格一黃、回彈／震動／放大、百分比、紅章、虛線框、圓角黑條。
 * 投影、筆錄、證據板只記錄（給人看），不判定。
 * 已接受的偏差（設計師裁定）：片頭鏡頭推拉 ti-* 放大超過 1.04；手機狀態列的電量百分比、旁白裡的「百分之四百」
 * 是故事裡的東西，不是給玩家看的數值。
 */
export const bibleViolations: string[] = [];
const MOTION_OK = /@keyframes ti-/;
const PERCENT_OK = /▂▄▆ \d+%|^p\.narration/;

export type BibleResult = {
  yellow: string[];
  yellowSum: number;
  yellowFull: number;
  shadow: string[];
  percent: string[];
  redStamp: string[];
  dashed: string[];
  redact: { n: number; round: string[] };
  rec?: { pages: string; fit: string; stamps: string[]; skip: boolean };
  cork?: { red: string; green: string; sag: string; locked: string[] };
};

export async function bibleAudit(page: Page): Promise<BibleResult> {
  return page.evaluate(() => {
    const vis = (e: Element) => {
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return false;
      if (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) return false;
      const s = getComputedStyle(e);
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        Number(s.opacity) > 0.05 &&
        !e.closest('[aria-hidden="true"][hidden], details:not([open]) > :not(summary)')
      );
    };
    const name = (e: Element) => {
      const c =
        typeof (e as HTMLElement).className === 'string'
          ? (e as HTMLElement).className
          : (e.getAttribute('class') ?? '');
      const t = ((e as HTMLElement).innerText ?? e.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 14);
      return `${e.tagName.toLowerCase()}${c ? '.' + c.split(/\s+/).slice(0, 2).join('.') : ''}${t ? '「' + t + '」' : ''}`;
    };
    // 螢光筆黃：#ffd02e／#f4c53d 附近（RGB 距離 < 40）且不透明度夠。
    const rgba = (s: string): number[] | null => {
      const cs = s.match(/color\(srgb ([^)]+)\)/);
      if (cs) {
        const q = cs[1].split(/[ /]+/).filter(Boolean).map(parseFloat);
        return [q[0] * 255, q[1] * 255, q[2] * 255, q[3] === undefined ? 1 : q[3]];
      }
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map((x) => (x.endsWith('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x)));
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3] > 1 ? p[3] / 255 : p[3]];
    };
    const isHl = (s: string | null) => {
      if (!s) return false;
      const c = rgba(s);
      if (!c || c[3] < 0.3) return false;
      const d = Math.min(
        ...[
          [255, 208, 46],
          [244, 197, 61],
        ].map((h) => Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2])),
      );
      if (d < 40) return true;
      if (d >= 110) return false;
      // 淡到一半的黃：色相要還是黃（30–70°），否則是別的顏色（例如紅混灰的粉）
      const [r, g, b] = c.slice(0, 3).map((x) => x / 255);
      const mx = Math.max(r, g, b),
        mn = Math.min(r, g, b);
      if (mx - mn < 0.12) return false;
      const hue =
        mx === r
          ? 60 * (((g - b) / (mx - mn)) % 6)
          : mx === g
            ? 60 * ((b - r) / (mx - mn) + 2)
            : 60 * ((r - g) / (mx - mn) + 4);
      const hh = (hue + 360) % 360;
      return hh >= 30 && hh <= 70;
    };
    // 淡化期間的黃（設計師 10-10 裁定）：每一處黃的權重 ＝ 祖先不透明度連乘 × 顏色 alpha × 顏色接近 --hl 的程度（距離 0 ＝ 1，距離 200 ＝ 0（約等於淡到背景色的比例））。
    // 所有黃的權重加總 ≤ 1 合格；加總 > 1，或兩處同時近乎完全不透明（權重 ≥ 0.95）才算違規。
    const HLS = [
      [255, 208, 46],
      [244, 197, 61],
    ];
    const near = (s: string | null) => {
      if (!s) return 0;
      const c = rgba(s);
      if (!c) return 0;
      if (!isHl(s)) return 0;
      const d = Math.min(...HLS.map((h) => Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2])));
      return (1 - d / 200) * c[3];
    };
    const chain = (e: Element | null) => {
      let o = 1;
      for (let a: Element | null = e; a; a = a.parentElement)
        o *= Number(getComputedStyle(a).opacity);
      return o;
    };
    const weights: number[] = [];
    const all = [...document.querySelectorAll('body *')].filter(vis);
    const yellowEls: Element[] = [];
    const yellow: string[] = [];
    for (const e of all) {
      const s = getComputedStyle(e);
      const parts: string[] = [];
      if (isHl(s.backgroundColor)) parts.push('底');
      if (
        isHl(s.color) &&
        ((e as HTMLElement).innerText ?? '').trim() &&
        [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())
      )
        parts.push('字');
      for (const side of ['Top', 'Right', 'Bottom', 'Left'])
        if (
          parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) >= 1 &&
          isHl(s.getPropertyValue(`border-${side.toLowerCase()}-color`))
        ) {
          parts.push('框');
          break;
        }
      if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && isHl(s.outlineColor))
        parts.push('外框');
      if (/rgb/.test(s.boxShadow) && isHl(s.boxShadow.match(/rgba?\([^)]+\)/)?.[0] ?? null))
        parts.push('光暈');
      if (e instanceof SVGElement) {
        if (isHl(s.fill)) parts.push('fill');
        if (s.stroke !== 'none' && isHl(s.stroke)) parts.push('stroke');
      }
      if (
        /gradient/.test(s.backgroundImage) &&
        (s.backgroundImage.match(/rgba?\([^)]+\)/g) ?? []).some(isHl)
      )
        parts.push('漸層');
      for (const ps of ['::before', '::after']) {
        const p = getComputedStyle(e, ps);
        if (p.content === 'none' || p.display === 'none') continue;
        if (
          isHl(p.backgroundColor) ||
          (p.content !== '""' && isHl(p.color)) ||
          (parseFloat(p.borderLeftWidth) > 0 && isHl(p.borderLeftColor)) ||
          (parseFloat(p.borderBottomWidth) > 0 && isHl(p.borderBottomColor))
        )
          parts.push(ps);
      }
      if (!parts.length) continue;
      // 巢狀的同一塊黃只算一次
      if (yellowEls.some((y) => y.contains(e))) continue;
      yellowEls.push(e);
      const srcs: (string | null)[] = [
        s.backgroundColor,
        s.color,
        s.borderTopColor,
        s.borderLeftColor,
        s.outlineColor,
      ];
      for (const ps of ['::before', '::after']) {
        const p = getComputedStyle(e, ps);
        if (p.content !== 'none')
          srcs.push(p.backgroundColor, p.borderLeftColor, p.borderBottomColor, p.color);
      }
      const w = Math.min(1, Math.max(...srcs.map(near)) * chain(e));
      weights.push(w);
      yellow.push(`${name(e)}[${parts.join('+')}]{w=${w.toFixed(2)}}`);
    }
    // 面板與按鈕投影（設定集 10：面板不投影）。軟木板上的實物卡片與便條的翹角陰影是設定集要的，另列。
    const shadow: string[] = [];
    for (const e of all) {
      const bs = getComputedStyle(e).boxShadow;
      if (!bs || bs === 'none') continue;
      const outer = bs
        .split(/,(?![^(]*\))/)
        .filter(
          (x) =>
            !/inset/.test(x) && !/ 0px 0px 0px /.test(x.replace(/rgba?\([^)]*\)/, '').trim() + ' '),
        );
      const real = outer.filter((x) => {
        const n = (x.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat);
        const col = rgba(x.match(/rgba?\([^)]*\)/)?.[0] ?? 'rgb(0,0,0)');
        if (col && col[3] < 0.02) return false;
        return (
          n.length >= 3 &&
          Math.abs(n[0]) + Math.abs(n[1]) + n[2] > 0 &&
          !(n[0] === 0 && n[1] === 0 && n[2] === 0)
        );
      });
      if (!real.length) continue;
      if (e.closest('.cork')) continue;
      if (e === document.activeElement) continue; // 焦點環
      shadow.push(`${name(e)}{${real[0].trim().slice(0, 40)}}`);
    }
    // 百分比（設定集：玩家看不到百分比）
    const percent: string[] = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const tx = n.textContent ?? '';
      if (/\d\s*[%％]|百分之/.test(tx) && n.parentElement && vis(n.parentElement))
        percent.push(`${name(n.parentElement)}`);
    }
    // 章不准是紅色
    const redStamp: string[] = [];
    for (const e of all.filter((x) => /stamp/.test(String((x as HTMLElement).className)))) {
      const s = getComputedStyle(e);
      for (const col of [s.color, s.borderTopColor, s.backgroundColor]) {
        const c = rgba(col);
        if (c && c[3] > 0.3 && c[0] > 150 && c[0] > c[1] * 1.8 && c[0] > c[2] * 1.8) {
          redStamp.push(name(e));
          break;
        }
      }
    }
    // 虛線灰框佔位（設定集：沒有資訊一律黑條，不用虛線框）
    const dashed: string[] = [];
    for (const e of all) {
      const s = getComputedStyle(e);
      if (
        [s.borderTopStyle, s.borderLeftStyle, s.borderBottomStyle].some(
          (x) => x === 'dashed' || x === 'dotted',
        ) &&
        !e.closest('.cork')
      )
        dashed.push(name(e));
    }
    // 黑條：零圓角、每畫面 ≤ 3（文件內的塗黑除外，筆錄行不算）
    const bars = all.filter((e) => e.matches('.redact, .cork-redact') && !e.closest('.record'));
    const round = bars
      .filter((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius) > 0)
      .map(name);
    const out: Record<string, unknown> = {
      yellow,
      yellowSum: weights.reduce((a, b) => a + b, 0),
      yellowFull: weights.filter((w) => w >= 0.95).length,
      shadow: [...new Set(shadow)],
      percent: [...new Set(percent)],
      redStamp,
      dashed: [...new Set(dashed)],
      redact: { n: bars.length, round },
    };
    // 筆錄紙
    const rec = document.querySelector('.transcript.record');
    if (rec && vis(rec)) {
      const rows = [...rec.querySelectorAll('.rec-row')] as HTMLElement[];
      const nos = rows.map((r) => Number(r.dataset.no));
      const bad: string[] = [];
      let prev = 0;
      for (const n of nos) {
        if (!(n === prev + 1 || (n === 1 && prev === 25))) bad.push(`${prev}→${n}`);
        prev = n;
      }
      const max = Math.max(0, ...nos);
      const scroll = rec.querySelector('.rec-scroll') as HTMLElement | null;
      // 一頁 25 行是否一次放得下：目前頁的第 1 行到第 25 行的高度 ≤ 捲動框高
      let fit = '-';
      if (scroll && rows.length) {
        const rh = rows[0].getBoundingClientRect().height;
        fit = `框 ${Math.round(scroll.clientHeight)}px／25 行 ${Math.round(rh * 25)}px ${rh * 25 <= scroll.clientHeight + 1 ? 'OK' : '放不下'}`;
      }
      const stamps = [...rec.querySelectorAll('.rec-stamp')].map((st) => {
        const row = st.closest('.rec-row') as HTMLElement;
        const tx = row.querySelector('.rec-tx, .rec-bar');
        const entry = st.closest('.rec-entry') as HTMLElement;
        const sb = st.getBoundingClientRect(),
          tb = tx?.getBoundingClientRect();
        const right = tb ? sb.left >= tb.right - 2 : false;
        const onObj = /異議|Objection/i.test(entry?.innerText ?? '');
        const inRow =
          sb.top >= row.getBoundingClientRect().top - 4 &&
          sb.bottom <= row.getBoundingClientRect().bottom + 4;
        return `${(st as HTMLElement).innerText.trim()}：${onObj ? '在異議句' : '不在異議句「' + (entry?.innerText ?? '').slice(0, 12) + '」'}／${right ? '在右邊' : '不在右邊'}／${inRow ? '在行高內' : '超出行高'}`;
      });
      out.rec = {
        pages: `行號 ${nos.length} 行 最大 ${max}${bad.length ? ' 斷號 ' + bad.slice(0, 4).join(',') : ''}`,
        fit,
        stamps,
        skip: !!rec.querySelector('.rec-skip'),
      };
    }
    // 證據板
    const cork = document.querySelector('.cork');
    if (cork && vis(cork)) {
      const strs = [
        ...cork.querySelectorAll('.cork-string > path:not(.glint)'),
      ] as SVGPathElement[];
      const desc = (k: string) =>
        strs
          .filter((p) => p.parentElement!.classList.contains(k))
          .map((p) => {
            const s = getComputedStyle(p);
            return `${s.stroke} dash=${s.strokeDasharray}`;
          });
      const sag = strs.map((p) => (/[QC]/.test(p.getAttribute('d') ?? '') ? 'Q' : '直')).join('');
      const locked = [...cork.querySelectorAll('.cork-redact')]
        .filter(vis)
        .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 30));
      out.cork = {
        red: [...new Set(desc('contra').concat(desc('red')))].join(' | ') || '-',
        green: [...new Set(desc('support').concat(desc('green')))].join(' | ') || '-',
        sag: sag || '-',
        locked,
      };
      (out.cork as Record<string, unknown>).kinds = [
        ...new Set(strs.map((p) => p.parentElement!.getAttribute('class'))),
      ].join(',');
    }
    return out as BibleResult;
  });
}

export async function bibleShot(page: Page, name: string, tag: string) {
  await motionShot(page, name, tag);
  const r = await bibleAudit(page).catch(
    (e) => ({ err: String(e).slice(0, 100) }) as unknown as BibleResult,
  );
  if ((r as unknown as { err?: string }).err)
    return log(`[聖經 ${tag}] ${name}：檢查失敗 ${(r as unknown as { err: string }).err}`);
  // 一格一黃（淡化規則）：權重加總 > 1.05（容許量測誤差），或兩處同時完全不透明才算違規。
  const yBad = r.yellowSum > 1.05 || r.yellowFull > 1;
  log(
    `[黃 ${tag}] ${name}：${r.yellow.length} 總和 ${r.yellowSum.toFixed(2)} ${r.yellow.join(' | ')}`,
  );
  if (yBad)
    bibleViolations.push(
      `一格一黃 ${tag} ${name}：總和 ${r.yellowSum.toFixed(2)} ${r.yellow.join(' | ')}`,
    );
  for (const p of r.percent.filter((x) => !PERCENT_OK.test(x)))
    bibleViolations.push(`百分比 ${tag} ${name}：${p}`);
  for (const x of r.redStamp) bibleViolations.push(`紅章 ${tag} ${name}：${x}`);
  for (const x of r.dashed) bibleViolations.push(`虛線框 ${tag} ${name}：${x}`);
  if (r.redact.round.length)
    bibleViolations.push(`圓角黑條 ${tag} ${name}：${r.redact.round.join(',')}`);
  if (yBad)
    log(
      `[黃違規 ${tag}] ${name}：權重總和 ${r.yellowSum.toFixed(2)}、完全不透明 ${r.yellowFull} 處 ${r.yellow.join(' | ')}`,
    );
  if (r.shadow.length)
    log(`[投影 ${tag}] ${name}：${r.shadow.length} ${r.shadow.slice(0, 6).join(' | ')}`);
  if (r.percent.length) log(`[百分比 ${tag}] ${name}：${r.percent.join(' | ')}`);
  if (r.redStamp.length) log(`[紅章 ${tag}] ${name}：${r.redStamp.join(' | ')}`);
  if (r.dashed.length) log(`[虛線框 ${tag}] ${name}：${r.dashed.slice(0, 6).join(' | ')}`);
  if (r.redact.n > 3 || r.redact.round.length)
    log(`[黑條 ${tag}] ${name}：${r.redact.n} 條 圓角 ${r.redact.round.join(',')}`);
  if (r.rec)
    log(
      `[筆錄 ${tag}] ${name}：${r.rec.pages}；${r.rec.fit}；全文鈕 ${r.rec.skip ? '有' : '無'}；章 ${r.rec.stamps.join(' ; ') || '無'}`,
    );
  if (r.cork)
    log(
      `[證據板 ${tag}] ${name}：紅 ${r.cork.red}；綠 ${r.cork.green}；下垂 ${r.cork.sag}；黑條卡 ${r.cork.locked.join(' / ') || '無'}；種類 ${(r.cork as unknown as { kinds: string }).kinds}`,
    );
}

/*
 * 動態自動檢查（設計師 10-09）：設定集第 10.2 章「沒有彈跳、沒有回彈、沒有震動」。
 * 1. 回彈：任何 cubic-bezier 的 y1 或 y2 超出 0..1。
 * 2. 震動：keyframes 的水平位移（translateX／translate 的 x／left／margin-left）或 rotate 來回換方向兩次以上。
 * 3. 放大：任何 scale 大於 1.04（證據板推進光圈 .cork-focus 的 1.15 除外）。
 * 掃全部樣式表（含之後才載入的 chunk）和執行中的 Web Animations；同一筆每個 worker 只記一次。
 */
export async function motionAudit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const EXEMPT = /cork-focus/;
    const bez = (txt: string, where: string) => {
      for (const m of txt.matchAll(
        /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g,
      )) {
        const y1 = +m[2],
          y2 = +m[4];
        if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) out.push(`回彈 ${where}：${m[0]}`);
      }
    };
    const scales = (txt: string, where: string) => {
      if (EXEMPT.test(where)) return;
      for (const m of txt.matchAll(/scale(?:3d|X|Y)?\(\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?/g)) {
        const v = Math.max(+m[1], m[2] !== undefined ? +m[2] : -Infinity);
        if (v > 1.04) out.push(`放大 ${where}：${m[0]})`);
      }
      for (const m of txt.matchAll(/(?:^|[;{\s])scale\s*:\s*([-\d.]+)/g))
        if (+m[1] > 1.04) out.push(`放大 ${where}：scale: ${m[1]}`);
    };
    const xOf = (style: string): number | null => {
      const m =
        style.match(/translateX\(\s*([-\d.]+)/) ??
        style.match(/translate3?d?\(\s*([-\d.]+)/) ??
        style.match(/(?:^|[;\s])(?:left|margin-left)\s*:\s*([-\d.]+)/) ??
        style.match(/rotate(?:Z)?\(\s*([-\d.]+)/);
      return m ? +m[1] : null;
    };
    const shake = (xs: (number | null)[], where: string) => {
      const v = xs.filter((x): x is number => x !== null);
      let turns = 0,
        dir = 0;
      for (let i = 1; i < v.length; i++) {
        const d = Math.sign(v[i] - v[i - 1]);
        if (d && dir && d !== dir) turns++;
        if (d) dir = d;
      }
      if (turns >= 2) out.push(`震動 ${where}：${v.join(' → ')}`);
    };
    const walk = (rules: CSSRuleList, ctx: string) => {
      for (const r of Array.from(rules)) {
        if (r instanceof CSSKeyframesRule) {
          const frames = Array.from(r.cssRules) as CSSKeyframeRule[];
          frames.sort((a, b) => parseFloat(a.keyText) - parseFloat(b.keyText));
          shake(
            frames.map((f) => xOf(f.style.cssText)),
            `@keyframes ${r.name}`,
          );
          for (const f of frames) {
            scales(f.style.cssText, `@keyframes ${r.name} ${f.keyText}`);
            bez(f.style.cssText, `@keyframes ${r.name}`);
          }
        } else if (r instanceof CSSStyleRule) {
          bez(r.style.cssText, r.selectorText);
          scales(r.style.cssText, r.selectorText);
          if ('cssRules' in r && (r as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules?.length)
            walk((r as unknown as { cssRules: CSSRuleList }).cssRules, ctx);
        } else if ('cssRules' in r) {
          walk((r as CSSGroupingRule).cssRules, ctx);
        }
      }
    };
    for (const sh of Array.from(document.styleSheets)) {
      try {
        walk(sh.cssRules, sh.href ?? 'inline');
      } catch {
        /* 跨網域樣式表（字型） */
      }
    }
    // 行內樣式與執行中的動畫（JS 寫的 Web Animations、CSS 動畫的實際影格）
    for (const e of Array.from(document.querySelectorAll('[style]'))) {
      const s = e.getAttribute('style') ?? '';
      const w = `style=${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]}`;
      bez(s, w);
      scales(s, w);
    }
    for (const a of document.getAnimations()) {
      const eff = a.effect as KeyframeEffect | null;
      if (!eff) continue;
      const tgt = eff.target as Element | null;
      const w = `動畫 ${(a as CSSAnimation).animationName ?? 'js'} on ${tgt ? tgt.tagName.toLowerCase() + '.' + String((tgt as HTMLElement).className).split(' ')[0] : '?'}`;
      bez(eff.getTiming().easing ?? '', w);
      const kf = eff.getKeyframes();
      for (const k of kf) {
        bez(String(k.easing ?? ''), w);
        if (!tgt?.closest('.cork-focus')) scales(`${k.transform ?? ''};scale:${k.scale ?? ''}`, w);
      }
      shake(
        kf.map((k) => xOf(`${k.transform ?? ''};left:${k.left ?? ''}`)),
        w,
      );
    }
    return [...new Set(out)];
  });
}

const motionSeen = new Set<string>();
export async function motionShot(page: Page, name: string, tag: string) {
  const hits = await motionAudit(page).catch((e) => [`檢查失敗 ${String(e).slice(0, 80)}`]);
  for (const h of hits)
    if (!motionSeen.has(h)) {
      motionSeen.add(h);
      if (!MOTION_OK.test(h)) bibleViolations.push(`動態 ${tag} ${name}：${h}`);
      log(`[動態 ${tag}] ${name}：${h}`);
    }
}
