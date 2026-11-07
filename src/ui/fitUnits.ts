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
 * 量法：先讓每個單位都能換行，量框的內寬（這時格線、彈性欄照字最窄的寬度排，框不會被不換行的字撐開）；
 * 再讓每個單位都不換行，量單位本身的寬；最後只有比框寬的單位加 .fl-wrap。
 */
const ROOM_SLACK = 0.5;

const flowOf = (e: HTMLElement) => {
  let x = e.parentElement;
  while (x && /^(inline|contents)$/.test(getComputedStyle(x).display)) x = x.parentElement;
  return x;
};

const roomOf = (b: HTMLElement) => {
  const cs = getComputedStyle(b);
  return b.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
};

export function fitUnits(root: ParentNode = document) {
  const all = [...root.querySelectorAll<HTMLElement>('.fl')];
  if (!all.length) return;
  // 1. 都能換行：量每個單位所在的框。
  for (const e of all) e.classList.add('fl-wrap');
  const rooms = new Map<HTMLElement, number>();
  const boxOf = new Map<HTMLElement, HTMLElement>();
  for (const e of all) {
    const b = flowOf(e);
    if (!b) continue;
    boxOf.set(e, b);
    if (!rooms.has(b)) rooms.set(b, roomOf(b));
  }
  // 2. 都不換行：量每個單位的寬。
  for (const e of all) e.classList.remove('fl-wrap');
  const widths = all.map((e) => e.getBoundingClientRect().width);
  // 3. 比框寬的才拆；裡面的詞只有外面那一層拆了才要看。
  const wide = new Set<HTMLElement>();
  all.forEach((e, i) => {
    const b = boxOf.get(e);
    if (!b || widths[i] <= rooms.get(b)! + ROOM_SLACK) return;
    const outer = e.parentElement?.closest<HTMLElement>('.fl');
    if (outer && all.includes(outer) && !wide.has(outer)) return;
    wide.add(e);
  });
  for (const e of wide) e.classList.add('fl-wrap');
}

/** 整個畫面：字換了、視窗或框的大小變了、字型載入了、字級換了，就重排一次。 */
export function watchUnits() {
  const run = () => {
    fitUnits();
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
