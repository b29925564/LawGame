import { Fragment, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { fitLineUnits, innerUnits, nameUnits, proseUnits } from './lineUnits';
import { NB, glueNames } from './enNames';
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

/**
 * 英文短行（眉標、手機框、按鈕）的 fitLine：專有名詞黏住；a／an／the／of／to…（plateBreaks.ts 的 endsBanned）黏住下一個字，
 * 不留在行尾（設計師裁定 a26de2b：「VP of ⏎ Operations」「still at the ⏎ office」）。其餘照瀏覽器在空白斷。
 */
/** 數字開頭的連字號複合字（"12th-floor"、"24-hour"）：數字＋單位，不在連字號換行（設計師第二道關卡 72a9003 裁定 6）。 */
const HYPHEN_NUM = /\d[\p{L}\d]*-\p{L}/u;
/** 數字和後面的單位黏在一起（"2 min"、"10 a.m."；設計師 v93 排字規則：數字＋單位不拆）。 */
const UNIT =
  /^(min|mins|minutes?|hours?|hrs?|days?|weeks?|months?|years?|seconds?|secs?|km|miles?|percent|%|am|pm|a\.m\.|p\.m\.)[.,;:!?)]*$/i;
const glued = (prev: string, x: string) =>
  endsBanned(prev) ||
  // 房號、庭號跟著前面的名詞（"Conference Room ⏎ A"；設計師第二道關卡 72a9003 裁定 6）。
  (/^[A-Z][a-z]+$/.test(prev) && /^(?:[A-Z]|\d{1,3})[,.;:]?$/.test(x)) ||
  /^[→←—–]$/.test(prev) ||
  ((/^\$?\d[\d,.:]*$/.test(prev) || NUM_EN.test(prev)) && UNIT.test(x));

export function fitLineEn(text: string): string {
  const w = glueNames(text).split(' ');
  // 最後兩個字黏住：沒有只剩一個字的最後一行（規則 4，"records ⏎ destroyed?"）；放不下時退路 B 照樣在中間拆。
  return w.reduce((out, x, i) =>
    i === 0 ? x : out + (glued(w[i - 1], x) || (i === w.length - 1 && w.length > 2) ? NB : ' ') + x,
  );
}

/** 引號裡的短篇名（"Note to Audit_v3."，四個字以內）黏成一段：放得下一行就整段不拆（設計師裁定 a26de2b）。 */
export const glueTitles = (text: string) =>
  text.replace(/([“"])([^”"]+)([”"])/g, (m, a: string, b: string, c: string) =>
    b.trim().split(/[ \u00a0]+/).length <= 4 ? a + b.replace(/ /g, NB) + c : m,
  );

/**
 * 一個不拆的單位（設計師裁定 4d80149 的排字規則，由重到輕：不出框 > 專有名詞和黏住的單位不拆 > 行尾不留虛詞 > 沒有單字行）：
 * 包成 inline-block、最寬是整行（styles.css .fl）。放得下就整段在同一行；比行寬還寬時（窄框、大字級）在單位內部的詞界拆（退路 B），
 * 不把字擠出框。內部的詞也是 .fl：一個詞本身就比行寬還寬時，中文才在字與字之間拆。
 */
const flZh = (w: string, key: number) => {
  const inner = innerUnits(w);
  // 最後一行至少三個字（設計師 v93 排字規則第 4 條）：句尾不到三個字（數字也算）的詞併進前一個詞，「盧卡斯的手機響｜了。」→「盧卡斯的｜手機響了。」。
  // 至少留兩段：只有兩個詞的專有名詞（第五｜法庭、卡爾德｜大樓）照詞界拆，不併成一段（併了放不下會在字中間斷）。
  const han = (x: string) => x.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  while (inner.length > 2 && han(inner[inner.length - 1]) < 3)
    inner.splice(-2, 2, inner[inner.length - 2] + inner[inner.length - 1]);
  return (
    <span key={key} className="fl">
      {inner.length > 1
        ? inner.map((x, i) =>
            [...x].length > 1 && x.trim() ? (
              <span key={i} className="fl">
                {x}
              </span>
            ) : (
              x
            ),
          )
        : w}
    </span>
  );
};

/** 英文黏住的一段（不斷行空格連起來的字）：內部再拆時，a／of／& 這些字仍跟著下一個字（「Whitlock & ⏎ Hale」→「Whitlock ⏎ & Hale」）。 */
const flEn = (g: string, key: number) => {
  const ws = g.split(NB);
  const chunks: string[] = [];
  ws.forEach((x, i) => {
    const prev = ws[i - 1];
    if (i > 0 && (glued(prev, x) || prev === '&')) chunks[chunks.length - 1] += NB + x;
    else chunks.push(x);
  });
  return (
    <span key={key} className="fl">
      {chunks.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          {c.includes(NB) && chunks.length > 1 ? (
            <span className="fl">{c.split(NB).join(' ')}</span>
          ) : (
            c.split(NB).join(' ')
          )}
        </Fragment>
      ))}
    </span>
  );
};

/**
 * 短標籤的排字（黑底字卡、手機框、眉標、場記行、卡片標頭、按鈕、泡泡、頂列；設計師裁定 4d80149 的 v93 範圍，全部走這一個）。
 * 中文：fitLineUnits 的每個單位；英文：fitLineEn 黏好的每一段。單位都包成 .fl（放不下時在內部的詞界拆，見 flZh／flEn）。
 */
export function fitLine(text: string, titles = true): ReactNode {
  if (!HAN.test(text)) {
    const groups = fitLineEn(text).split(' ');
    return groups.map((g, i) => (
      <Fragment key={i}>
        {i > 0 && ' '}
        {g.includes(NB) ? flEn(g, i) : HYPHEN_NUM.test(g) ? <span className="fl">{g}</span> : g}
      </Fragment>
    ));
  }
  return fitLineUnits(text, titles).map((w, i) =>
    [...w].length > 1 && w.trim() ? (
      titles && /^[〈《]/.test(w) ? (
        <span key={i} className="kw kw-title">
          {w}
        </span>
      ) : (
        flZh(w, i)
      )
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
  // 英文先黏專有名詞、引號裡的篇名，排行時當成不拆的（englishLines 的 hard）。
  const en = HAN.test(text) ? text : glueTitles(glueNames(text));
  const lines = useEnglishLines(ref, en);
  const zh = useChineseLines(ref, text);
  return (
    <p ref={ref} className={className}>
      {HAN.test(text)
        ? zh
          ? zh.map((l, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {/* 每一行還是 fitLine 的單位：量得和畫的差一點時，瀏覽器在單位之間折，不在字中間。 */}
                <span className="zh-line">{fitLine(l, !isSplit)}</span>
              </Fragment>
            ))
          : fitLine(text, !isSplit)
        : lines
          ? lines.map((l, i) => (
              <Fragment key={i}>
                {/* 行與行之間留一個空白：textContent、複製出來的字還是一句完整的話。 */}
                {i > 0 && ' '}
                {i > 0 && <br />}
                {l}
              </Fragment>
            ))
          : glueEnglish(en)}
    </p>
  );
}

/**
 * 中文黑底字卡自己排行（設計師第二道關卡 72a9003 裁定 1：#328 之後 22:31、23:14、17:52 比以前難讀）。
 * 換行單位是 fitLineUnits 的單位（專有名詞、虛詞收尾、數詞＋量詞都已黏好），在單位之間挑換行點，依序：
 * 1. 不出框、不拆單位（單位比一行還寬時才在它內部的詞界拆）；
 * 2. 每一行都至少 3 個字（標點不算），不只是最後一行；
 * 3. 行數最少；
 * 4. 行數一樣時，斷點先選句號後，再來逗號後，最後才是詞界。
 * 對照：23:14 排成「公車進站，又開走了。｜伊森沒有上車。」。量不到時回傳 null，交給瀏覽器照 fitLine 排。
 */
const ZH_OVER = 1e12;
const ZH_INNER = 1e10;
/** 行尾是虛詞（「一台沒｜登出」），或數詞＋量詞（「一台｜沒登出」）：前面三條規則照舊，比行數重。 */
const ZH_END = 1e9;
const ZH_TRAIL =
  /[的之與和及或在於對把被為從到以而並是我你他她它了著過沒不又也都就還再很]$|[一二兩三四五六七八九十百千幾半][台支行單個張件位隻輛本份條把杯次間棟層盞句封通頁步]$/u;
const ZH_SHORT = 1e8;
const ZH_LINE = 1e6;
const ZH_COMMA = 1e3;
const ZH_WORD = 2e3;
const zhLetters = (x: string) => x.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
export function chineseLines(text: string, width: (s: string) => number, room: number) {
  // 原子：單位；比一行還寬的單位拆成內部的詞（inner 標記那個切點是在單位裡面）。
  const atoms: string[] = [];
  const inner: boolean[] = [];
  for (const u of fitLineUnits(text, false)) {
    // 內部的詞還是比一行寬（極窄的欄）才拆成字：每個原子都放得進一行，排好的行才能整行不換行（.zh-line）。
    const parts = (width(u.trimEnd()) > room ? innerUnits(u) : [u]).flatMap((x) =>
      width(x.trimEnd()) > room ? [...x] : [x],
    );
    parts.forEach((x, k) => {
      if (k > 0) inner[atoms.length - 1] = true;
      atoms.push(x);
      inner.push(false);
    });
  }
  const n = atoms.length;
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++)
    for (let i = j - 1; i >= 0; i--) {
      const line = atoms.slice(i, j).join('');
      const w = width(line.trimEnd());
      if (w > room && i < j - 1) break;
      let c = ZH_LINE + (w > room ? ZH_OVER : 0);
      if (zhLetters(line) < 3) c += ZH_SHORT;
      if (j < n) {
        if (inner[j - 1]) c += ZH_INNER;
        const end = line.trimEnd();
        if (ZH_TRAIL.test(end)) c += ZH_END;
        c += /[。！？…」』]$/.test(end) ? 0 : /[，、；：）]$/.test(end) ? ZH_COMMA : ZH_WORD;
        // 同樣條件下兩行長度接近一點（遠小於上面每一級）。
        c += ((room - w) / room) ** 2;
      }
      if (best[i] + c < best[j]) {
        best[j] = best[i] + c;
        from[j] = i;
      }
    }
  const lines: string[] = [];
  for (let j = n; j > 0; j = from[j]) lines.unshift(atoms.slice(from[j], j).join(''));
  return lines;
}

function useChineseLines(ref: RefObject<HTMLElement | null>, text: string): string[] | null {
  const [got, setGot] = useState<{ text: string; lines: string[] } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !HAN.test(text)) return;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    const check = () => {
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (!(room > 0)) return;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in ctx)
        ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      // 中文字寬是整數（全形字＋字距），canvas 量的和排版一樣：剛好等於欄寬的一行放得下（「公車進站，又開走了。」360 寬 150% 正好 312px）。
      const lines = chineseLines(text, (x) => ctx.measureText(x).width, room + 0.25);
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
  const w = glueNames(text).split(' ');
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

const NUM_EN = /^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;
/**
 * 英文短標（頂列期限）：數字和後面的單位黏住（three weeks），a／in／of…（endsBanned）黏住下一個字，最後兩個字也黏住：
 * 行尾不留虛詞、最後一行不會只剩一個字（設計師裁定 25376da、#326 審查：「Pretrial｜hearing in｜three｜weeks」）。
 * 用不斷行空格，中文沒有半形空白，原樣不動。欄的最小寬度不小於黏住的最長一段（styles.css .due-text），所以不會凸出欄外。
 */
export function glueTail(text: string): string {
  const w = glueNames(text).split(' ');
  if (w.length < 2) return w.join(' ');
  // 冒號前的標籤（Discovery deadline:）整段黏住，放不下就整段換到下一行（設計師裁定 a26de2b）。
  const label = w.findIndex((x) => x.endsWith(':'));
  return w.reduce((out, x, i) => {
    if (i === 0) return x;
    const prev = w[i - 1];
    const glue =
      NUM_EN.test(prev) || endsBanned(prev) || i === w.length - 1 || (label <= 2 && i <= label);
    return out + (glue ? '\u00a0' : ' ') + x;
  });
}
