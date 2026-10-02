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

/** 把對照表裝進來；樣板（含 {name}）另外編成正規表示式。測試也用這個。 */
export function install(entries: Catalog) {
  catalog = { ...catalog, ...entries };
  templates = Object.entries(catalog)
    .filter(([k]) => /\{\w+\}/.test(k) && !k.includes('::'))
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
  for (const t of templates) {
    const m = t.re.exec(zh);
    if (!m) continue;
    return t.names.reduce(
      (out, name, i) => out.split(`{${name}}`).join(translate(m[i + 1], scope)),
      t.out,
    );
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

const fill = (s: string, vars: Vars) =>
  Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), s);

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
