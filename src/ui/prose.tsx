import type { ReactNode } from 'react';
import { fitLineUnits, nameUnits, proseUnits } from './lineUnits';
import { endsBanned } from './plateBreaks';

const HAN = /\p{Script=Han}/u;
/** 編號（D-2、26-0315-088、No. 26-0315-088、案號、Bates）：整組不斷開（設計師 P2-6 r3 第 1 條）。 */
const CODE = /((?:No\. )?\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b)/;

const kw = (w: string, key: number) => (
  <span key={key} className="kw">
    {w}
  </span>
);

/** 紙面內文：多字的單位包成不換行的 span，單字和空白照常。英文只包編號。 */
export function prose(text: string, tail = true): ReactNode {
  if (!HAN.test(text)) {
    const parts = text.split(CODE);
    return parts.length === 1 ? text : parts.map((x, i) => (i % 2 ? kw(x, i) : x));
  }
  return proseUnits(text, tail).map((w, i) => ([...w].length > 1 && w.trim() ? kw(w, i) : w));
}

/** 黑底字卡的正文（fitLine 規則，lineUnits.ts 的 fitLineUnits）：每個單位包成不換行的 span。英文照常在空白斷。 */
export function fitLine(text: string): ReactNode {
  if (!HAN.test(text)) return text;
  return fitLineUnits(text).map((w, i) => ([...w].length > 1 && w.trim() ? kw(w, i) : w));
}

/**
 * 幕卡的幕名。中文（9:16 直排）：牌架卡名的換行單位（lineUnits.ts 的 nameUnits：詞不拆、「的」「之」「了」黏前一個詞），
 * 一欄放不下時在詞界換到下一欄（「和解的｜價格」），不在詞中間斷。
 * 英文：行尾不留 a／an／the／of／to…（plateBreaks.ts 的 endsBanned，和定場字卡同一張表）：這些字和下一個字之間用不換行空白，
 * 「The Price of Settlement」只能斷成「The Price｜of Settlement」（設計師 #324）。
 */
export function titleLine(text: string): ReactNode {
  if (!HAN.test(text)) {
    const words = text.split(' ');
    return words.map((w, i) => (i ? (endsBanned(words[i - 1]) ? '\u00a0' : ' ') : '') + w).join('');
  }
  return nameUnits(text).map(({ w, p }, i) => ([...(w + p)].length > 1 ? kw(w + p, i) : w + p));
}
