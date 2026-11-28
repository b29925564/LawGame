/**
 * 短標籤的不拆單位（prose.tsx fitLine 包的 .fl）：設計師 v93 排字規則「不出框第一，黏住的單位不拆」。
 *
 * .fl 是一般的行內字，平常不換行（white-space: nowrap），放得下就整段在同一行，單位和單位之間照常換行。
 * 一個單位比它所在的框還寬時（窄框、大字級），才加上 .fl-wrap 改成可以換行，在單位內部的詞界拆（退路 B）；
 * 內部的詞也是 .fl，同樣只有比框還寬才拆（這時中文才在字與字之間拆）。
 *
 * 不用 inline-block：瀏覽器算按鈕、標題的無障礙名稱時，會在每個 inline-block 前後補空白
 * （「嗯， 算是 吧。」），讀屏器和語音操控拿到的字就和畫面上的不一樣。
 *
 * 量法：先讓每個單位都不換行，照這樣排版（格線、彈性欄會照不拆的單位撐開或換列，和以前用不換行空白黏的時候一樣）。
 * 單位的字超出它所在的框，或再往外兩層的框（到絕對定位、可以捲動的框為止），就加 .fl-wrap；重排以後再看一次，
 * 直到沒有單位出框。內層的詞只有在外層已經拆開時才看。
 */
import { clearMenu } from './menuClear';

const ROOM_SLACK = 0.5;
const LEVELS = 3;
const ROUNDS = 6;

const flowOf = (e: Element) => {
  let x = e.parentElement;
  while (x && /^(inline|contents)$/.test(getComputedStyle(x).display)) x = x.parentElement;
  return x;
};

/** 這個單位的字是否超出它的框或外面兩層框的內寬。 */
function overflows(e: HTMLElement) {
  const r = e.getBoundingClientRect();
  if (!r.width) return false;
  let box = flowOf(e);
  for (let k = 0; box && box !== document.body && k < LEVELS; k++) {
    const cs = getComputedStyle(box);
    if (/auto|scroll/.test(cs.overflowX)) return false;
    const b = box.getBoundingClientRect();
    const n = (v: string) => parseFloat(v) || 0;
    const l = b.left + n(cs.borderLeftWidth) + n(cs.paddingLeft);
    const rr = b.right - n(cs.borderRightWidth) - n(cs.paddingRight);
    if (r.right > rr + ROOM_SLACK || r.left < l - ROOM_SLACK) return true;
    if (/absolute|fixed/.test(cs.position)) return false;
    box = flowOf(box);
  }
  return false;
}

export function fitUnits(root: ParentNode = document) {
  const all = [...root.querySelectorAll<HTMLElement>('.fl')];
  if (!all.length) return;
  for (const e of all) e.classList.remove('fl-wrap');
  for (let round = 0; round < ROUNDS; round++) {
    const open = all.filter((e) => {
      if (e.classList.contains('fl-wrap')) return false;
      const outer = e.parentElement?.closest('.fl');
      return !outer || outer.classList.contains('fl-wrap');
    });
    const wide = open.filter(overflows);
    if (!wide.length) return;
    for (const e of wide) e.classList.add('fl-wrap');
  }
}

/** 整個畫面：字換了、視窗或框的大小變了、字型載入了、字級換了，就重排一次。 */
export function watchUnits() {
  const run = () => {
    // 排不拆單位，再量選單鈕四周（換行會改變頂列的高；讓位以後那一列再排一次）。
    clearMenu(fitUnits);
    for (const e of document.querySelectorAll<HTMLElement>('.fl')) {
      const b = flowOf(e);
      if (b && !seen.has(b)) {
        seen.add(b);
        ro.observe(b);
      }
    }
  };
  const seen = new WeakSet<Element>();
  const ro = new ResizeObserver(() => run());
  ro.observe(document.documentElement);
  const touches = (n: Node | null) =>
    !!n &&
    (n instanceof Element
      ? n.matches('.fl') || !!n.querySelector('.fl') || !!n.closest('.fl')
      : !!n.parentElement?.closest('.fl'));
  // 換字是在 React 寫進畫面之後、瀏覽器畫出來之前（微任務），不會先閃一格擠出框的字。
  const mo = new MutationObserver((ms) => {
    if (ms.some((m) => touches(m.target) || [...m.addedNodes].some(touches))) run();
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  const fonts = () => run();
  document.fonts?.addEventListener('loadingdone', fonts);
  run();
  return () => {
    ro.disconnect();
    mo.disconnect();
    document.fonts?.removeEventListener('loadingdone', fonts);
  };
}
