/* 版面自動檢查（2026-10-03 起，任何一筆都算 smoke 不過）（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。
 * 1 裁切：元素超出會裁切它的祖先框（overflow 非 visible）。橫向一律算；直向只在祖先 overflow-y 為 hidden/clip 時算。
 * 2 刪節號：text-overflow: ellipsis 或 line-clamp 真的截掉了字。
 * 3 圖示置中：只有圖示或一兩個符號的按鈕，圖示中心與按鈕中心差超過 1px。
 * 4 黏頂穿出：可捲動的框捲到中段時，sticky 元素上方還露出底下捲過去的內容。 */
import type { Page } from '@playwright/test';

export type LayoutHit = { kind: string; what: string };

export async function layoutAudit(page: Page): Promise<LayoutHit[]> {
  return page.evaluate(async () => {
    const hits: { kind: string; what: string }[] = [];
    const desc = (e: Element) => {
      const h = e as HTMLElement;
      const cls =
        String(h.className || '')
          .split(' ')
          .filter(Boolean)[0] ?? '';
      const txt = (h.innerText || h.getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24);
      return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}「${txt}」`;
    };
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (
        e.closest(
          '.sr-only, [aria-hidden=true] .sr-only, details:not([open]) > :not(summary), [inert]',
        )
      )
        return false;
      for (let a: Element | null = e; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0)
          return false;
      }
      // 被別的層整個蓋住（彈窗後面）不算
      return true;
    };
    const W = innerWidth,
      H = innerHeight;
    const onScreen = (r: DOMRect) => r.right > 0 && r.left < W && r.bottom > 0 && r.top < H;
    // 1 裁切
    const leaves = [
      ...document.querySelectorAll(
        'button, a, [role=tab], [role=radio], label, h1, h2, h3, h4, li, svg, .chip, .tag, strong, time, input, select',
      ),
    ];
    const seen = new Set<string>();
    for (const e of leaves) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      if (!onScreen(r)) continue;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        const ox = s.overflowX,
          oy = s.overflowY;
        if (ox === 'visible' && oy === 'visible') continue;
        const c = a.getBoundingClientRect();
        const bx = parseFloat(s.borderLeftWidth) || 0,
          by = parseFloat(s.borderTopWidth) || 0;
        const inner = {
          l: c.left + bx,
          r: c.left + bx + a.clientWidth,
          t: c.top + by,
          b: c.top + by + a.clientHeight,
        };
        const cutX =
          ox !== 'visible' &&
          (r.left < inner.l - 1 || r.right > inner.r + 1) &&
          r.right > inner.l &&
          r.left < inner.r;
        const cutY =
          (oy === 'hidden' || oy === 'clip') &&
          (r.top < inner.t - 1 || r.bottom > inner.b + 1) &&
          r.bottom > inner.t &&
          r.top < inner.b;
        if (cutX || cutY) {
          const k = `${desc(e)}@${desc(a)}`;
          if (!seen.has(k)) {
            seen.add(k);
            hits.push({
              kind: '裁切',
              what: `${desc(e)} 被 ${desc(a)} 切到${cutX ? '（左右' + (ox === 'auto' || ox === 'scroll' ? '，可橫捲' : '') + '）' : '（上下）'}`,
            });
          }
        }
        break; // 只看最近的裁切祖先
      }
    }
    // 2 刪節號
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e);
      const clampN = s.getPropertyValue('-webkit-line-clamp');
      const ell = s.textOverflow === 'ellipsis' && s.overflowX !== 'visible';
      const clamp = clampN && clampN !== 'none';
      if (!ell && !clamp) continue;
      if (!shown(e) || !onScreen(e.getBoundingClientRect())) continue;
      const h = e as HTMLElement;
      if (
        (ell && h.scrollWidth > h.clientWidth + 0.5) ||
        (clamp && h.scrollHeight > h.clientHeight + 1)
      )
        hits.push({ kind: '刪節號', what: desc(e) });
    }
    // 3 圖示置中
    for (const b of document.querySelectorAll('button, [role=button]')) {
      if (!shown(b)) continue;
      const br = b.getBoundingClientRect();
      if (!onScreen(br)) continue;
      const txt = (b as HTMLElement).innerText.replace(/\s+/g, '');
      const svgs = b.querySelectorAll('svg, img');
      let ir: DOMRect | null = null;
      if (svgs.length === 1 && txt.length === 0) ir = svgs[0].getBoundingClientRect();
      else if (
        svgs.length === 0 &&
        txt.length > 0 &&
        txt.length <= 2 &&
        !/[\p{L}\p{N}]/u.test(txt)
      ) {
        const rg = document.createRange();
        rg.selectNodeContents(b);
        const rs = [...rg.getClientRects()].filter((x) => x.width > 0);
        if (rs.length) {
          // 用 canvas 量字形真正的墨跡範圍（⋮⋮ 這類符號的墨跡不在字框正中）。
          const el = (b.querySelector('span') ?? b) as HTMLElement;
          const cs = getComputedStyle(el);
          const cv = document.createElement('canvas').getContext('2d')!;
          cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const ls = parseFloat(cs.letterSpacing) || 0;
          const m = cv.measureText(txt);
          const x0 = Math.min(...rs.map((x) => x.left));
          const top = Math.min(...rs.map((x) => x.top));
          const base = top + m.fontBoundingBoxAscent;
          const inkL = x0 - m.actualBoundingBoxLeft,
            inkR = x0 + m.actualBoundingBoxRight + ls * (txt.length - 1);
          ir = new DOMRect(
            inkL,
            base - m.actualBoundingBoxAscent,
            inkR - inkL,
            m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
          );
        }
      }
      if (!ir) continue;
      const dx = ir.left + ir.width / 2 - (br.left + br.width / 2);
      const dy = ir.top + ir.height / 2 - (br.top + br.height / 2);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
        hits.push({ kind: '圖示偏移', what: `${desc(b)} 偏 x${dx.toFixed(1)} y${dy.toFixed(1)}` });
    }
    // 4 黏頂穿出：捲到中段量一次再捲回來
    const scrollers = [...document.querySelectorAll('body *')].filter((e) => {
      const s = getComputedStyle(e);
      return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 40 && shown(e);
    });
    for (const sc of scrollers) {
      const stickies = [...sc.querySelectorAll('*')].filter(
        (e) => getComputedStyle(e).position === 'sticky' && shown(e),
      );
      if (!stickies.length) continue;
      const before = sc.scrollTop;
      const pre = new Map(stickies.map((e) => [e, e.getBoundingClientRect().top]));
      sc.scrollTop = Math.min(sc.scrollHeight - sc.clientHeight, before + 200);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = sc.getBoundingClientRect();
      const top = c.top + (parseFloat(getComputedStyle(sc).borderTopWidth) || 0);
      for (const st of stickies) {
        const s = getComputedStyle(st);
        if (s.top === 'auto') continue;
        const r = st.getBoundingClientRect();
        // 只看真的黏住的：跟著內容一起移動了整個捲動量的，是還在正常排版位置的小標（介面與操作 10-03）。
        const moved = (pre.get(st) ?? r.top) - r.top;
        if (sc.scrollTop - before > 1 && Math.abs(moved - (sc.scrollTop - before)) < 1) continue;
        const gap = r.top - top;
        if (gap > 1 && gap < sc.clientHeight / 2)
          hits.push({
            kind: '黏頂穿出',
            what: `${desc(st)} 上方露出 ${gap.toFixed(0)}px 捲動內容（在 ${desc(sc)}）`,
          });
      }
      // 捲回最上面：sticky 不該蓋住任何內容（圖五：時間軸第一張被托盤蓋住）。
      sc.scrollTop = 0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const st of stickies) {
        if (getComputedStyle(st).top === 'auto') continue; // 黏底的答案列本來就蓋在內容上
        const r = st.getBoundingClientRect();
        for (const e of sc.querySelectorAll('strong, time, p, li, h2, h3, button')) {
          if (st.contains(e) || e.contains(st) || !shown(e)) continue;
          if (getComputedStyle(e).position === 'sticky' || e.closest('[style*=sticky]')) continue;
          const q = e.getBoundingClientRect();
          const ov = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
          const ovx = Math.min(r.right, q.right) - Math.max(r.left, q.left);
          if (ov > 2 && ovx > 2 && stickies.every((x) => !x.contains(e))) {
            hits.push({
              kind: '黏頂蓋住',
              what: `${desc(st)} 在最上面時就蓋住 ${desc(e)} ${ov.toFixed(0)}px`,
            });
            break;
          }
        }
      }
      sc.scrollTop = before;
    }
    return hits;
  });
}
