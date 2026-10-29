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
  // #246 r8：人名 ICU 都切成單字（「伊／森就叫了車」「伊森／的說法」）。台詞說話人裡的名字由 prose.test.ts 檢查，
  // 新角色上台詞時測試會指出要補哪個；不說話的（死者、證人）在這裡手動加。
  ...['伊森', '蘇菲', '沃斯', '葛蘭特', '奧瑪', '瑞秋', '盧卡斯', '羅根', '普萊斯', '馬庫斯'],
  ...['維多莉亞', '惠特洛克', '海爾', '莫羅', '潔德', '戴文', '奧卡福', '丹尼爾', '亞瑟', '凱瑟琳'],
  ...['崔佛', '林肯', '瑪莉索', '米爾斯', '維加', '艾德勒', '蘿莎', '赫克托', '卡爾德', '柯瓦斯基'],
  ...['普莉亞', '布魯克斯', '旁白', '語音', '法官', '法院系統', '卡爾德快遞'],
];
/** 開頭的「誰的說法：」「驗屍照片：」這種標籤，冒號前面不超過這麼多字就整組不拆，要斷斷在冒號後（#246 r8）。 */
const LABEL = 8;
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

/** 把字串切成「不換行的單位」：每個單位內部不斷開。labels 關掉時開頭的標籤（「伊森的說法：」）不併成一個單位（牌架卡名要在標籤中間也能斷）。 */
export function proseUnits(text: string, tail = true, labels = true): string[] {
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

  // 開頭的標籤（「伊森的說法：」）：到第一個冒號為止併成一個單位。
  // 標籤後面緊接的單字（「他／先」）併成一組，不讓一個字自己掛一行；末行的規則也不併進標籤，標籤後永遠可以斷。
  const colon = out.findIndex((x) => /[：:]$/.test(x));
  let label = 0;
  if (labels && colon > 0 && [...out.slice(0, colon + 1).join('')].length <= LABEL + 1) {
    out.splice(0, colon + 1, out.slice(0, colon + 1).join(''));
    label = 1;
    let j = 1;
    while (j < out.length && [...out[j]].length === 1 && HAN.test(out[j]) && j - 1 < SIDE) j++;
    if (j - 1 >= 2) out.splice(1, j - 1, out.slice(1, j).join(''));
  }

  // 末行至少四個漢字；黏起來的那一段不超過十四個全形字寬。
  if (tail) {
    let k = out.length - 1;
    while (
      k > label &&
      hanCount(out.slice(k).join('')) < MIN_TAIL &&
      ems(out.slice(k - 1).join('')) <= 14
    )
      k--;
    while (out[k] === ' ') k++;
    if (k < out.length - 1) out.splice(k, out.length - k, out.slice(k).join(''));
  }
  return out;
}

/** 牌架卡名的斷行單位：標點跟前一個詞（不放行首），沒有標點的單位。 */
export interface NameUnit {
  w: string;
  p: string;
}
/** 單獨一個字也可以當斷點的虛詞：牌架卡名裡其他的單字都是複合詞被 ICU 切開的碎片，要黏回去。 */
const FUNC = /^[的之與和及是在被他她它我你對都也就把給]$/;
/** 黏著前一個詞、不放行首的字。 */
const STICK = /^[的之了]$/;

/**
 * 牌架卡名（中文）的換行單位：proseUnits 的詞，加上
 * - 「的」「之」「了」黏前一個詞；
 * - ICU 把複合詞切成單字（派｜單、規格｜書、變更｜單、領｜過、起｜訴狀、費｜雪）：連續的單字（虛詞除外）併成一個詞；
 *   只剩一個單字的，黏後面那個詞（起訴狀），後面沒有或它自己帶標點（書：）就黏前面那個詞（規格書：）；
 * - 最後一個單字（疲勞鎖、一直都在）不自己掛一行，黏前一個詞。
 * 一個單位內部不斷開；字一個不少。
 */
export function nameUnits(text: string): NameUnit[] {
  const us: NameUnit[] = [];
  for (const u of proseUnits(text, false, false)) {
    const p = /[，。、；：！？…,.;:!?]+$/.exec(u)?.[0] ?? '';
    const w = u.slice(0, u.length - p.length);
    const prev = us[us.length - 1];
    if (prev && !prev.p && STICK.test(w)) {
      prev.w += w;
      prev.p = p;
    } else us.push({ w, p });
  }
  const one = (u: NameUnit) => [...u.w].length === 1 && HAN.test(u.w);
  const loose = (u: NameUnit) => one(u) && !FUNC.test(u.w);
  const out: NameUnit[] = [];
  for (let i = 0; i < us.length; i++) {
    if (!loose(us[i])) {
      out.push({ ...us[i] });
      continue;
    }
    // 一串連續的單字（標點結束這一串）。
    let j = i;
    while (j < us.length - 1 && loose(us[j]) && !us[j].p && loose(us[j + 1])) j++;
    const grp = us.slice(i, j + 1);
    const g: NameUnit = { w: grp.map((x) => x.w).join(''), p: grp[grp.length - 1].p };
    i = j;
    if (grp.length === 1) {
      const next = us[i + 1];
      if (!g.p && next) {
        out.push({ w: g.w + next.w, p: next.p });
        i++;
        continue;
      }
      const prev = out[out.length - 1];
      if (prev && !prev.p) {
        prev.w += g.w;
        prev.p = g.p;
        continue;
      }
    }
    out.push(g);
  }
  // 最後一個單字（含虛詞）黏前一個詞。
  const last = out[out.length - 1];
  const before = out[out.length - 2];
  if (last && before && !before.p && one(last)) {
    before.w += last.w;
    before.p = last.p;
    out.pop();
  }
  return out;
}
