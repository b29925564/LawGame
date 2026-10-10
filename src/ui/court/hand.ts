import type { CSSProperties } from 'react';

/**
 * 陪審長的手寫（設定集第 9 章 <VerdictForm>）：LXGW WenKai TC，clip-path 由左而右寫入，每字 --dur-hand（600ms）。
 * 「字」照漢字算；拉丁字母與數字一筆寫得比漢字快，三個算一個字，否則「$7,930,000」要寫六秒。
 * 空白不佔時間。打勾算一個字。
 */
export function inkUnits(s: string): number {
  let u = 0;
  for (const ch of s) {
    if (/\s/.test(ch)) continue;
    u += /[\p{Script=Han}\u3000-\u30ff\uff00-\uffef]/u.test(ch) ? 1 : 1 / 3;
  }
  return Math.round(u * 100) / 100;
}

/**
 * 依呼叫順序排一支筆：每一筆接在上一筆寫完、提筆一次（--dur-pen-lift）之後。
 * 第一筆在裁決書出現後 --dur-hand-lead（1.3 秒，設定集 10.5 ①「1.300 勾選」）落下。
 * 回傳的是 CSS 變數（字數、前面累計的字數、第幾筆），時間全由權杖換算，元件不寫毫秒。
 */
export function pen() {
  let at = 0;
  let k = 0;
  const next = (units: number): CSSProperties => {
    const style = { '--u': units, '--at': at, '--k': k } as CSSProperties;
    at += units;
    k += 1;
    return style;
  };
  /**
   * 最後一筆寫完的時間點（字數、提筆次數）：時間 = --dur-hand-lead + u × --dur-hand + lifts × --dur-pen-lift。
   * 下一拍在這之後再停 500ms 才切（設計師 #249 第 2 條）；一筆都沒寫就是 0。
   */
  next.end = () => ({ u: at, lifts: Math.max(0, k - 1), any: k > 0 });
  return next;
}
