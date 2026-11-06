import type { ReactNode } from 'react';
import { fitLineUnits, proseUnits } from './lineUnits';

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
