import { Fragment, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
  const lines = useEnglishLines(ref, text);
  return (
    <p ref={ref} className={className}>
      {HAN.test(text)
        ? fitLine(text, !isSplit)
        : lines
          ? lines.map((l, i) => (
              <Fragment key={i}>
                {/* 行與行之間留一個空白：textContent、複製出來的字還是一句完整的話。 */}
                {i > 0 && ' '}
                {i > 0 && <br />}
                {l}
              </Fragment>
            ))
          : glueEnglish(text)}
    </p>
  );
}

/**
 * 不能斷的程度（重的先保）：超出欄寬 > 拆開內容裡用不換行空白黏好的地名 > 虛詞在行尾 > 單字行 > 專有名詞拆開。
 * 320 寬 150% 一行只放得下十七、八個字母，有幾張卡怎麼排都會違反一條，這時讓單字行先讓步（設計師 #326 審查）。
 */
const PEN_HARD = 1e7;
const PEN_END = 2e6;
const PEN_ONE = 1e6;
const PEN_NAME = 1e5;
const PEN_OVER = 1e9;

/**
 * 英文黑底字卡自己排行（設計師 #326 審查：「Tuesday evening, ⏎ east ⏎ Calder Harbor. A ⏎ white van…」）。
 * 量每個字的寬度（canvas，用段落的字型），在字與字之間挑換行點，讓每行盡量一樣長（最後一行不算），而且：
 * 不超出欄寬；不拆內容裡用不換行空白黏好的（east Calder Harbor）；行尾不留 a／an／the／of／to…（plateBreaks.ts 的表）；
 * 沒有只有一個字的行；連在一起的專有名詞不拆。真的放不下時，照上面的輕重讓步。
 * 量不到（沒有 canvas、還沒排版）時回傳 null，照 glueEnglish 交給瀏覽器排。
 */
export function englishLines(
  words: string[],
  hard: boolean[],
  width: (s: string) => number,
  room: number,
) {
  const n = words.length;
  const sp = width(' ');
  const ws = words.map(width);
  const cap = (x: string) => /^[A-Z]/.test(x);
  const name = (g: number) => cap(words[g]) && cap(words[g + 1]) && /[A-Za-z]$/.test(words[g]);
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    let w = -sp;
    for (let i = j - 1; i >= 0; i--) {
      w += ws[i] + sp;
      const one = i === j - 1;
      if (w > room && !one) break;
      let c = w > room ? PEN_OVER : j === n ? 0 : (room - w) ** 2;
      c += (room / 3) ** 2;
      if (one && n > 1) c += PEN_ONE;
      if (j < n) {
        const g = j - 1;
        // 黏好的地名裡，大寫開頭的兩個字（Calder Harbor）比前面的小寫修飾（east）更不能拆。
        if (hard[g]) c += name(g) ? 2 * PEN_HARD : PEN_HARD;
        if (endsBanned(words[g])) c += PEN_END;
        if (name(g)) c += PEN_NAME;
      }
      if (best[i] + c < best[j]) {
        best[j] = best[i] + c;
        from[j] = i;
      }
    }
  }
  const out: string[] = [];
  for (let j = n; j > 0; j = from[j]) {
    const i = from[j];
    out.unshift(words.slice(i, j).reduce((a, x, k) => a + (hard[i + k - 1] ? '\u00a0' : ' ') + x));
  }
  return out;
}

function useEnglishLines(ref: RefObject<HTMLElement | null>, text: string): string[] | null {
  const [got, setGot] = useState<{ text: string; lines: string[] } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || HAN.test(text)) return;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    const parts = text.split(/([ \u00a0])/);
    const words = parts.filter((_, i) => i % 2 === 0);
    const hard = parts.filter((_, i) => i % 2 === 1).map((x) => x === '\u00a0');
    const check = () => {
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (!(room > 0)) return;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in ctx)
        ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      // canvas 量的和排版只差零點幾 px（字距一起算）：留 1px，免得瀏覽器在行內再折一次（e2e 檢查畫出來的行數＝排的行數）。
      const lines = englishLines(words, hard, (s) => ctx.measureText(s).width, room - 1);
      setGot((g) =>
        g?.text === text && g.lines.join('\n') === lines.join('\n') ? g : { text, lines },
      );
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    void document.fonts?.ready.then(check);
    return () => ro.disconnect();
  }, [ref, text]);
  return got?.text === text ? got.lines : null;
}

/**
 * 英文黑底字卡的行尾（設計師 #326 審查）：
 * - a／an／the／of／to…（plateBreaks.ts 的 endsBanned，和定場字卡同一張表）用不換行空白黏住下一個字，不留在行尾。
 * - 連在一起的專有名詞（Calder Building、Ethan Shaw）不拆：兩個大寫開頭的字、前一個字後面沒有標點，就黏住。
 * - 最後兩個字黏住，最後一行不會只剩一個字。
 * 內容裡已經用不換行空白黏好的（east Calder Harbor）照原樣。
 */
export function glueEnglish(text: string): string {
  const w = text.split(' ');
  const cap = (x: string) => /^[A-Z]/.test(x);
  return w.reduce((out, x, i) => {
    if (i === 0) return x;
    const prev = w[i - 1];
    const glue =
      endsBanned(prev) || (cap(prev) && cap(x) && /[A-Za-z]$/.test(prev)) || i === w.length - 1;
    return out + (glue ? '\u00a0' : ' ') + x;
  });
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
