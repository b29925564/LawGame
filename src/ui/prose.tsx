import type { ReactNode } from 'react';
import { proseUnits } from './lineUnits';

const HAN = /\p{Script=Han}/u;

/** 紙面內文：多字的單位包成不換行的 span，單字和空白照常。 */
export function prose(text: string, tail = true): ReactNode {
  const u = proseUnits(text, tail);
  if (u.length === 1 && !HAN.test(text)) return text;
  return u.map((w, i) =>
    [...w].length > 1 && w.trim() ? (
      <span key={i} className="kw">
        {w}
      </span>
    ) : (
      w
    ),
  );
}
