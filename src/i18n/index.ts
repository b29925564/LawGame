import { create } from 'zustand';

/**
 * 雙語：中文是原文，也是引擎和存檔裡唯一的字串；英文只在顯示時查表。
 * 英文對照表放在 src/content/en/*.yaml，key 是中文原句（或「場景id::中文原句」），
 * 含 {name} 的 key 是樣板。查不到就顯示中文，所以翻譯可以一場一場補。
 */
export type Lang = 'zh' | 'en';

type Catalog = Record<string, string>;
interface Template {
  re: RegExp;
  names: string[];
  out: string;
}

const KEY = 'lawgame-lang';
// 英文檔各自是延遲載入的 chunk，中文模式不下載。
const files = import.meta.glob<{ default: Catalog }>('../content/en/*.yaml');

let catalog: Catalog = {};
let templates: Template[] = [];
let loading: Promise<void> | null = null;

function stored(): Lang {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

export const useLang = create<{ lang: Lang }>(() => ({ lang: 'zh' }));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 兩個變數緊貼（「{verb}{name}」）沒辦法切開，編成正規表示式會吃下任何句子，所以不當樣板。 */
const ambiguous = (key: string) => /\}\{/.test(key);

/** 把對照表裝進來；樣板（含 {name}）另外編成正規表示式。測試也用這個。 */
export function install(entries: Catalog) {
  catalog = { ...catalog, ...entries };
  templates = Object.entries(catalog)
    .filter(([k]) => /\{\w+\}/.test(k) && !k.includes('::') && !ambiguous(k))
    .map(([k, out]) => {
      const names: string[] = [];
      const body = k
        .split(/(\{\w+\})/)
        .map((part) => {
          const m = /^\{(\w+)\}$/.exec(part);
          if (!m) return escape(part);
          names.push(m[1]);
          return '(.+?)';
        })
        .join('');
      return { re: new RegExp(`^${body}$`, 's'), names, out };
    });
}

/** 清空（測試用）。 */
export function reset() {
  catalog = {};
  templates = [];
  loading = null;
}

async function load() {
  loading ??= Promise.all(Object.values(files).map((f) => f())).then((mods) => {
    for (const m of mods) install(m.default);
  });
  return loading;
}

export async function setLang(lang: Lang) {
  if (lang === 'en') {
    try {
      await load();
    } catch {
      // 英文檔載不到（例如離線）就留在中文，下次再試。
      loading = null;
      return;
    }
  }
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // 沒有儲存空間就只在這一次有效。
  }
  useLang.setState({ lang });
}

/** 開機時照上次的選擇切語言。 */
export function restoreLang() {
  if (stored() === 'en') void setLang('en');
}

/** 查英文：先查「場景::原句」，再查原句，再套樣板；都沒有就回傳中文。 */
export function translate(zh: string, scope?: string): string {
  if (!zh) return zh;
  const hit = (scope && catalog[`${scope}::${zh}`]) ?? catalog[zh];
  if (hit !== undefined) return hit;
  // 「華特・班奈特・退休警察」：人名本身也有「・」，從最長的前段開始試，兩邊都查得到才算。
  // 要排在樣板前面，不然「{a}・{b}」會在第一個「・」就切開。
  for (let i = zh.lastIndexOf('・'); i > 0; i = zh.lastIndexOf('・', i - 1)) {
    const [a, b] = [zh.slice(0, i), zh.slice(i + 1)];
    const [ta, tb] = [translate(a, scope), translate(b, scope)];
    if (ta !== a && tb !== b) return `${ta} · ${tb}`;
  }
  for (const t of templates) {
    const m = t.re.exec(zh);
    if (!m) continue;
    return t.names.reduce((out, name, i) => put(out, name, translate(m[i + 1], scope)), t.out);
  }
  // 「邏輯、情感」這種清單逐項查。
  if (zh.includes('、')) {
    const parts = zh.split('、');
    const out = parts.map((x) => translate(x, scope));
    if (out.every((x, i) => x !== parts[i])) return out.join(', ');
  }
  return zh;
}

type Vars = Record<string, string | number>;

/** 英文句中要小寫的代入值（「Objection, hearsay.」）：樣板裡寫成 {name:lower}。 */
const lower = (v: string) => v.charAt(0).toLowerCase() + v.slice(1);
/**
 * 英文的單複數：{n:s} 在 n 不是 1 時補 s；{n:one|other} 照 n 是不是 1 挑一邊（「1 juror was」「3 jurors were」）。
 * 中文沒有單複數，key 不必改。
 */
const plural = (out: string, name: string, v: string) =>
  out
    .split(`{${name}:s}`)
    .join(v === '1' ? '' : 's')
    .replace(
      new RegExp(`\\{${name}:([^|{}]*)\\|([^{}]*)\\}`, 'g'),
      (_, one: string, other: string) => (v === '1' ? one : other),
    );
const put = (out: string, name: string, v: string) =>
  plural(out, name, v).split(`{${name}:lower}`).join(lower(v)).split(`{${name}}`).join(v);

const fill = (s: string, vars: Vars) =>
  Object.entries(vars).reduce((out, [k, v]) => put(out, k, String(v)), s);

/**
 * 依目前語言顯示一句。第二個參數是場景 id（劇本句子）或樣板變數（介面句子，key 寫成「辯方可以詰問{name}。」）。
 * 元件請用 useT()，切換語言時才會重畫。
 */
export function t(zh: string, arg?: string | Vars): string {
  return show(useLang.getState().lang, zh, arg);
}

function show(lang: Lang, zh: string, arg?: string | Vars): string {
  if (typeof arg === 'object') return fill(lang === 'en' ? (catalog[zh] ?? zh) : zh, arg);
  return lang === 'en' ? translate(zh, arg) : zh;
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return (zh: string, arg?: string | Vars) => show(lang, zh, arg);
}

/** 金額：中文用「萬」，英文用 $ 與 million。 */
export function money(n: number, lang: Lang): string {
  if (lang === 'en')
    // 精度跟中文一致：422.5 萬＝$4.225 million，不另外四捨五入。
    return n >= 1_000_000
      ? `$${+(n / 1_000_000).toFixed(3)} million`
      : `$${n.toLocaleString('en-US')}`;
  return `${+(n / 10_000).toFixed(1)} 萬`;
}

export function useMoney() {
  const lang = useLang((s) => s.lang);
  return (n: number) => money(n, lang);
}
