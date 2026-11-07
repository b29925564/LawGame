/**
 * 選單鈕四周留 8px（設計師 v93 排字規則 1，第二道關卡 72a9003 裁定 5：上下左右都算）。
 *
 * 選單鈕的寬高跟著字級變（150% 時比 40px 高、比 84px 寬），CSS 裡固定的讓位（84px、--menu-room、
 * 標頭那一行至少 44px 高）在大字級時不夠。這裡量實際的鈕：
 * 1. 和鈕同一條橫帶（鈕上下各 8px 之內）的頂列，字或有框的東西伸到鈕左邊 8px 之內，就把那一列的右內距加大，讓字換行。
 * 2. 頂列（.bench）的標頭那一行下面的第二列，若在鈕下面不到 8px，就把標頭那一行撐高，整列換到鈕下面（和期限那一格一樣）。
 * 每次先拿掉自己加的值、照沒讓位的寬重排一次再量，不會越加越多；加了右內距就把那一列重排一次（單位拆不拆照讓位後的寬），
 * 不會留下照舊寬拆開的專有名詞（「Assistant District ⏎ Attorney」）。
 */
const GAP = 8;
const SLACK = 0.5;

/** 和選單鈕同一條橫帶、右邊要讓位的頂列。 */
const SIDE = [
  '.scene > .eyebrow:first-child',
  '.bench > .eyebrow',
  '.taskbar',
  '.plead .judge',
  '.vdict .hero',
  '.vdict .hero .ey',
  '.board-one .wb-head',
  // 定場還沒有場景圖時左上角的「待放 3D 機位・定場」（設計師 關卡 72a9003：320 英文 125／150% 碰到、被切到選單鈕）。
  '.place-tbd',
].join(', ');
/** 頂列的第一行：下面一列要在鈕下面 8px 以外。 */
const TOP = '.bench > .eyebrow';

type Box = { left: number; top: number; right: number; bottom: number };

/** 一個元素裡看得到的東西：每一行字，加上有框或有底色的元素（借據膠囊、信心條）。 */
function inkOf(root: Element): Box[] {
  const out: Box[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!n.textContent?.trim() || !p) continue;
    const cs = getComputedStyle(p);
    if (cs.visibility === 'hidden' || cs.clipPath.includes('inset(50%)')) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    for (const b of r.getClientRects()) if (b.width > 0.5 && b.height > 0.5) out.push(b);
  }
  for (const e of root.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    const border =
      parseFloat(cs.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor);
    const fill = !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor);
    if (!border && !fill) continue;
    const b = e.getBoundingClientRect();
    if (b.width > 0.5 && b.height > 0.5) out.push(b);
  }
  return out;
}

/** fit：排不拆單位（fitUnits），傳進來是為了不互相 import。 */
export function clearMenu(fit: (root?: ParentNode) => void) {
  const mt = document.querySelector('.menu-toggle');
  const sides = [...document.querySelectorAll<HTMLElement>(SIDE)];
  const tops = [...document.querySelectorAll<HTMLElement>(TOP)];
  for (const e of sides) {
    e.style.removeProperty('padding-right');
    e.style.removeProperty('max-width');
  }
  for (const e of tops) e.style.removeProperty('min-height');
  fit();
  if (!mt || mt.closest('[hidden]')) return;
  const m = mt.getBoundingClientRect();
  if (!m.width) return;
  const band = (b: Box) => b.top < m.bottom + GAP && b.bottom > m.top - GAP;
  // 1. 右邊讓位：加大右內距，字換行以後再量一次（換行會改變哪幾行在橫帶裡）。
  for (const e of sides) {
    for (let round = 0; round < 4; round++) {
      const over = Math.max(
        0,
        ...inkOf(e)
          .filter(band)
          .map((b) => b.right - (m.left - GAP)),
      );
      if (over <= SLACK) break;
      const cs = getComputedStyle(e);
      if (/absolute|fixed/.test(cs.position)) {
        // 絕對定位、寬度照字長的框（定場的占位字）：加內距只會把框撐寬，改成限制最寬多少。
        const r = e.getBoundingClientRect();
        e.style.maxWidth = `${Math.max(0, r.width - Math.ceil(over))}px`;
      } else {
        // 先讓內容框的右緣停在鈕左邊 8px（固定的目標，不因為不換行的單位伸出框就越加越多，
        // 「Whitlock & ⏎ Hale」就是這樣被擠拆的）；內容框已經到位、字還伸出來，才再往內加。
        const pad = parseFloat(cs.paddingRight) || 0;
        const r = e.getBoundingClientRect();
        const contentRight = r.right - (parseFloat(cs.borderRightWidth) || 0) - pad;
        const short = contentRight - (m.left - GAP);
        e.style.paddingRight = `${pad + Math.ceil(short > SLACK ? short : over)}px`;
      }
      fit(e);
    }
  }
  // 2. 第二列換到鈕下面：只看橫向和鈕（左右各 8px）重疊的東西。
  for (const e of tops) {
    const below: Box[] = [];
    const floor = e.getBoundingClientRect().bottom - 1;
    for (let s = e.nextElementSibling; s; s = s.nextElementSibling) below.push(...inkOf(s));
    // 寬螢幕的頂列是同一行（標頭旁邊就是信心條），只管真的排在標頭下面的那一列。
    const hit = below.filter(
      (b) => b.top >= floor && b.right > m.left - GAP && b.left < m.right + GAP,
    );
    if (!hit.length) continue;
    const top = Math.min(...hit.map((b) => b.top));
    const short = m.bottom + GAP - top;
    if (short <= SLACK) continue;
    e.style.minHeight = `${e.getBoundingClientRect().height + Math.ceil(short)}px`;
  }
}
