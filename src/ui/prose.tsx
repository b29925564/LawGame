import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
export function fitLine(text: string, titles = true): ReactNode {
  if (!HAN.test(text)) return text;
  return fitLineUnits(text, titles).map((w, i) =>
    [...w].length > 1 && w.trim() ? (
      <span key={i} className={titles && /^[〈《]/.test(w) ? 'kw kw-title' : 'kw'}>
        {w}
      </span>
    ) : (
      w
    ),
  );
}

/**
 * 黑底字卡的正文段落：fitLine，但篇名（〈給稽核部的說明_v3〉。）比正文欄還寬時不整段不拆，改在篇名裡的詞界斷
 * （第二道關卡 e771fcf 第 1 項：窄手機 150% 整段 351px、欄只有 312px，頁面被撐寬）。
 * 篇名整段的寬度用 em 記下來，換字級、換視窗寬度時拿來比，放得進就再整段不拆。
 */
export function FitLine({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [split, setSplit] = useState<string | null>(null);
  const whole = useRef<{ text: string; em: number } | null>(null);
  const isSplit = split === text;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !HAN.test(text)) return;
    const check = () => {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize) || 16;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const titles = [...el.querySelectorAll<HTMLElement>('.kw-title')];
      if (titles.length)
        whole.current = { text, em: Math.max(...titles.map((t) => t.offsetWidth)) / px };
      const w = whole.current?.text === text ? whole.current.em * px : 0;
      setSplit(w > room + 0.5 ? text : null);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    void document.fonts?.ready.then(check);
    return () => ro.disconnect();
  }, [text, isSplit]);
  return (
    <p ref={ref} className={className}>
      {fitLine(text, !isSplit)}
    </p>
  );
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
