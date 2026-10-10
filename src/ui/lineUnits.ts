/**
 * 中文的換行單位（設計師 P2-6 r2 第 4、12 條）；紙面內文（prose.tsx）和陪審團速寫卡（sketch/pastel.ts）共用：
 * - 詞不斷開：用瀏覽器內建的中文斷詞（Intl.Segmenter，ICU 詞典）切成詞，詞與詞之間才換行。
 *   CSS 的 text-wrap: pretty 在中文上不管詞，量過沒有效果。
 * - 譯名（「惠特洛克・海爾」「伊森・蕭」）ICU 會切成單字：以「・」為中心，往兩邊各吃相鄰的一個詞，
 *   再吃連續的單字，每邊最多四個字。
 * - 標點跟著前一個詞（不放行首），開括號跟著後一個詞（不放行尾）；line-break: strict 管其餘的情況。
 * - 不留一兩個字的末行：最後幾個詞黏在一起，直到至少四個漢字。
 * 沒有漢字的字串（英文）原樣回傳：英文本來就只在空白斷。
 */

const HAN = /\p{Script=Han}/u;
const hanCount = (s: string) => [...s].filter((c) => HAN.test(c)).length;
/** 粗估寬度（全形字 = 1）：拉丁字母、數字、半形標點算半個。 */
const ems = (s: string) => [...s].reduce((n, c) => n + (c <= '\u024f' ? 0.55 : 1), 0);
/** 不放行首的標點（line-break: strict 的那一組，加上「・」）。 */
const NO_START = /^[，。、；：！？）」』〕》〉…‥・％,.;:!?)\]]+$/;
/** 不放行尾的開括號。 */
const NO_END = /^[（「『〔《〈([]+$/;
/**
 * 例外詞表：ICU 會切開，但在本作裡要當一個詞。設計師點名的都放這裡，以後遇到再補
 * （P2-6 r2：「惠特洛克・海爾律師事務所」「智慧手錶」；r3 第 6 條：「腕上」「當庭」；r5：「檢方」）。
 */
const KEEP = [
  '惠特洛克・海爾律師事務所',
  '智慧手錶',
  '健康手錶',
  '辯護人',
  '腕上',
  '當庭',
  // #225 第三輪：法庭、結辯、判決、調解的內文裡被拆開的詞。
  '評議',
  '最後',
  '繼續',
  '問題',
  '桌機',
  '月曆',
  // P2-6 r5：手機聲請便條說明裡的「檢方」。
  '檢方',
];
const MIN_TAIL = 4;
const SIDE = 4;

const seg =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('zh-Hant', { granularity: 'word' })
    : null;

function words(text: string): string[] {
  if (!seg) return [...text];
  return Array.from(seg.segment(text), (s) => s.segment);
}

/** 把字串切成「不換行的單位」：每個單位內部不斷開。 */
export function proseUnits(text: string, tail = true): string[] {
  if (!HAN.test(text)) return [text];
  let u = words(text);

  // 本作的固定詞：在原字串裡的位置對齊到詞的邊界，整段併成一個。
  for (const k of KEEP) {
    for (let at = text.indexOf(k); at >= 0; at = text.indexOf(k, at + k.length)) {
      const from = at + k.length;
      let pos = 0;
      let a = -1;
      let b = -1;
      for (let i = 0; i < u.length; i++) {
        if (pos <= at && at < pos + u[i].length) a = i;
        if (pos < from && from <= pos + u[i].length) b = i;
        pos += u[i].length;
      }
      if (a >= 0 && b > a) u = [...u.slice(0, a), u.slice(a, b + 1).join(''), ...u.slice(b + 1)];
    }
  }

  // 譯名：以「・」為中心往兩邊吃。
  for (let i = 0; i < u.length; i++) {
    if (u[i] !== '・') continue;
    const take = (dir: -1 | 1) => {
      let j = i + dir;
      let n = 0;
      let first = true;
      while (j >= 0 && j < u.length && HAN.test(u[j])) {
        const len = [...u[j]].length;
        if (!first && (len > 1 || n + len > SIDE)) break;
        n += len;
        first = false;
        j += dir;
      }
      return j - dir;
    };
    const a = take(-1);
    const b = take(1);
    u = [...u.slice(0, a), u.slice(a, b + 1).join(''), ...u.slice(b + 1)];
    i = a;
  }

  // 標點黏前一個、開括號黏後一個、拉丁字母與數字連成一串（「No. 26-0315-088」「1 支」不拆）。
  const out: string[] = [];
  let carry = '';
  const latin = (x: string) => /^[A-Za-z0-9.,:;/+#%&'’-]+$/.test(x);
  for (const w of u) {
    const prev = out.length - 1;
    if (prev >= 0 && !carry && latin(w) && /[A-Za-z0-9.,:;/+#%&'’-]$/.test(out[prev]))
      out[prev] += w;
    else if (NO_START.test(w) && prev >= 0) out[prev] += w;
    else if (NO_END.test(w)) carry += w;
    else {
      out.push(carry + w);
      carry = '';
    }
  }
  if (carry) out.push(carry);
  // 「No.」和後面的號碼、數字和量詞、單字標籤和號碼（「項 3」）：中間的空白不斷開（包在同一個不換行的單位裡）。
  const bare = (x: string) => x.replace(/[^\p{L}\p{N}]/gu, '');
  const num = (x: string) => /^\d+$/.test(bare(x));
  const one = (x: string) => [...bare(x)].length === 1 && HAN.test(x);
  for (let i = out.length - 2; i > 0; i--) {
    if (out[i] !== ' ') continue;
    const a = out[i - 1];
    const b = out[i + 1];
    if (/(?:^|\s)No\.$/.test(a) || (num(a) && one(b)) || (one(a) && num(b)))
      out.splice(i - 1, 3, a + ' ' + b);
  }

  // 末行至少四個漢字；黏起來的那一段不超過十四個全形字寬。
  if (tail) {
    let k = out.length - 1;
    while (
      k > 0 &&
      hanCount(out.slice(k).join('')) < MIN_TAIL &&
      ems(out.slice(k - 1).join('')) <= 14
    )
      k--;
    while (out[k] === ' ') k++;
    if (k < out.length - 1) out.splice(k, out.length - k, out.slice(k).join(''));
  }
  return out;
}
