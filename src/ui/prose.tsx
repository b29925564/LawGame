import type { ReactNode } from 'react';
import { fitLineUnits, nameUnits, proseUnits } from './lineUnits';

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
 * 幕名一個換行單位裡還能再斷的地方：ICU 的詞界，而且後面那一段至少兩個字
 * （「的」「之」「了」、標點和被切成單字的複合詞尾巴都黏前面：「已｜收回的」可以，「庭｜審」「第二｜天」不行）。
 */
function titleParts(unit: string): string[] {
  const out: string[] = [];
  for (const u of proseUnits(unit, false, false)) {
    const solo = [...u.replace(/[\p{P}\s]/gu, '')].length < 2;
    if (out.length && (solo || /^[的之了]/.test(u))) out[out.length - 1] += u;
    else out.push(u);
  }
  return out;
}

/**
 * 幕卡的幕名（9:16 直排）：牌架卡名的換行單位（lineUnits.ts 的 nameUnits：詞不拆、「的」「之」「了」黏前一個詞），
 * 一欄放不下時在詞界換到下一欄（「和解的｜價格」），不在詞中間斷。英文照常在空白斷。
 * 單位裡還有詞界的（「已｜收回的」）多包一層 .split：平常整個單位不斷，ActCard 的 fitPortrait 放不下時才打開。
 */
export function titleLine(text: string): ReactNode {
  if (!HAN.test(text)) return text;
  return nameUnits(text).map(({ w, p }, i) => {
    const u = w + p;
    if ([...u].length < 2) return u;
    const parts = titleParts(u);
    return parts.length > 1 ? (
      <span key={i} className="kw split">
        {parts.map(kw)}
      </span>
    ) : (
      kw(u, i)
    );
  });
}
